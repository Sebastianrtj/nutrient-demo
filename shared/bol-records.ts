import type { DocumentRecord } from './contracts';

export function chronologicalBolRecords(documents: readonly DocumentRecord[]) {
  const time = (doc: DocumentRecord) => {
    const value = Date.parse(doc.createdAt || '');
    return Number.isFinite(value) ? value : 0;
  };
  return documents.filter(doc => doc.kind === 'demo-pickup' || doc.kind === 'demo-receiving')
    .sort((a, b) => time(a) - time(b) || a.id.localeCompare(b.id));
}

// This identifies the saved workflow lineage. It does not authenticate ink.
export function isCombinedBol(doc: DocumentRecord, documents: readonly DocumentRecord[]) {
  return doc.kind === 'demo-receiving' && documents.some(source => source.id === doc.sourceDocumentId
    && source.kind === 'demo-pickup' && source.shipmentId === doc.shipmentId);
}

export function preferredBolRecord(documents: readonly DocumentRecord[]) {
  const records = chronologicalBolRecords(documents);
  return records.filter(doc => isCombinedBol(doc, documents)).at(-1)
    || records.filter(doc => doc.kind === 'demo-pickup').at(-1)
    || records.at(-1);
}

export function bolRecordLabel(doc: DocumentRecord, documents: readonly DocumentRecord[]) {
  return doc.kind === 'demo-pickup' ? 'Pickup BOL'
    : isCombinedBol(doc, documents) ? 'Signed BOL' : 'Receiver-only BOL';
}
