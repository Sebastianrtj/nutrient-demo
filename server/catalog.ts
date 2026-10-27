import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import type { Deduction, DocumentRecord, Shipment } from '../shared/contracts.js';

export const DEFAULT_SOURCE_ROOT = process.env.RIDGELINE_SOURCE_ROOT || fileURLToPath(new URL('../samples/', import.meta.url));
export const SAMPLE_DATE = '2026-10-01';
export const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export interface RegisteredDocument { record: DocumentRecord; path: string; pages: number; warnings: string[]; }
interface AuditEntry { path: string; sha256: string; pages: number; warnings: string[]; }
export interface Catalog { shipments: Shipment[]; deductions: Deduction[]; documents: Map<string, RegisteredDocument>; }

export function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
export function loadCatalog(sourceRoot: string): Catalog {
  const root = realpathSync(sourceRoot);
  const csv = (path: string): Record<string, string>[] => parse(readFileSync(resolve(root, path)), { columns: true, skip_empty_lines: true, bom: true, trim: true });
  const shipmentRows = csv('ridgeline-sample-pack/base-pack/erp_shipments_export.csv');
  const deductionRows = csv('ridgeline-followup-ar-documents/discovery-pack/retailer_deductions_export.csv');
  const audit = JSON.parse(readFileSync(new URL('./source-audit.json', import.meta.url), 'utf8')) as { documents: AuditEntry[] };
  const auditByPath = new Map(audit.documents.map(d => [d.path, d]));
  const documents = new Map<string, RegisteredDocument>();
  const shipmentWarnings = new Map<string, string[]>();
  const shipments: Shipment[] = shipmentRows.map(row => ({
    id: row.shipper_no, shipDate: row.ship_date, plant: row.plant, customer: row.customer, destination: row.ship_to_city,
    customerPo: row.customer_po, asnId: row.asn_id, invoiceNo: row.invoice_no, carrier: row.carrier,
    pallets: Number(row.pallets), totalWeightLb: Number(row.total_weight_lb), freightTerms: row.freight_terms, documents: [],
  }));
  if (new Set(shipments.map(s => s.id)).size !== shipments.length) throw new Error('Duplicate shipment identifiers in source register');
  const byId = new Map(shipments.map(s => [s.id, s]));
  const register = (shipment: Shipment, kind: DocumentRecord['kind'], name: string, rel: string, id: string) => {
    const path = realpathSync(resolve(root, rel));
    if (!inside(root, path)) throw new Error('Source document escapes sample root');
    const hash = sha256(readFileSync(path));
    const check = auditByPath.get(rel);
    const warnings = check?.sha256 === hash ? [...check.warnings] : ['Current source file differs from identity audit; manual review required.'];
    const record: DocumentRecord = { id, shipmentId: shipment.id, kind, name, url: `/api/documents/${encodeURIComponent(id)}`, sha256: hash };
    if (documents.has(id)) throw new Error('Duplicate source document identifier');
    documents.set(id, { record, path, pages: check?.sha256 === hash ? check.pages : 1, warnings });
    shipment.documents.push(record);
    shipmentWarnings.set(shipment.id, [...(shipmentWarnings.get(shipment.id) || []), ...warnings]);
  };
  for (const s of shipments) {
    register(s, 'bol', `${s.id}.pdf`, `ridgeline-sample-pack/base-pack/bol/${s.id}.pdf`, `bol-${s.id}`);
    register(s, 'invoice', `${s.invoiceNo}.pdf`, `ridgeline-followup-ar-documents/discovery-pack/invoices/${s.invoiceNo}.pdf`, `invoice-${s.invoiceNo}`);
  }
  const scanFolder = 'ridgeline-sample-pack/base-pack/dock_scans';
  for (const name of readdirSync(resolve(root, scanFolder)).filter(n => n.toLowerCase().endsWith('.pdf')).sort()) {
    const match = /^(P\d+)_(RS-\d+)_(\d{8})\.pdf$/.exec(name);
    const s = match && byId.get(match[2]);
    if (!s || !match) throw new Error(`Unregistered scan filename: ${name}`);
    register(s, 'scan', name, `${scanFolder}/${name}`, `scan-${s.id}`);
    if (match[1] !== s.plant || match[3] !== s.shipDate.replaceAll('-', '')) shipmentWarnings.get(s.id)!.push('Scan filename plant/date does not match shipment register.');
  }
  const deductions: Deduction[] = deductionRows.map(row => {
    const candidates = shipments.filter(s => s.invoiceNo === row.invoice_no);
    const shipment = candidates.length === 1 ? candidates[0] : undefined;
    const warnings: string[] = [];
    if (!shipment) warnings.push('Invoice does not match exactly one shipment.');
    if (shipment && shipment.customerPo !== row.customer_po) warnings.push('Deduction PO differs from invoice shipment PO.');
    if (shipment) warnings.push(...(shipmentWarnings.get(shipment.id) || []));
    const hasScan = shipment?.documents.some(d => d.kind === 'scan');
    if (hasScan) warnings.push('Historical scan matched by filename; inspect its visible identity and acknowledgement. Availability does not establish delivery.');
    else warnings.push('No historical dock scan in supplied files. A new demo pickup cannot replace historical delivery evidence.');
    const mismatch = !shipment || shipment.customerPo !== row.customer_po || (shipmentWarnings.get(shipment.id)?.length || 0) > 0;
    return { id: row.deduction_id, sourcePortal: row.source_portal, receivedDate: row.deduction_date, customerPo: row.customer_po, invoiceNo: row.invoice_no,
      reasonCode: row.reason_code, reasonText: row.reason_text, amountUsd: Number(row.amount_usd), deadline: row.dispute_deadline,
      shipmentId: shipment?.id || null, evidenceState: mismatch ? 'mismatch' : hasScan ? 'available' : 'missing', matchWarnings: warnings, assessment: null, documents: shipment ? [...shipment.documents] : [] };
  });
  if (new Set(deductions.map(d => d.id)).size !== deductions.length) throw new Error('Duplicate deduction identifiers');
  return { shipments, deductions, documents };
}
