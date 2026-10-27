import { appUrl } from './lib/base-path';
import type { Assessment, Bootstrap, CaptureResult, Deduction, Shipment, ReceivingDetails } from '../shared/contracts';

export class RequestError extends Error {
  constructor(message: string, public uncertain = false) { super(message); this.name = 'RequestError'; }
}

async function request(path: string, init?: RequestInit, transfer = false): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(appUrl(path), { ...init, signal: controller.signal });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const detail = typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : null;
      throw new RequestError(detail || `The demo service returned ${response.status}. Please retry.`, transfer && response.status >= 500);
    }
    return response;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(transfer ? 'The service receipt could not be confirmed. Your prepared PDF is kept for retry.' : 'The demo service could not be reached. Please retry.', transfer);
  } finally { window.clearTimeout(timer); }
}

export const api = {
  bootstrap: async (): Promise<Bootstrap> => (await request('/api/bootstrap')).json(),
  shipment: async (id: string): Promise<Shipment> => (await request(`/api/shipments/${encodeURIComponent(id)}`)).json(),
  deduction: async (id: string): Promise<Deduction> => (await request(`/api/deductions/${encodeURIComponent(id)}`)).json(),
  capture: async (shipmentId: string, bytes: ArrayBuffer, operationId: string, sourceDocumentId: string, receiving?: ReceivingDetails): Promise<CaptureResult> => (
    await request(`/api/shipments/${encodeURIComponent(shipmentId)}/captures`, {
      method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Operation-Id': operationId, 'X-Source-Document-Id': sourceDocumentId, ...(receiving ? { 'X-Capture-Kind': 'demo-receiving', 'X-Receiving-Details': encodeURIComponent(JSON.stringify(receiving)) } : {}) }, body: bytes,
    }, true)
  ).json(),
  assessment: async (id: string, value: Pick<Assessment, 'status' | 'note' | 'citations' | 'sourceDocumentId' | 'pageNumber'>): Promise<Assessment> => (
    await request(`/api/deductions/${encodeURIComponent(id)}/assessment`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) })
  ).json(),
  packet: async (id: string): Promise<{ blob: Blob; filename: string }> => {
    const response = await request(`/api/deductions/${encodeURIComponent(id)}/packet`);
    const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/)?.[1] || `${id}-evidence.zip`;
    return { blob: await response.blob(), filename };
  },
};

export interface PendingCapture {
  shipmentId: string; sourceDocumentId: string; operationId: string; createdAt: string; bytes: ArrayBuffer; receiving?: ReceivingDetails;
}

async function pendingStore<T>(mode: IDBTransactionMode, perform: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ridgeline-capture-recovery', 1);
    open.onupgradeneeded = () => { open.result.createObjectStore('pending', { keyPath: 'shipmentId' }); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('pending', mode);
      const task = perform(transaction.objectStore('pending'));
      let result: T;
      task.onsuccess = () => { result = task.result; };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

export const recovery = {
  read: (shipmentId: string) => pendingStore<PendingCapture | undefined>('readonly', store => store.get(shipmentId)),
  write: (capture: PendingCapture) => pendingStore<IDBValidKey>('readwrite', store => store.put(capture)),
  remove: (shipmentId: string) => pendingStore<undefined>('readwrite', store => store.delete(shipmentId)),
};

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
