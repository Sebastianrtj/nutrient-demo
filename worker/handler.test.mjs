import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument, rgb } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { createNutrientHandler } from './handler.mjs';
import {
  loadCatalog,
  DEFAULT_SOURCE_ROOT,
  SAMPLE_DATE,
} from '../server/catalog.ts';
const source = loadCatalog(DEFAULT_SOURCE_ROOT),
  base = 'https://example.test/nutrientdemo',
  hash = (data) => createHash('sha256').update(data).digest('hex');
const fix = (d) => ({ ...d, url: '/nutrientdemo' + d.url });
const catalog = {
  sampleDate: SAMPLE_DATE,
  shipments: source.shipments.map((s) => ({
    ...s,
    documents: s.documents.map(fix),
  })),
  deductions: source.deductions.map((d) => ({
    ...d,
    documents: d.documents.map(fix),
  })),
  documents: [...source.documents.values()].map((d) => ({
    record: fix(d.record),
    pages: d.pages,
    assetPath: '/nutrientdemo/_samples/' + d.record.id + '.pdf',
  })),
};
class Bucket {
  objects = new Map();
  async put(key, data, options = {}) {
    const condition = options.onlyIf;
    if (
      (condition?.get?.('If-None-Match') === '*' ||
        condition?.etagDoesNotMatch === '*') &&
      this.objects.has(key)
    )
      return null;
    const bytes =
      typeof data === 'string'
        ? new TextEncoder().encode(data)
        : new Uint8Array(data);
    this.objects.set(key, {
      key,
      bytes,
      customMetadata: options.customMetadata || {},
      size: bytes.length,
      httpEtag: '"' + hash(bytes) + '"',
    });
    return this.head(key);
  }
  async head(key) {
    const value = this.objects.get(key);
    return value ? { ...value } : null;
  }
  async get(key) {
    const value = this.objects.get(key);
    if (!value) return null;
    return {
      ...value,
      body: new Blob([value.bytes]).stream(),
      arrayBuffer: async () =>
        value.bytes.buffer.slice(
          value.bytes.byteOffset,
          value.bytes.byteOffset + value.bytes.byteLength,
        ),
      json: async () => JSON.parse(new TextDecoder().decode(value.bytes)),
    };
  }
  async list(options) {
    return {
      objects: [...this.objects.values()]
        .filter((v) => v.key.startsWith(options.prefix))
        .map((v) => ({ ...v })),
      truncated: false,
    };
  }
}
function fixture() {
  const bucket = new Bucket(),
    env = {
      NUTRIENT_FILES: bucket,
      ASSETS: {
        fetch: async (request) => {
          const id = new URL(request.url).pathname
            .split('/')
            .at(-1)
            .replace(/\.pdf$/, '');
          const doc = source.documents.get(id);
          return doc
            ? new Response(readFileSync(doc.path), {
                headers: { 'Content-Type': 'application/pdf' },
              })
            : new Response('missing', { status: 404 });
        },
      },
    };
  return { bucket, env, handler: createNutrientHandler(catalog) };
}
async function session(f) {
  const response = await f.handler(new Request(base + '/api/bootstrap'), f.env);
  assert.equal(response.status, 200);
  return {
    cookie: response.headers.get('set-cookie').split(';')[0],
    data: await response.json(),
  };
}
function call(f, cookie, path, method = 'GET', body, extra = {}) {
  return f.handler(
    new Request(base + '/api' + path, {
      method,
      headers: { cookie, origin: 'https://example.test', ...extra },
      body,
    }),
    f.env,
  );
}
async function signed() {
  const bytes = readFileSync(source.documents.get('bol-RS-417652').path);
  const pdf = await PDFDocument.load(bytes);
  pdf.getPages()[0].drawLine({
    start: { x: 310, y: 215 },
    end: { x: 390, y: 219 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  return pdf.save();
}
const upload = (f, cookie, bytes, operation = 'same-operation') =>
  call(f, cookie, '/shipments/RS-417652/captures', 'POST', bytes, {
    'Content-Type': 'application/pdf',
    'X-Operation-Id': operation,
    'X-Source-Document-Id': 'bol-RS-417652',
  });

test('hosted bootstrap uses a scoped HttpOnly session and the full synthetic catalog', async () => {
  const f = fixture(),
    r = await f.handler(new Request(base + '/api/bootstrap'), f.env);
  assert.match(r.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Lax/);
  const d = await r.json();
  assert.equal(d.shipments.length, 40);
  assert.equal(d.deductions.length, 12);
  assert.ok(
    d.shipments[0].documents.every((d) =>
      d.url.startsWith('/nutrientdemo/api/'),
    ),
  );
});
test('cached PDF validators are not forwarded to the internal static asset lookup', async () => {
  const f = fixture(), s = await session(f);
  const originalFetch = f.env.ASSETS.fetch;
  f.env.ASSETS.fetch = async request => {
    if (request.headers.has('if-none-match') || request.headers.has('if-modified-since')) {
      return new Response(null, { status: 304 });
    }
    return originalFetch(request);
  };
  const result = await call(f, s.cookie, '/documents/bol-RS-417652', 'GET', undefined, {
    'If-None-Match': '"cached-file"',
    'If-Modified-Since': 'Tue, 27 Oct 2026 12:00:00 GMT',
  });
  assert.equal(result.status, 200);
  assert.equal(hash(new Uint8Array(await result.arrayBuffer())), hash(readFileSync(source.documents.get('bol-RS-417652').path)));
});

test('atomic concurrent retries produce one durable PDF and survive a new handler', async () => {
  const f = fixture(),
    s = await session(f),
    bytes = await signed();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () => upload(f, s.cookie, bytes)),
  );
  const results = await Promise.all(responses.map((r) => r.json()));
  assert.ok(results.every((r) => r.capture.id === results[0].capture.id));
  assert.equal(f.bucket.objects.size, 1);
  assert.equal(results[0].receipt.sha256, hash(bytes));
  f.handler = createNutrientHandler(catalog);
  const retry = await upload(f, s.cookie, bytes);
  assert.equal((await retry.json()).capture.id, results[0].capture.id);
});
test('browser sessions cannot see each other’s captures or assessments', async () => {
  const f = fixture(),
    a = await session(f),
    b = await session(f),
    uploadResult = await (await upload(f, a.cookie, await signed())).json();
  assert.equal(
    (await call(f, b.cookie, '/documents/' + uploadResult.capture.id)).status,
    404,
  );
  const c = await (await call(f, b.cookie, '/shipments/RS-417652')).json();
  assert.equal(c.documents.filter((d) => d.kind === 'demo-pickup').length, 0);
  const data = {
    status: 'investigate',
    note: 'Synthetic review only.',
    sourceDocumentId: 'bol-RS-417652',
    pageNumber: 1,
  };
  assert.equal(
    (
      await call(
        f,
        a.cookie,
        '/deductions/CHB-0899904/assessment',
        'PUT',
        JSON.stringify(data),
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await call(f, b.cookie, '/deductions/CHB-0899904')).json())
      .assessment,
    null,
  );
});
test('receipt conflicts and wrong shipment sources are rejected', async () => {
  const f = fixture(),
    s = await session(f),
    bytes = await signed();
  await upload(f, s.cookie, bytes);
  const other = new Uint8Array(bytes);
  other[100] ^= 1;
  assert.equal((await upload(f, s.cookie, other)).status, 409);
  assert.equal(
    (
      await call(f, s.cookie, '/shipments/RS-417652/captures', 'POST', bytes, {
        'Content-Type': 'application/pdf',
        'X-Operation-Id': 'different',
        'X-Source-Document-Id': 'bol-RS-417741',
      })
    ).status,
    409,
  );
});
test('saved follow-up packet preserves four documents with independently matching hashes', async () => {
  const f = fixture(),
    s = await session(f);
  await upload(f, s.cookie, await signed());
  const review = {
    status: 'investigate',
    note: 'Historical scan is separate; item receipt needs human review.',
    sourceDocumentId: 'scan-RS-417652',
    pageNumber: 1,
  };
  assert.equal(
    (
      await call(
        f,
        s.cookie,
        '/deductions/CHB-0899904/assessment',
        'PUT',
        JSON.stringify(review),
      )
    ).status,
    200,
  );
  const response = await call(f, s.cookie, '/deductions/CHB-0899904/packet');
  assert.equal(response.status, 200);
  const files = unzipSync(new Uint8Array(await response.arrayBuffer())),
    manifest = JSON.parse(strFromU8(files['manifest.json']));
  assert.equal(manifest.documents.length, 4);
  assert.equal(manifest.caseStatus.label, 'Needs follow-up');
  assert.equal(manifest.caseStatus.followUpReason, 'Unresolved discrepancy');
  for (const doc of manifest.documents)
    assert.equal(hash(files[doc.archivePath]), doc.sha256);
  assert.equal(
    manifest.documents.filter((d) => d.provenance === 'new-demo-pickup').length,
    1,
  );
});
test('assessment validation, same-origin writes and missing historical scan remain explicit', async () => {
  const f = fixture(),
    s = await session(f);
  assert.equal(
    (
      await call(
        f,
        s.cookie,
        '/deductions/CHB-0899904/assessment',
        'PUT',
        JSON.stringify({
          status: 'ready',
          note: 'Review',
          sourceDocumentId: 'bol-RS-417741',
          pageNumber: 1,
        }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        f,
        s.cookie,
        '/deductions/CHB-0899904/assessment',
        'PUT',
        '{}',
        { origin: 'https://other.test' },
      )
    ).status,
    403,
  );
  const d = await (await call(f, s.cookie, '/deductions/CHB-0912707')).json();
  assert.equal(d.evidenceState, 'missing');
  assert.equal(
    d.documents.some((d) => d.kind === 'scan'),
    false,
  );
  assert.equal((await call(f, s.cookie, '/demo/reset', 'POST')).status, 404);
});

test('packet retains distinct same-day pickups and each member matches its manifest hash', async (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-27T16:00:00Z'),
  });
  const f = fixture(),
    s = await session(f);
  const captured = [];
  for (const label of ['first-pickup', 'second-pickup']) {
    const pdf = await PDFDocument.load(await signed());
    pdf.setSubject(label);
    const response = await upload(f, s.cookie, await pdf.save(), label);
    assert.equal(response.status, 201);
    captured.push((await response.json()).capture);
  }
  assert.equal(captured[0].name, captured[1].name);
  assert.notEqual(captured[0].sha256, captured[1].sha256);

  const response = await call(f, s.cookie, '/deductions/CHB-0899904/packet');
  assert.equal(response.status, 200);
  const members = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(members['manifest.json']));
  const pickups = manifest.documents.filter(
    (doc) => doc.provenance === 'new-demo-pickup',
  );
  assert.equal(pickups.length, 2);
  assert.equal(new Set(pickups.map((doc) => doc.archivePath)).size, 2);
  assert.equal(
    Object.keys(members).filter((name) => name.startsWith('demo-pickup/'))
      .length,
    2,
  );
  for (const doc of pickups) {
    assert.ok(
      members[doc.archivePath],
      `Missing archive member ${doc.archivePath}`,
    );
    assert.equal(hash(members[doc.archivePath]), doc.sha256);
    assert.equal(doc.receipt.sha256, doc.sha256);
    assert.ok(doc.archivePath.includes(doc.captureId));
  }
});

const receive = (
  f,
  cookie,
  bytes,
  sourceId,
  details,
  operation = 'receive-operation',
) =>
  call(f, cookie, '/shipments/RS-417652/captures', 'POST', bytes, {
    'Content-Type': 'application/pdf',
    'X-Operation-Id': operation,
    'X-Source-Document-Id': sourceId,
    'X-Capture-Kind': 'demo-receiving',
    'X-Receiving-Details': encodeURIComponent(JSON.stringify(details)),
  });
const receiving = {
  receiverName: 'Dana Receiver',
  receivedDate: '2026-10-27',
  palletsReceived: source.shipments.find((s) => s.id === 'RS-417652').pallets,
  exceptions: '',
};
async function acknowledged(bytes) {
  const pdf = await PDFDocument.load(bytes);
  pdf.getPages()[0].drawLine({
    start: { x: 80, y: 120 },
    end: { x: 170, y: 125 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  pdf.setSubject('Combined driver pickup and receiver acknowledgement');
  return pdf.save();
}

test('receiving keeps a durable parent pickup and packet includes both stages with exact hashes', async () => {
  const f = fixture(),
    s = await session(f),
    pickupBytes = await signed();
  const pickup = await (await upload(f, s.cookie, pickupBytes)).json();
  const combinedBytes = await acknowledged(pickupBytes);
  const response = await receive(
    f,
    s.cookie,
    combinedBytes,
    pickup.capture.id,
    receiving,
  );
  assert.equal(response.status, 201);
  const combined = await response.json();
  assert.equal(combined.capture.kind, 'demo-receiving');
  assert.equal(combined.capture.sourceDocumentId, pickup.capture.id);
  assert.equal(pickup.capture.sourceDocumentId, 'bol-RS-417652');
  assert.deepEqual(combined.capture.receiving, receiving);
  assert.equal(combined.receipt.sha256, hash(combinedBytes));
  f.handler = createNutrientHandler(catalog);
  const stored = await call(f, s.cookie, '/documents/' + combined.capture.id);
  assert.equal(
    hash(new Uint8Array(await stored.arrayBuffer())),
    hash(combinedBytes),
  );
  const assessment = {
    status: 'ready',
    note: 'One combined BOL with both acknowledgements, reviewed by a human.',
    citations: [{ sourceDocumentId: combined.capture.id, pageNumber: 1 }],
  };
  const saved = await call(
    f,
    s.cookie,
    '/deductions/CHB-0899904/assessment',
    'PUT',
    JSON.stringify(assessment),
  );
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json()).citations, assessment.citations);
  const packet = await call(f, s.cookie, '/deductions/CHB-0899904/packet');
  const members = unzipSync(new Uint8Array(await packet.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(members['manifest.json']));
  assert.equal(manifest.documents.length, 5);
  for (const doc of manifest.documents)
    assert.equal(hash(members[doc.archivePath]), doc.sha256);
  const completed = manifest.documents.find(
    (d) => d.id === combined.capture.id,
  );
  assert.equal(completed.provenance, 'new-demo-receiving');
  assert.equal(completed.sourceDocumentId, pickup.capture.id);
  assert.equal(completed.receipt.sha256, hash(combinedBytes));
  assert.ok(
    completed.archivePath.startsWith(
      'demo-receiving/' + combined.capture.captureId,
    ),
  );
  assert.match(
    strFromU8(members['summary.txt']),
    new RegExp(combined.capture.id + ' \\| Page: 1'),
  );
});

test('receiving rejects unsigned, wrong shipment, cross-session and already completed parents', async () => {
  const f = fixture(),
    a = await session(f),
    b = await session(f),
    bytes = await signed();
  assert.equal(
    (await receive(f, a.cookie, bytes, 'bol-RS-417652', receiving)).status,
    409,
  );
  const pickup = await (await upload(f, a.cookie, bytes)).json();
  assert.equal(
    (await receive(f, b.cookie, bytes, pickup.capture.id, receiving)).status,
    404,
  );
  const wrong = await call(
    f,
    a.cookie,
    '/shipments/RS-417741/captures',
    'POST',
    bytes,
    {
      'Content-Type': 'application/pdf',
      'X-Operation-Id': 'wrong-shipment',
      'X-Source-Document-Id': pickup.capture.id,
      'X-Capture-Kind': 'demo-receiving',
      'X-Receiving-Details': encodeURIComponent(
        JSON.stringify({
          ...receiving,
          palletsReceived: source.shipments.find((s) => s.id === 'RS-417741')
            .pallets,
        }),
      ),
    },
  );
  assert.equal(wrong.status, 409);
  const completed = await (
    await receive(
      f,
      a.cookie,
      await acknowledged(bytes),
      pickup.capture.id,
      receiving,
    )
  ).json();
  assert.equal(
    (
      await receive(
        f,
        a.cookie,
        bytes,
        completed.capture.id,
        receiving,
        'again',
      )
    ).status,
    409,
  );
});

test('receiving retries converge and reject changed details, kind or source', async () => {
  const f = fixture(),
    s = await session(f),
    bytes = await signed();
  const pickup = await (await upload(f, s.cookie, bytes)).json();
  const completedBytes = await acknowledged(bytes);
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      receive(f, s.cookie, completedBytes, pickup.capture.id, receiving),
    ),
  );
  const records = await Promise.all(responses.map((r) => r.json()));
  assert.ok(records.every((r) => r.capture.id === records[0].capture.id));
  assert.equal(f.bucket.objects.size, 2);
  const padded = {
    ...receiving,
    receiverName: '  Dana Receiver  ',
    exceptions: '  ',
  };
  assert.equal(
    (await receive(f, s.cookie, completedBytes, pickup.capture.id, padded))
      .status,
    200,
  );
  assert.equal(
    (
      await receive(f, s.cookie, completedBytes, pickup.capture.id, {
        ...receiving,
        exceptions: 'Changed after commit',
      })
    ).status,
    409,
  );
  assert.equal(
    (await upload(f, s.cookie, completedBytes, 'receive-operation')).status,
    409,
  );
  const second = await (await upload(f, s.cookie, bytes, 'pickup-two')).json();
  assert.equal(
    (await receive(f, s.cookie, completedBytes, second.capture.id, receiving))
      .status,
    409,
  );
});

test('receiving validates dates, counts, exceptions and keeps metadata below a 2 KiB budget', async () => {
  const f = fixture(),
    s = await session(f),
    bytes = await signed();
  const pickup = await (await upload(f, s.cookie, bytes)).json();
  for (const invalid of [
    null,
    { ...receiving, receiverName: '' },
    { ...receiving, receivedDate: '2026-02-30' },
    { ...receiving, palletsReceived: 1.5 },
    { ...receiving, palletsReceived: -1 },
    { ...receiving, palletsReceived: receiving.palletsReceived + 1 },
    { ...receiving, exceptions: 'x'.repeat(201) },
  ]) {
    assert.equal(
      (await receive(f, s.cookie, bytes, pickup.capture.id, invalid, 'invalid'))
        .status,
      400,
    );
  }
  const wide = {
    ...receiving,
    receiverName: '\u754c'.repeat(60),
    exceptions: '\u754c'.repeat(200),
  };
  assert.equal(
    (
      await receive(
        f,
        s.cookie,
        await acknowledged(bytes),
        pickup.capture.id,
        wide,
        'x'.repeat(128),
      )
    ).status,
    201,
  );
  const stored = [...f.bucket.objects.values()].find(
    (v) =>
      JSON.parse(v.customMetadata.record).capture.kind === 'demo-receiving',
  );
  const metadataSize = Object.entries(stored.customMetadata).reduce(
    (size, [key, value]) =>
      size + Buffer.byteLength(key) + Buffer.byteLength(value),
    0,
  );
  assert.ok(metadataSize <= 2048, `Metadata uses ${metadataSize} bytes`);
});

test('assessment retains multiple citations, validates each source, and reads legacy records', async () => {
  const f = fixture(),
    s = await session(f);
  const path = '/deductions/CHB-0899904/assessment';
  const citations = [
    { sourceDocumentId: 'bol-RS-417652', pageNumber: 1 },
    { sourceDocumentId: 'scan-RS-417652', pageNumber: 1 },
  ];
  const value = {
    status: 'investigate',
    note: 'Compare both sources.',
    citations,
  };
  const response = await call(f, s.cookie, path, 'PUT', JSON.stringify(value));
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.deepEqual(saved.citations, citations);
  assert.equal(saved.sourceDocumentId, citations[0].sourceDocumentId);
  assert.equal(saved.pageNumber, 1);
  for (const invalid of [
    [citations[0], citations[0]],
    [{ sourceDocumentId: 'bol-RS-417741', pageNumber: 1 }],
    [{ ...citations[0], pageNumber: 999 }],
    [{ ...citations[0], pageNumber: 0 }],
    [{ ...citations[0], pageNumber: '1' }],
    [null],
    'wrong',
  ]) {
    assert.equal(
      (
        await call(
          f,
          s.cookie,
          path,
          'PUT',
          JSON.stringify({ ...value, citations: invalid }),
        )
      ).status,
      400,
    );
  }
  const prefix = 'nutrient/sessions/' + s.cookie.split('=')[1] + '/';
  const legacy = {
    deductionId: 'CHB-0899904',
    status: 'ready',
    note: 'Saved on v38.',
    sourceDocumentId: 'scan-RS-417652',
    pageNumber: 1,
    updatedAt: '2026-10-27T10:00:00Z',
  };
  await f.bucket.put(
    prefix + 'assessments/CHB-0899904.json',
    JSON.stringify(legacy),
  );
  const packet = await call(f, s.cookie, '/deductions/CHB-0899904/packet');
  const members = unzipSync(new Uint8Array(await packet.arrayBuffer()));
  assert.match(
    strFromU8(members['summary.txt']),
    /Source: scan-RS-417652 \| Page: 1/,
  );
});

test('legacy v38 pickups keep source identity and returned versions follow capture time', async () => {
  const f = fixture(),
    s = await session(f),
    bytes = await signed();
  const first = await (await upload(f, s.cookie, bytes, 'z-first')).json();
  const second = await (await upload(f, s.cookie, bytes, 'a-second')).json();
  const entries = [...f.bucket.objects.values()];
  for (const entry of entries) {
    const record = JSON.parse(entry.customMetadata.record);
    delete record.capture.sourceDocumentId;
    record.capture.createdAt =
      record.capture.id === first.capture.id
        ? '2026-10-27T10:00:00Z'
        : '2026-10-27T11:00:00Z';
    entry.customMetadata.record = JSON.stringify(record);
  }
  // R2 lists key order, which differs from capture chronology here.
  f.bucket.objects = new Map(
    [...f.bucket.objects].sort(([a], [b]) => a.localeCompare(b)),
  );
  f.handler = createNutrientHandler(catalog);
  const shipment = await (
    await call(f, s.cookie, '/shipments/RS-417652')
  ).json();
  const records = shipment.documents.filter((d) => d.kind === 'demo-pickup');
  assert.deepEqual(
    records.map((r) => r.id),
    [first.capture.id, second.capture.id],
  );
  assert.ok(records.every((r) => r.sourceDocumentId === 'bol-RS-417652'));
  const retry = await (await upload(f, s.cookie, bytes, 'z-first')).json();
  assert.equal(retry.capture.sourceDocumentId, 'bol-RS-417652');
  assert.equal(
    (
      await receive(
        f,
        s.cookie,
        await acknowledged(bytes),
        first.capture.id,
        receiving,
      )
    ).status,
    201,
  );
});

test('same-day receiving versions retain separate ZIP members and receipts', async (t) => {
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date('2026-10-27T16:00:00Z'),
  });
  const f = fixture(),
    s = await session(f),
    bytes = await signed();
  const pickup = await (await upload(f, s.cookie, bytes)).json();
  for (const index of [1, 2]) {
    const pdf = await PDFDocument.load(await acknowledged(bytes));
    pdf.setSubject('Receiving revision ' + index);
    assert.equal(
      (
        await receive(
          f,
          s.cookie,
          await pdf.save(),
          pickup.capture.id,
          receiving,
          'receiving-' + index,
        )
      ).status,
      201,
    );
  }
  const packet = await call(f, s.cookie, '/deductions/CHB-0899904/packet');
  const members = unzipSync(new Uint8Array(await packet.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(members['manifest.json']));
  const completed = manifest.documents.filter(
    (d) => d.kind === 'demo-receiving',
  );
  assert.equal(completed.length, 2);
  assert.equal(completed[0].name, completed[1].name);
  assert.equal(new Set(completed.map((d) => d.archivePath)).size, 2);
  for (const doc of completed) {
    assert.equal(hash(members[doc.archivePath]), doc.sha256);
    assert.equal(doc.receipt.sha256, doc.sha256);
  }
});
