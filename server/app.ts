import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { ZipArchive } from 'archiver';
import { PDFDocument } from 'pdf-lib';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assessment, AssessmentCitation, AssessmentStatus, Bootstrap, CaptureResult, Deduction, Shipment, ReceivingDetails } from '../shared/contracts.js';
import { receivingError } from '../shared/receiving.js';
import { accountingStatus, followUpReason } from '../shared/accounting-status.js';
import { assessmentCitations } from '../shared/assessment-citations.js';
import { DEFAULT_SOURCE_ROOT, loadCatalog, SAMPLE_DATE, sha256 } from './catalog.js';
import { DemoStore } from './store.js';

export interface AppOptions { dataDir?: string; sourceRoot?: string; enableFaults?: boolean; }
class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new HttpError(status, message); };
const publicCapture = (saved: CaptureResult): CaptureResult => ({ capture: saved.capture, receipt: saved.receipt });
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9 ._-]/g, '_');

export function createApp(options: AppOptions = {}) {
  const sourceRoot = options.sourceRoot || DEFAULT_SOURCE_ROOT;
  const catalog = loadCatalog(sourceRoot);
  const store = new DemoStore(options.dataDir || fileURLToPath(new URL('../.data/', import.meta.url)), sourceRoot);
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  let failNextUpload = false;
  let generation = 0;
  const capturesFor = (id: string) => [...store.captures.values()].filter(c => c.capture.shipmentId === id).sort((a, b) => (a.capture.createdAt || '').localeCompare(b.capture.createdAt || '') || a.capture.id.localeCompare(b.capture.id));
  const shipmentById = (id: string): Shipment => {
    const source = catalog.shipments.find(s => s.id === id) || fail(404, 'Shipment not found.');
    return { ...source, documents: [...source.documents, ...capturesFor(id).map(c => c.capture)] };
  };
  const deductionById = (id: string): Deduction => {
    const source = catalog.deductions.find(d => d.id === id) || fail(404, 'Deduction not found.');
    return { ...source, matchWarnings: [...source.matchWarnings], assessment: store.assessments.get(id) || null,
      documents: [...source.documents, ...(source.shipmentId ? capturesFor(source.shipmentId).map(c => c.capture) : [])] };
  };
  const documentById = (id: string) => {
    const original = catalog.documents.get(id);
    if (original) return { ...original, sourceDocumentId: undefined };
    const captured = [...store.captures.values()].find(c => c.capture.id === id);
    if (captured) return { record: captured.capture, path: captured.filePath, pages: captured.pages, sourceDocumentId: captured.sourceDocumentId, warnings: [] };
    return fail(404, 'Document not found.');
  };
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'Ridgeline demo server', sampleDate: SAMPLE_DATE }));
  app.get('/api/bootstrap', (_req, res) => {
    const result: Bootstrap = { sampleDate: SAMPLE_DATE, shipments: catalog.shipments.map(s => shipmentById(s.id)), deductions: catalog.deductions.map(d => deductionById(d.id)) };
    res.json(result);
  });
  app.get('/api/shipments/:id', (req, res) => res.json(shipmentById(String(req.params.id))));
  app.get('/api/deductions/:id', (req, res) => res.json(deductionById(String(req.params.id))));
  app.get('/api/documents/:id', (req, res, next) => {
    const document = documentById(String(req.params.id));
    res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${safeName(document.record.name)}"`);
    res.sendFile(document.path, { dotfiles: 'allow' }, error => { if (error) next(error); });
  });
  app.post('/api/shipments/:id/captures', express.raw({ type: 'application/pdf', limit: '12mb' }), async (req, res) => {
    const currentGeneration = generation;
    const shipment = shipmentById(String(req.params.id));
    const operationId = req.get('X-Operation-Id') || '';
    const sourceDocumentId = req.get('X-Source-Document-Id') || '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(operationId)) fail(400, 'A stable X-Operation-Id (1-128 letters, digits, underscores or hyphens) is required.');
    const kind = req.get('X-Capture-Kind') || 'demo-pickup';
    if (kind !== 'demo-pickup' && kind !== 'demo-receiving') fail(400, 'Choose pickup or receiving capture.');
    let receiving: ReceivingDetails | undefined;
    if (kind === 'demo-receiving') {
      let details: unknown;
      try { details = JSON.parse(decodeURIComponent(req.get('X-Receiving-Details') || '')); } catch { fail(400, 'Receiving details are required.'); }
      if (!details || typeof details !== 'object' || Array.isArray(details)) fail(400, 'Receiving details are required.');
      const value = details as Record<string, unknown>;
      if (typeof value.receiverName !== 'string' || typeof value.receivedDate !== 'string' || typeof value.palletsReceived !== 'number' || typeof value.exceptions !== 'string') fail(400, 'Receiving details are incomplete.');
      receiving = { receiverName: (value.receiverName as string).trim(), receivedDate: value.receivedDate as string, palletsReceived: value.palletsReceived as number, exceptions: (value.exceptions as string).trim() };
      const error = receivingError(receiving, shipment.pallets); if (error) fail(400, error);
    } else if (req.get('X-Receiving-Details')) fail(400, 'Receiving details require a receiving capture.');
    const source = documentById(sourceDocumentId);
    if (source.record.shipmentId !== shipment.id || !(kind === 'demo-pickup' && source.record.kind === 'bol' || kind === 'demo-receiving' && source.record.kind === 'demo-pickup')) fail(409, kind === 'demo-receiving' ? 'Save this shipment’s driver pickup before adding receiving acknowledgement.' : 'Source document must be this shipment’s original unsigned BOL.');
    const sameCapture = (saved: typeof previous) => saved && saved.capture.shipmentId === shipment.id && saved.sourceDocumentId === sourceDocumentId && saved.receipt.sha256 === hash && saved.capture.kind === kind && JSON.stringify(saved.capture.receiving) === JSON.stringify(receiving);
    if (!req.is('application/pdf')) fail(415, 'Capture must use application/pdf.');
    const pdf = req.body as Buffer;
    if (!Buffer.isBuffer(pdf) || pdf.length < 100 || !pdf.subarray(0, 5).equals(Buffer.from('%PDF-')) || !pdf.subarray(-2048).includes(Buffer.from('%%EOF'))) fail(400, 'Capture is not a complete PDF.');
    const hash = sha256(pdf);
    const previous = store.captures.get(operationId);
    if (previous) {
      if (!sameCapture(previous)) fail(409, 'Operation ID is already used for a different capture. Retry the original bytes with the same source.');
      res.json(publicCapture(previous)); return;
    }
    for (const doc of catalog.documents.values()) if (doc.record.sha256 === hash && doc.record.id !== sourceDocumentId) fail(409, 'Uploaded bytes belong to a different supplied document.');
    let pages: number;
    try { const parsed = await PDFDocument.load(pdf, { updateMetadata: false }); pages = parsed.getPageCount(); }
    catch { fail(400, 'Capture PDF could not be opened.'); }
    if (pages! !== source.pages) fail(400, 'Capture page count differs from the source BOL.');
    if (currentGeneration !== generation) fail(409, 'Demo was reset during this upload. Start a new capture.');
    // Check again after asynchronous parsing: concurrent retries must converge on one receipt.
    const raced = store.captures.get(operationId);
    if (raced) {
      if (!sameCapture(raced)) fail(409, 'Operation ID is already used for a different capture.');
      res.json(publicCapture(raced)); return;
    }
    if (failNextUpload) { failNextUpload = false; fail(503, 'Controlled demo transfer failure. Nothing was stored. Retry the same operation.'); }
    const saved = store.saveCapture(shipment.id, sourceDocumentId, operationId, pdf, pages!, receiving);
    res.status(201).json(publicCapture(saved));
  });
  app.put('/api/deductions/:id/assessment', express.json({ limit: '16kb' }), (req, res) => {
    const deduction = deductionById(String(req.params.id));
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Assessment body must be a JSON object.');
    const statuses: AssessmentStatus[] = ['ready', 'needs-evidence', 'investigate'];
    if (!statuses.includes(body!.status as AssessmentStatus)) fail(400, 'Choose a valid assessment status.');
    if (typeof body!.note !== 'string' || body!.note.trim().length === 0 || body!.note.length > 4000) fail(400, 'Add a reviewer note between 1 and 4000 characters.');
    let requested: unknown[];
    if (body!.citations !== undefined) {
      if (!Array.isArray(body!.citations) || body!.citations.length > 100) fail(400, 'Choose up to 100 assessment sources.');
      requested = body!.citations as unknown[];
    } else if (body!.sourceDocumentId !== undefined && body!.sourceDocumentId !== null && body!.sourceDocumentId !== '') {
      requested = [{ sourceDocumentId: body!.sourceDocumentId, pageNumber: body!.pageNumber ?? 1 }];
    } else {
      if (body!.pageNumber !== undefined && body!.pageNumber !== null) fail(400, 'A page citation requires a source document.');
      requested = [];
    }
    const citations: AssessmentCitation[] = [];
    for (const value of requested) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Choose a valid assessment source.');
      const citation = value as Record<string, unknown>;
      if (typeof citation.sourceDocumentId !== 'string' || !deduction.documents.some(d => d.id === citation.sourceDocumentId)) fail(400, 'Assessment source must belong to this deduction’s shipment.');
      const sourceDocumentId = citation.sourceDocumentId as string;
      if (citations.some(item => item.sourceDocumentId === sourceDocumentId)) fail(400, 'Choose each assessment source only once.');
      const pageNumber = citation.pageNumber as number;
      if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > documentById(sourceDocumentId).pages) fail(400, 'Assessment page is outside the source document.');
      citations.push({ sourceDocumentId, pageNumber });
    }
    // Keep the first-source aliases for existing clients and saved packets.
    const assessment: Assessment = { deductionId: deduction.id, status: body!.status as AssessmentStatus, note: (body!.note as string).trim(), citations, ...citations[0], updatedAt: new Date().toISOString() };
    store.saveAssessment(assessment); res.json(assessment);
  });
  app.get('/api/deductions/:id/packet', (req, res, next) => {
    const deduction = deductionById(String(req.params.id));
    const generatedAt = new Date().toISOString();
    const documents = deduction.documents.map(record => {
      const registered = documentById(record.id);
      const bytes = readFileSync(registered.path);
      return { record, bytes, sourceDocumentId: registered.sourceDocumentId, pages: registered.pages, entry: `${record.captureId ? record.kind : 'original-evidence'}/${record.captureId ? `${record.captureId}-` : ''}${safeName(record.name)}` };
    });
    const limitations = [
      'Synthetic Ridgeline hiring-exercise sample, historical data as of 2026-10-01.',
      'This packet is prepared for human review; it is not a submitted or accepted retailer dispute.',
      'Available means a historical scan file is present, not that delivery or disputed quantities are proved.',
      'Demo pickup files are newly captured reenactments with current timestamps. They do not establish historical pickup or consignee delivery.',
      'Demo receiving files are new delivery reenactments. Their editable receiving dates do not establish historical delivery or resolve a deduction.',
      'Hashes track these file versions; they do not authenticate signers or create certificate-backed PDF integrity.',
    ];
    const summary = [ 'RIDGELINE — DEDUCTION REVIEW PACKET', `Prepared: ${generatedAt}`, `Historical sample date: ${SAMPLE_DATE}`,
      `Deduction: ${deduction.id}`, `Portal: ${deduction.sourcePortal}`, `Invoice: ${deduction.invoiceNo}`, `Customer PO: ${deduction.customerPo}`,
      `Shipment: ${deduction.shipmentId || 'No unique match'}`, `Reason: ${deduction.reasonText}`, `Amount USD: ${deduction.amountUsd.toFixed(2)}`, `Dispute deadline: ${deduction.deadline}`,
      `Historical evidence state: ${deduction.evidenceState}`, '', 'MATCH / EVIDENCE WARNINGS', ...deduction.matchWarnings.map(w => `- ${w}`), '',
      'HUMAN ASSESSMENT', `Status: ${accountingStatus(deduction.assessment).label}`,
      ...(deduction.assessment ? [ ...(followUpReason(deduction.assessment.status) ? [`Follow-up reason: ${followUpReason(deduction.assessment.status)}`] : []), `Note: ${deduction.assessment.note}`, 'CITED SOURCES', ...(assessmentCitations(deduction.assessment).length ? assessmentCitations(deduction.assessment).map(citation => `- Source: ${citation.sourceDocumentId} | Page: ${citation.pageNumber}`) : ['None cited']), `Updated: ${deduction.assessment.updatedAt}` ] : []), '',
      'INCLUDED DOCUMENTS', ...documents.map(d => `- ${d.entry}${d.record.captureId ? ` [NEW DEMO ${d.record.kind === 'demo-receiving' ? 'RECEIVING' : 'PICKUP'} — NOT HISTORICAL DELIVERY]` : ' [SUPPLIED ORIGINAL]'}`), '', 'LIMITATIONS', ...limitations.map(l => `- ${l}`), '' ].join('\n');
    const status = accountingStatus(deduction.assessment);
    const manifest = { formatVersion: 1, generatedAt, sampleDate: SAMPLE_DATE, deduction, limitations,
      caseStatus: { value: status.value, label: status.label, ...(deduction.assessment && followUpReason(deduction.assessment.status) ? { followUpReason: followUpReason(deduction.assessment.status) } : {}) },
      documents: documents.map(d => ({ ...d.record, archivePath: d.entry, bytes: d.bytes.length, sha256: sha256(d.bytes), pages: d.pages, provenance: d.record.captureId ? `new-${d.record.kind}` : 'supplied-original', ...(d.sourceDocumentId ? { sourceDocumentId: d.sourceDocumentId } : {}), ...(d.record.captureId ? { receipt: [...store.captures.values()].find(c => c.capture.id === d.record.id)?.receipt } : {}) })) };
    res.attachment(`${safeName(deduction.id)}-review-packet.zip`).type('application/zip');
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on('error', error => { if (!res.headersSent) next(error); else res.destroy(error); });
    res.on('close', () => { if (!res.writableFinished) archive.abort(); });
    archive.pipe(res); archive.append(summary, { name: 'summary.txt' }); archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    for (const doc of documents) archive.append(doc.bytes, { name: doc.entry });
    void archive.finalize().catch(next);
  });
  app.post('/api/demo/reset', (_req, res) => { generation++; store.reset(); failNextUpload = false; res.json({ ok: true }); });
  if (options.enableFaults ?? process.env.DEMO_FAULTS === '1') app.post('/api/demo/fail-next-upload', (_req, res) => { failNextUpload = true; res.json({ ok: true, nextUploadWillFail: true }); });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  if (process.env.NODE_ENV === 'production') {
    const dist = fileURLToPath(new URL('../dist/', import.meta.url));
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res, next) => existsSync(resolve(dist, 'index.html')) ? res.sendFile(resolve(dist, 'index.html')) : next());
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (res.headersSent) { res.destroy(); return; }
    const status = error instanceof HttpError ? error.status : error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && 'body' in error ? 400 : 500;
    const message = status === 500 ? 'Demo server could not complete this operation.' : status === 413 ? 'Upload is too large. Maximum PDF size is 12 MB.' : error.message;
    res.status(status).json({ error: message });
  };
  app.use(errorHandler);
  return app;
}
