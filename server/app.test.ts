import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import { createApp } from './app.js';
import { DEFAULT_SOURCE_ROOT, sha256 } from './catalog.js';
import type { Bootstrap, CaptureResult, Deduction } from '../shared/contracts.js';

async function start(t: TestContext, dataDir?: string, enableFaults = false, sourceRoot?: string) {
  const owned = !dataDir, dir = dataDir || mkdtempSync(resolve(tmpdir(), 'ridgeline-api-test-'));
  const server: Server = createApp({ dataDir: dir, enableFaults, sourceRoot }).listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => { await new Promise<void>((r, reject) => { server.close(error => error ? reject(error) : r()); server.closeAllConnections(); }); if (owned) rmSync(dir, { recursive: true, force: true }); });
  return { dir, request: (path: string, init?: RequestInit) => fetch(base + path, init) };
}
const originalPath = resolve(DEFAULT_SOURCE_ROOT, 'ridgeline-sample-pack/base-pack/bol/RS-417652.pdf');
const sourceBytes = readFileSync(originalPath);
async function captureBytes(label = 'test capture'): Promise<Buffer> {
  const pdf = await PDFDocument.load(sourceBytes); pdf.setSubject(label); return Buffer.from(await pdf.save());
}
const upload = (bytes: Buffer, operationId = 'test-operation', source = 'bol-RS-417652'): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Operation-Id': operationId, 'X-Source-Document-Id': source }, body: new Uint8Array(bytes) });
function unzip(bytes: Buffer): Record<string, Buffer> {
  const result = spawnSync('python3', ['-c', 'import sys,io,zipfile,json,base64\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nassert z.testzip() is None\nprint(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))'], { input: bytes, maxBuffer: 20 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr.toString());
  return Object.fromEntries(Object.entries(JSON.parse(result.stdout.toString()) as Record<string, string>).map(([name, b64]) => [name, Buffer.from(b64, 'base64')]));
}

test('indexes all samples, joins invoice and PO, serves only registered documents', async t => {
  const api = await start(t), boot = await (await api.request('/api/bootstrap')).json() as Bootstrap;
  assert.equal(boot.sampleDate, '2026-10-01'); assert.equal(boot.shipments.length, 40); assert.equal(boot.deductions.length, 12);
  const docs = boot.shipments.flatMap(s => s.documents);
  for (const [kind, count] of [['bol', 40], ['invoice', 40], ['scan', 25]]) assert.equal(docs.filter(d => d.kind === kind).length, count);
  for (const d of boot.deductions) {
    const s = boot.shipments.find(s => s.id === d.shipmentId)!; assert.ok(s); assert.equal(d.invoiceNo, s.invoiceNo); assert.equal(d.customerPo, s.customerPo);
    assert.equal(d.evidenceState, s.documents.some(d => d.kind === 'scan') ? 'available' : 'missing');
  }
  const response = await api.request('/api/documents/bol-RS-417652'); assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), sourceBytes);
  assert.equal((await api.request('/api/documents/not-registered')).status, 404);
  assert.equal((await api.request('/api/documents/%2e%2e%2fpackage.json')).status, 404);
});

test('concurrent retries converge, receipt and bytes survive app restart', async t => {
  const api = await start(t), bytes = await captureBytes();
  const responses = await Promise.all([api.request('/api/shipments/RS-417652/captures', upload(bytes)), api.request('/api/shipments/RS-417652/captures', upload(bytes))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 201]);
  const first = await responses[0].json() as CaptureResult, second = await responses[1].json() as CaptureResult;
  assert.deepEqual(first, second); assert.equal(first.receipt.sha256, sha256(bytes)); assert.equal(first.receipt.bytes, bytes.length);
  assert.equal(readdirSync(resolve(api.dir, 'captures')).filter(n => !n.startsWith('.')).length, 1);
  const restarted = await start(t, api.dir), replay = await restarted.request('/api/shipments/RS-417652/captures', upload(bytes));
  assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), first);
  assert.deepEqual(Buffer.from(await (await restarted.request(first.capture.url)).arrayBuffer()), bytes);
  assert.deepEqual(readFileSync(originalPath), sourceBytes);
});

test('rejects source mismatch, operation conflict, malformed PDF and oversized upload', async t => {
  const api = await start(t), bytes = await captureBytes(), path = '/api/shipments/RS-417652/captures';
  assert.equal((await api.request(path, upload(bytes, 'bad-source', 'bol-RS-417620'))).status, 409);
  assert.equal((await api.request(path, upload(bytes, 'bad-source', 'invoice-INV-2104464'))).status, 409);
  assert.equal((await api.request(path, upload(Buffer.from('%PDF-not valid' + 'x'.repeat(200) + '%%EOF'), 'bad-pdf'))).status, 400);
  assert.equal((await api.request(path, upload(Buffer.alloc(13 * 1024 * 1024), 'large-pdf'))).status, 413);
  assert.equal((await api.request(path, upload(readFileSync(resolve(DEFAULT_SOURCE_ROOT, 'ridgeline-sample-pack/base-pack/bol/RS-417620.pdf')), 'wrong-pdf'))).status, 409);
  assert.equal((await api.request(path, upload(bytes, 'same-op'))).status, 201);
  assert.equal((await api.request(path, upload(await captureBytes('other content'), 'same-op'))).status, 409);
});

test('assessment validates source/page and persists; packet keeps originals and labels demo bytes', async t => {
  const api = await start(t), bytes = await captureBytes();
  const captured = await (await api.request('/api/shipments/RS-417652/captures', upload(bytes))).json() as CaptureResult;
  const put = (body: unknown) => api.request('/api/deductions/CHB-0899904/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const body of [{ status: 'approved', note: 'No' }, { status: 'ready', note: '' }, { status: 'ready', note: 'Review', sourceDocumentId: 'bol-RS-417620', pageNumber: 1 }, { status: 'ready', note: 'Review', sourceDocumentId: 'scan-RS-417652', pageNumber: 2 }, { status: 'ready', note: 'Review', pageNumber: 1 }]) assert.equal((await put(body)).status, 400);
  const note = 'Pickup and consignee acknowledgement differ. Historical scan requires human quantity review.';
  const saved = await (await put({ status: 'investigate', note, sourceDocumentId: 'scan-RS-417652', pageNumber: 1 })).json();
  const restarted = await start(t, api.dir), d = await (await restarted.request('/api/deductions/CHB-0899904')).json() as Deduction;
  assert.deepEqual(d.assessment, saved); assert.equal(d.evidenceState, 'available');
  const packet = await restarted.request('/api/deductions/CHB-0899904/packet'); assert.equal(packet.status, 200);
  const files = unzip(Buffer.from(await packet.arrayBuffer())); assert.deepEqual(files['original-evidence/RS-417652.pdf'], sourceBytes);
  assert.deepEqual(files['original-evidence/P10_RS-417652_20260707.pdf'], readFileSync(resolve(DEFAULT_SOURCE_ROOT, 'ridgeline-sample-pack/base-pack/dock_scans/P10_RS-417652_20260707.pdf')));
  const demoPath = Object.keys(files).find(n => n.startsWith('demo-pickup/'))!; assert.ok(demoPath); assert.deepEqual(files[demoPath], bytes);
  assert.match(files['summary.txt'].toString(), /NEW DEMO PICKUP/); assert.match(files['summary.txt'].toString(), /not a submitted or accepted retailer dispute/);
  const manifest = JSON.parse(files['manifest.json'].toString()); assert.equal(manifest.deduction.assessment.note, note);
  const demo = manifest.documents.find((d: {id:string}) => d.id === captured.capture.id); assert.equal(demo.sourceDocumentId, 'bol-RS-417652'); assert.deepEqual(demo.receipt, captured.receipt);
  for (const doc of manifest.documents) assert.equal(sha256(files[doc.archivePath]), doc.sha256);
});

test('multiple assessment citations survive restart and reach both packet formats', async t => {
  const api = await start(t);
  const citations = [
    { sourceDocumentId: 'bol-RS-417652', pageNumber: 1 },
    { sourceDocumentId: 'invoice-INV-2104464', pageNumber: 1 },
    { sourceDocumentId: 'scan-RS-417652', pageNumber: 1 },
  ];
  const response = await api.request('/api/deductions/CHB-0899904/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'investigate', note: 'Compare quantities across all three supplied sources.', citations }) });
  assert.equal(response.status, 200);
  const saved = await response.json(); assert.deepEqual(saved.citations, citations);
  assert.equal(saved.sourceDocumentId, citations[0].sourceDocumentId);
  const restarted = await start(t, api.dir);
  assert.deepEqual((await (await restarted.request('/api/deductions/CHB-0899904')).json()).assessment.citations, citations);
  const files = unzip(Buffer.from(await (await restarted.request('/api/deductions/CHB-0899904/packet')).arrayBuffer()));
  assert.deepEqual(JSON.parse(files['manifest.json'].toString()).deduction.assessment.citations, citations);
  for (const citation of citations) assert.ok(files['summary.txt'].toString().includes(`Source: ${citation.sourceDocumentId} | Page: 1`));
});

test('each citation is validated, and removing every source clears legacy aliases', async t => {
  const api = await start(t), path = '/api/deductions/CHB-0899904/assessment';
  const put = (citations: unknown) => api.request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'needs-evidence', note: 'Sources require review.', citations }) });
  const first = { sourceDocumentId: 'bol-RS-417652', pageNumber: 1 };
  for (const citations of [null, {}, [null], [first, first], [first, { sourceDocumentId: 'bol-RS-417620', pageNumber: 1 }], [first, { sourceDocumentId: 'scan-RS-417652', pageNumber: 2 }], [{ sourceDocumentId: first.sourceDocumentId, pageNumber: 0 }], [{ sourceDocumentId: first.sourceDocumentId, pageNumber: '1' }]]) {
    assert.equal((await put(citations)).status, 400, JSON.stringify(citations));
  }
  assert.equal((await put([first])).status, 200);
  const cleared = await (await put([])).json();
  assert.deepEqual(cleared.citations, []); assert.equal(cleared.sourceDocumentId, undefined); assert.equal(cleared.pageNumber, undefined);
});

test('fault is disabled by default; enabled failure stores nothing and retry works', async t => {
  const ordinary = await start(t); assert.equal((await ordinary.request('/api/demo/fail-next-upload', { method: 'POST' })).status, 404);
  const api = await start(t, undefined, true), bytes = await captureBytes();
  assert.equal((await api.request('/api/demo/fail-next-upload', { method: 'POST' })).status, 200);
  assert.equal((await api.request('/api/shipments/RS-417652/captures', upload(bytes))).status, 503);
  assert.equal(readdirSync(resolve(api.dir, 'captures')).length, 0);
  assert.equal((await api.request('/api/shipments/RS-417652/captures', upload(bytes))).status, 201);
});

test('packet separates the three workflow statuses from legacy follow-up reasons', async t => {
  const api = await start(t);
  const packet = async () => {
    const response = await api.request('/api/deductions/CHB-0899904/packet');
    assert.equal(response.status, 200);
    const files = unzip(Buffer.from(await response.arrayBuffer()));
    assert.deepEqual(files['original-evidence/RS-417652.pdf'], sourceBytes);
    return { summary: files['summary.txt'].toString(), manifest: JSON.parse(files['manifest.json'].toString()) };
  };
  const unreviewed = await packet();
  assert.match(unreviewed.summary, /Status: Not reviewed/);
  assert.doesNotMatch(unreviewed.summary, /Follow-up reason:/);
  assert.deepEqual(unreviewed.manifest.caseStatus, { value: 'not-reviewed', label: 'Not reviewed' });
  for (const [status, label, reason] of [
    ['needs-evidence', 'Needs follow-up', 'Missing evidence'],
    ['investigate', 'Needs follow-up', 'Unresolved discrepancy'],
    ['ready', 'Ready for handoff', undefined],
  ] as const) {
    const response = await api.request('/api/deductions/CHB-0899904/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: 'Status flow check: ' + status, sourceDocumentId: 'scan-RS-417652', pageNumber: 1 }) });
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.status, status, 'Persisted IDs remain compatible.');
    const exported = await packet();
    assert.ok(exported.summary.includes('Status: ' + label));
    assert.equal(exported.manifest.caseStatus.label, label);
    assert.deepEqual(exported.manifest.deduction.assessment, saved);
    if (reason) {
      assert.ok(exported.summary.includes('Follow-up reason: ' + reason));
      assert.equal(exported.manifest.caseStatus.followUpReason, reason);
    } else {
      assert.doesNotMatch(exported.summary, /Follow-up reason:/);
      assert.equal(exported.manifest.caseStatus.followUpReason, undefined);
    }
  }
  assert.equal((await api.request('/api/deductions/CHB-0899904/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'follow-up', note: 'Reason has not been chosen.' }) })).status, 400);
});

test('demo capture preserves missing historical state; reset removes generated records only', async t => {
  const api = await start(t), before = await (await api.request('/api/deductions/CHB-0912707')).json() as Deduction;
  assert.equal(before.evidenceState, 'missing');
  const path = resolve(DEFAULT_SOURCE_ROOT, 'ridgeline-sample-pack/base-pack/bol/RS-417741.pdf'), source = readFileSync(path);
  const doc = await PDFDocument.load(source); doc.setSubject('New reenactment'); const bytes = Buffer.from(await doc.save());
  const capture = await (await api.request('/api/shipments/RS-417741/captures', upload(bytes, 'missing-scan-operation', 'bol-RS-417741'))).json() as CaptureResult;
  const after = await (await api.request('/api/deductions/CHB-0912707')).json() as Deduction;
  assert.equal(after.evidenceState, 'missing'); assert.equal(after.assessment, null); assert.equal(after.documents.length, before.documents.length + 1);
  assert.equal((await api.request('/api/deductions/CHB-0912707/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'needs-evidence', note: 'No historical scan supplied.' }) })).status, 200);
  assert.equal((await api.request('/api/demo/reset', { method: 'POST' })).status, 200); assert.equal((await api.request(capture.capture.url)).status, 404);
  const reset = await (await api.request('/api/deductions/CHB-0912707')).json() as Deduction; assert.equal(reset.assessment, null); assert.deepEqual(reset.documents, before.documents);
  assert.deepEqual(readFileSync(originalPath), sourceBytes); assert.deepEqual(readFileSync(path), source);
  const restarted = await start(t, api.dir), boot = await (await restarted.request('/api/bootstrap')).json() as Bootstrap;
  assert.equal(boot.shipments.flatMap(s => s.documents).filter(d => d.kind === 'demo-pickup').length, 0);
});

test('refuses to place runtime state inside original samples', () => {
  assert.throws(() => createApp({ dataDir: resolve(DEFAULT_SOURCE_ROOT, 'would-delete-source') }), /separate/);
});


test('surfaces invoice/PO conflicts and changed source identity instead of silently matching', async t => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'ridgeline-source-fixture-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  for (const folder of ['ridgeline-sample-pack', 'ridgeline-followup-ar-documents']) cpSync(resolve(DEFAULT_SOURCE_ROOT, folder), resolve(fixture, folder), { recursive: true });
  const deductionCsv = resolve(fixture, 'ridgeline-followup-ar-documents/discovery-pack/retailer_deductions_export.csv');
  writeFileSync(deductionCsv, readFileSync(deductionCsv, 'utf8').replace('BR401070267', 'BR-WRONG-PO'));
  appendFileSync(resolve(fixture, 'ridgeline-sample-pack/base-pack/bol/RS-417652.pdf'), '\n');
  const api = await start(t, undefined, false, fixture);
  const conflict = await (await api.request('/api/deductions/CHB-0912707')).json() as Deduction;
  assert.equal(conflict.evidenceState, 'mismatch'); assert.ok(conflict.matchWarnings.some(w => w.includes('PO differs')));
  const changed = await (await api.request('/api/deductions/CHB-0899904')).json() as Deduction;
  assert.equal(changed.evidenceState, 'mismatch'); assert.ok(changed.matchWarnings.some(w => w.includes('differs from identity audit')));
  assert.deepEqual(readFileSync(originalPath), sourceBytes);
});


test('reopens durable capture bytes when runtime state is in a dot-prefixed .data directory', async t => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'ridgeline-dotdata-'));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const api = await start(t, resolve(fixture, '.data')), bytes = await captureBytes('SDK export under hidden runtime state');
  const uploadResponse = await api.request('/api/shipments/RS-417652/captures', upload(bytes, 'dotdata-operation'));
  assert.equal(uploadResponse.status, 201);
  const captured = await uploadResponse.json() as CaptureResult;
  const stored = await api.request(captured.capture.url);
  assert.equal(stored.status, 200); assert.equal(stored.headers.get('content-type'), 'application/pdf');
  assert.deepEqual(Buffer.from(await stored.arrayBuffer()), bytes);
  const restarted = await start(t, resolve(fixture, '.data'));
  const reopened = await restarted.request(captured.capture.url);
  assert.equal(reopened.status, 200); assert.deepEqual(Buffer.from(await reopened.arrayBuffer()), bytes);
  assert.equal((await restarted.request('/api/documents/.data')).status, 404);
  assert.equal((await restarted.request('/api/documents/%2e%2e%2f.data%2fassessments.json')).status, 404);
});

test('receiving is separate, retries bind fields and bytes, survives restart and packet preserves pickup', async t => {
  const api = await start(t), pickupBytes = await captureBytes('driver pickup'), receivingBytes = await captureBytes('separate receiving');
  const pickup = await (await api.request('/api/shipments/RS-417652/captures', upload(pickupBytes, 'receiver-base-pickup'))).json() as CaptureResult;
  const details = { receiverName: 'Jordan Lee', receivedDate: '2026-10-27', palletsReceived: 0, exceptions: 'Delivery refused: damaged pallets.' };
  const receivingUpload = (operation = 'receiving-operation', fields = details, source = pickup.capture.id, bytes = receivingBytes): RequestInit => {
    const request = upload(bytes, operation, source);
    request.headers = { ...request.headers, 'X-Capture-Kind': 'demo-receiving', 'X-Receiving-Details': encodeURIComponent(JSON.stringify(fields)) };
    return request;
  };
  const route = '/api/shipments/RS-417652/captures';
  const responses = await Promise.all([api.request(route, receivingUpload()), api.request(route, receivingUpload())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const first = await responses[0].json() as CaptureResult, duplicate = await responses[1].json();
  assert.deepEqual(first, duplicate); assert.equal(first.capture.kind, 'demo-receiving'); assert.deepEqual(first.capture.receiving, details);
  assert.equal((await api.request(route, receivingUpload('receiving-operation', { ...details, receiverName: 'Another receiver' }))).status, 409);
  assert.equal((await api.request(route, upload(receivingBytes, 'receiving-operation'))).status, 409);
  assert.equal((await api.request(route, receivingUpload('unsigned-receiving-source', details, 'bol-RS-417652'))).status, 409);
  assert.equal((await api.request(route, receivingUpload('wrong-receiving-source', details, 'bol-RS-417620'))).status, 409);
  assert.equal((await api.request(route, receivingUpload('receiving-on-receiving', details, first.capture.id))).status, 409);
  assert.equal((await api.request(route, receivingUpload('empty-name', { ...details, receiverName: '' }))).status, 400);
  assert.equal((await api.request(route, receivingUpload('fractional-pallets', { ...details, palletsReceived: 1.5 }))).status, 400);
  assert.equal((await api.request(route, receivingUpload('missing-difference', { ...details, exceptions: '' }))).status, 400);
  assert.equal((await api.request(route, receivingUpload('invalid-date', { ...details, receivedDate: '2026-02-30' }))).status, 400);
  const restarted = await start(t, api.dir);
  assert.deepEqual(await (await restarted.request(route, receivingUpload())).json(), first);
  const caseRecord = await (await restarted.request('/api/deductions/CHB-0899904')).json() as Deduction;
  assert.equal(caseRecord.assessment, null); assert.equal(caseRecord.evidenceState, 'available');
  const files = unzip(Buffer.from(await (await restarted.request('/api/deductions/CHB-0899904/packet')).arrayBuffer()));
  const manifest = JSON.parse(files['manifest.json'].toString());
  const received = manifest.documents.find((document: { id: string }) => document.id === first.capture.id);
  assert.equal(received.provenance, 'new-demo-receiving'); assert.equal(received.sourceDocumentId, pickup.capture.id);
  assert.deepEqual(received.receiving, details); assert.deepEqual(files[received.archivePath], receivingBytes);
  const pickedUp = manifest.documents.find((document: { id: string }) => document.id === pickup.capture.id);
  assert.deepEqual(files[pickedUp.archivePath], pickupBytes); assert.deepEqual(files['original-evidence/RS-417652.pdf'], sourceBytes);
  assert.match(files['summary.txt'].toString(), /NEW DEMO RECEIVING/);
});
