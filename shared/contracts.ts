export type DocumentKind = 'bol' | 'scan' | 'invoice' | 'demo-pickup';
export interface DocumentRecord {
  id: string; shipmentId: string; kind: DocumentKind; name: string; url: string;
  createdAt?: string; sha256?: string; captureId?: string;
}
export interface Shipment {
  id: string; shipDate: string; plant: string; customer: string; destination: string;
  customerPo: string; asnId: string; invoiceNo: string; carrier: string;
  pallets: number; totalWeightLb: number; freightTerms: string; documents: DocumentRecord[];
}
export type AssessmentStatus = 'ready' | 'needs-evidence' | 'investigate';
export interface Assessment {
  deductionId: string; status: AssessmentStatus; note: string;
  sourceDocumentId?: string; pageNumber?: number; updatedAt: string;
}
export interface Deduction {
  id: string; sourcePortal: string; receivedDate: string; customerPo: string; invoiceNo: string;
  reasonCode: string; reasonText: string; amountUsd: number; deadline: string;
  shipmentId: string | null; evidenceState: 'available' | 'missing' | 'mismatch';
  matchWarnings: string[]; assessment: Assessment | null; documents: DocumentRecord[];
}
export interface Bootstrap { sampleDate: string; shipments: Shipment[]; deductions: Deduction[]; }
export interface Receipt { id: string; receivedAt: string; sha256: string; bytes: number; operationId: string; }
export interface CaptureResult { capture: DocumentRecord; receipt: Receipt; }
export interface SignaturePoint { x: number; y: number; }
export type SignatureStroke = SignaturePoint[];
