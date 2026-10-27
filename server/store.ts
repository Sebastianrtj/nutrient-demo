import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Assessment, CaptureResult } from '../shared/contracts.js';
import { inside, sha256 } from './catalog.js';

export interface StoredCapture extends CaptureResult { sourceDocumentId: string; filePath: string; pages: number; }
const flushDirectory = (path: string) => { const fd = openSync(path, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); } };
function durableFile(path: string, data: string | Buffer) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
}
export class DemoStore {
  readonly root: string;
  readonly captureDir: string;
  captures = new Map<string, StoredCapture>();
  assessments = new Map<string, Assessment>();
  constructor(dataDir: string, sourceRoot: string) {
    const requested = resolve(dataDir), source = realpathSync(sourceRoot);
    if (inside(source, requested) || inside(requested, source)) throw new Error('Demo state must be separate from original samples');
    mkdirSync(requested, { recursive: true, mode: 0o700 });
    this.root = realpathSync(requested);
    if (inside(source, this.root) || inside(this.root, source)) throw new Error('Demo state must be separate from original samples');
    this.captureDir = resolve(this.root, 'captures');
    mkdirSync(this.captureDir, { recursive: true, mode: 0o700 });
    for (const name of readdirSync(this.captureDir)) {
      if (name.startsWith('.tmp-')) continue;
      if (!/^[0-9a-f-]{36}$/.test(name)) throw new Error('Unrecognized capture directory in demo store');
      const dir = realpathSync(resolve(this.captureDir, name));
      if (!inside(this.captureDir, dir)) throw new Error('Capture directory escapes demo store');
      const saved = JSON.parse(readFileSync(resolve(dir, 'record.json'), 'utf8')) as Omit<StoredCapture, 'filePath'>;
      const filePath = realpathSync(resolve(dir, 'document.pdf'));
      if (!inside(dir, filePath) || sha256(readFileSync(filePath)) !== saved.receipt.sha256) throw new Error('Stored capture failed integrity check');
      if (this.captures.has(saved.receipt.operationId)) throw new Error('Duplicate operation in demo store');
      this.captures.set(saved.receipt.operationId, { ...saved, filePath });
    }
    const path = resolve(this.root, 'assessments.json');
    if (existsSync(path)) for (const assessment of JSON.parse(readFileSync(path, 'utf8')) as Assessment[]) this.assessments.set(assessment.deductionId, assessment);
  }
  saveCapture(shipmentId: string, sourceDocumentId: string, operationId: string, pdf: Buffer, pages: number): StoredCapture {
    const id = randomUUID(), receivedAt = new Date().toISOString(), hash = sha256(pdf);
    const result: Omit<StoredCapture, 'filePath'> = { sourceDocumentId, pages,
      capture: { id: `demo-${id}`, shipmentId, kind: 'demo-pickup', name: `Demo pickup - ${shipmentId} - ${receivedAt.slice(0, 10)}.pdf`, url: `/api/documents/demo-${id}`, createdAt: receivedAt, sha256: hash, captureId: id },
      receipt: { id, receivedAt, sha256: hash, bytes: pdf.length, operationId } };
    const temp = resolve(this.captureDir, `.tmp-${id}`), target = resolve(this.captureDir, id);
    mkdirSync(temp, { mode: 0o700 });
    try {
      durableFile(resolve(temp, 'document.pdf'), pdf);
      durableFile(resolve(temp, 'record.json'), JSON.stringify(result, null, 2));
      flushDirectory(temp); renameSync(temp, target); flushDirectory(this.captureDir);
    } catch (error) { rmSync(temp, { recursive: true, force: true }); throw error; }
    const saved = { ...result, filePath: resolve(target, 'document.pdf') };
    this.captures.set(operationId, saved);
    return saved;
  }
  saveAssessment(assessment: Assessment) {
    const next = new Map(this.assessments); next.set(assessment.deductionId, assessment);
    const temp = resolve(this.root, `.assessments-${randomUUID()}.tmp`);
    durableFile(temp, JSON.stringify([...next.values()], null, 2));
    renameSync(temp, resolve(this.root, 'assessments.json')); flushDirectory(this.root);
    this.assessments = next;
  }
  reset() {
    // Only our generated store paths are removed. The source root is never a reset target.
    rmSync(this.captureDir, { recursive: true, force: true });
    rmSync(resolve(this.root, 'assessments.json'), { force: true });
    mkdirSync(this.captureDir, { mode: 0o700 }); flushDirectory(this.root);
    this.captures.clear(); this.assessments.clear();
  }
}
