import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Eye, FileText, Send } from 'lucide-react';
import type { CaptureResult, DocumentRecord, Shipment, SignatureStroke } from '../../shared/contracts';
import { api, downloadBlob, recovery, RequestError } from '../api';
import type { PendingCapture } from '../api';
import { date, dateTime, docLabel, Notice, Status } from '../ui';
import PdfPane from './PdfPane';
import type { PdfLoadState, ViewerHandle } from './PdfPane';
import SignaturePad from './SignaturePad';
import TransferTrack from './TransferTrack';
import type { TrackStage } from './TransferTrack';
import { useGlider, useNewTab } from '../lib/motion-hooks';
import { echoSignature } from '../lib/flights';
import './dock-signing.css';

export { default as ShipmentList } from './ShipmentList';

type Stage = 'editing' | 'preparing' | 'sending' | 'received' | 'failed' | 'uncertain';
type Preview = 'empty' | 'updating' | 'ready' | 'error';

function hasSignature(strokes: SignatureStroke[]) {
  const points = strokes.filter(line => line.length > 1).flat().filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 3) return false;
  return Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) >= 0.015
    || Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) >= 0.015;
}

export default function Dock({ shipment, onCaptured, onAccounting }: { shipment: Shipment; onCaptured: (id: string, result: CaptureResult) => void; onAccounting: (id: string, documentId?: string) => void }) {
  const original = shipment.documents.find(doc => doc.kind === 'bol');
  const [selectedId, setSelectedId] = useState(original?.id || '');
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [stage, setStage] = useState<Stage>('editing');
  const [pending, setPending] = useState<PendingCapture | null>(null);
  const [checkedRecovery, setCheckedRecovery] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [error, setError] = useState('');
  const [recoveryWarning, setRecoveryWarning] = useState('');
  const [viewerReady, setViewerReady] = useState(false);
  const [viewedStoredId, setViewedStoredId] = useState('');
  const [viewerState, setViewerState] = useState<PdfLoadState>('loading');
  const [preview, setPreview] = useState<Preview>('empty');
  const [previewError, setPreviewError] = useState('');
  const viewer = useRef<ViewerHandle | null>(null);
  const switcher = useRef<HTMLDivElement>(null), rule = useRef<HTMLSpanElement>(null), rail = useRef<HTMLElement>(null), documentColumn = useRef<HTMLElement>(null);
  const restoreView = useRef<(() => void) | null>(null);
  const [focused, setFocused] = useState(false);
  const [trackFinale, setTrackFinale] = useState(false);
  const [arrivedId, setArrivedId] = useState('');
  const attempts = useRef(0);
  const busyRef = useRef(false);
  const previewFocused = useRef(false);
  const operationId = useRef('');
  const [pendingUrl, setPendingUrl] = useState('');
  const documents = useMemo(() => {
    const sources = shipment.documents.filter(doc => doc.kind === 'bol' || doc.kind === 'demo-pickup');
    return result && !sources.some(doc => doc.id === result.capture.id) ? [...sources, result.capture] : sources;
  }, [shipment.documents, result]);
  const selected = documents.find(doc => doc.id === selectedId) || original;
  const isPending = selectedId === 'pending' && Boolean(pending);
  const isOriginal = !isPending && selected?.kind === 'bol';
  const isStored = !isPending && selected?.kind === 'demo-pickup';
  const busy = stage === 'preparing' || stage === 'sending';
  const validSignature = hasSignature(strokes);
  const trackStage: TrackStage | null = trackFinale ? 'received' : busy || pending ? stage === 'preparing' || stage === 'sending' || stage === 'failed' ? stage : 'uncertain' : null;
  useGlider(rule, () => switcher.current?.querySelector('.source-tab--active'), [isPending, selected?.id, documents.length], { keepY: true, pad: -9 });
  useNewTab(switcher, result?.capture.id);
  useEffect(() => () => { restoreView.current = null; }, []);
  function toggleDriverFocus() {
    if (restoreView.current) { restoreView.current(); restoreView.current = null; setFocused(false); }
    else if (viewer.current) { restoreView.current = viewer.current.focusDriver(); setFocused(true); }
  }
  useEffect(() => {
    let active = true;
    recovery.read(shipment.id).then(value => {
      if (!active) return;
      if (value) { setPending(value); setSelectedId('pending'); setStage('uncertain'); operationId.current = value.operationId; }
    }).catch(() => { if (active) setRecoveryWarning('Recovery storage is unavailable in this browser. Keep this page open if sending fails.'); }).finally(() => { if (active) setCheckedRecovery(true); });
    return () => { active = false; };
  }, [shipment.id]);
  useEffect(() => {
    if (!pending) { setPendingUrl(''); return; }
    const url = URL.createObjectURL(new Blob([pending.bytes], { type: 'application/pdf' }));
    setPendingUrl(url); return () => URL.revokeObjectURL(url);
  }, [pending]);
  function ready(handle: ViewerHandle | null) {
    viewer.current = handle; setViewerReady(Boolean(handle));
    if (!handle) { restoreView.current = null; setFocused(false); previewFocused.current = false; setPreview('empty'); }
    if (handle && isStored && selected) { setViewedStoredId(selected.id); handle.focusSignature(); }
  }
  useEffect(() => {
    const handle = viewer.current;
    if (!handle || !viewerReady || !isOriginal || pending || busy) return;
    let active = true;
    setPreviewError('');
    if (!validSignature) {
      setPreview('empty');
      previewFocused.current = false;
      handle.clearSignature().catch(reason => {
        if (active) { setPreview('error'); setPreviewError(reason instanceof Error ? reason.message : 'The signature preview could not clear. Reopen the document to try again.'); }
      });
      return () => { active = false; };
    }
    setPreview('updating');
    const timer = window.setTimeout(() => {
      handle.setSignature(strokes).then(() => {
        if (!active) return;
        if (!previewFocused.current) { handle.focusSignature(); previewFocused.current = true; }
        setPreview('ready');
      }).catch(reason => {
        if (active) { setPreview('error'); setPreviewError(reason instanceof Error ? reason.message : 'The signature preview could not update. Reopen the document to try again.'); }
      });
    }, 140);
    return () => { active = false; window.clearTimeout(timer); };
  }, [strokes, validSignature, viewerReady, isOriginal, pending, busy]);
  async function send(work: PendingCapture) {
    setStage('sending');
    const response = await api.capture(shipment.id, work.bytes, work.operationId, work.sourceDocumentId);
    setTrackFinale(true); setArrivedId(response.capture.id); attempts.current = 0;
    setResult(response); onCaptured(shipment.id, response);
    await recovery.remove(shipment.id).catch(() => undefined);
    setPending(null); setStrokes([]); setSelectedId(response.capture.id); setStage('received'); setError('');
  }
  async function saveAndSend() {
    if (busyRef.current || !checkedRecovery) return;
    if (!pending && (!viewer.current || !validSignature || preview !== 'ready' || !original)) return;
    busyRef.current = true; setError('');
    try {
      if (pending) { attempts.current += 1; await send(pending); return; }
      echoSignature(rail.current?.querySelector<SVGSVGElement>('.signature-pad') || null, strokes, viewer.current?.driverClientRect() || null, documentColumn.current?.querySelector('.pdf-pane')?.getBoundingClientRect() || null);
      setStage('preparing');
      const handle = viewer.current!;
      // Flush the latest pad strokes after all preview work, before export.
      await handle.setSignature(strokes);
      const bytes = await handle.exportFlattened();
      operationId.current ||= crypto.randomUUID();
      const work = { shipmentId: shipment.id, sourceDocumentId: original!.id, operationId: operationId.current, createdAt: new Date().toISOString(), bytes };
      await recovery.write(work).catch(() => setRecoveryWarning('Keep this page open until the service confirms receipt. Recovery storage is unavailable.'));
      setPending(work); setSelectedId('pending');
      await send(work);
    } catch (reason) {
      setStage(reason instanceof RequestError && reason.uncertain ? 'uncertain' : 'failed');
      setError(reason instanceof Error ? reason.message : 'The PDF could not be saved. Your work is kept for retry.');
    } finally { busyRef.current = false; }
  }
  function editSignature(value: SignatureStroke[]) { setStrokes(value); setPreview('empty'); if (stage === 'failed') setStage('editing'); }
  function selectDocument(doc: DocumentRecord) {
    if (busy || doc.id === selectedId) return;
    setSelectedId(doc.id);
    if (doc.kind === 'bol') { setStrokes([]); operationId.current = ''; }
  }
  return <main className="workspace document-workspace" data-preview-state={preview}>
    <div className="breadcrumbs"><a href="#/dock"><ArrowLeft size={14} />Shipments</a><span>/</span><span>{shipment.id}</span></div>
    <div className="page-heading document-heading"><div><div className="title-line"><h1>{isStored ? 'Pickup record' : 'Review and sign'}</h1><span className="shipment-reference">{shipment.id}</span></div><p className="subtitle">{shipment.customer} <span className="subtitle-divider">/</span> {shipment.destination}</p></div><span className="quiet-meta">Dock pickup · Plant {shipment.plant}</span></div>
    <div className="work-split dock-split">
      <section ref={documentColumn} className="document-column" aria-label="Shipment document">
        <div ref={switcher} className="source-switcher" aria-label="Document versions"><span ref={rule} className="source-rule" aria-hidden="true" />{documents.map(doc => <button key={doc.id} data-document-id={doc.id} className={`source-tab ${!isPending && selected?.id === doc.id ? 'source-tab--active' : ''}`} onClick={() => selectDocument(doc)} disabled={busy || Boolean(pending)} aria-pressed={!isPending && selected?.id === doc.id}><FileText size={15} />{docLabel(doc)}{doc.kind === 'demo-pickup' && <span className="source-tab-time">{dateTime(doc.createdAt)}</span>}</button>)}{pending && <button className={`source-tab ${isPending ? 'source-tab--active' : ''}`} onClick={() => setSelectedId('pending')} aria-pressed={isPending}><FileText size={15} />Prepared pickup</button>}</div>
        <div className="document-caption"><span>{isPending ? 'Prepared PDF · receipt pending' : isStored ? `Demo pickup · ${dateTime(selected?.createdAt)}` : 'Original BOL · supplied sample'}</span><span className="document-filename" title={selected?.name}>{isPending ? 'Retained for retry' : selected?.name}</span></div>
        <PdfPane url={isPending ? pendingUrl : selected?.url} title={`BOL for ${shipment.id}`} readOnly={!isOriginal || Boolean(pending)} onReady={ready} onStateChange={setViewerState} />
      </section>
      <aside ref={rail} className="task-rail" aria-label="Pickup task">
        <div className="rail-section shipment-summary"><div className="eyebrow">Carrier</div><div className="carrier-name">{shipment.carrier}</div><p className="load-summary">{shipment.pallets} pallets · {shipment.totalWeightLb.toLocaleString()} lb</p><details className="shipment-details"><summary>Shipment details</summary><dl className="compact-facts"><div><dt>Ship date</dt><dd>{date(shipment.shipDate, true)}</dd></div><div><dt>Customer PO</dt><dd>{shipment.customerPo || 'Not supplied'}</dd></div></dl></details></div>
        {trackStage && <TransferTrack stage={trackStage} attempt={attempts.current} onDone={() => setTrackFinale(false)} />}
        {isOriginal && !pending ? <div className="rail-section signing-section"><div className="signing-body"><h2>Sign for pickup</h2><button className="text-button acknowledgement-link" disabled={!viewerReady} onClick={toggleDriverFocus}><Eye size={15} />{focused ? 'Back to page' : 'Show driver acknowledgement'}</button><SignaturePad strokes={strokes} onChange={editSignature} disabled={busy || !checkedRecovery} /><div className="signature-preview-status" aria-live="polite">{preview === 'ready' ? <Status tone="success">Signature previewed on BOL</Status> : preview === 'updating' ? <Status busy>Updating preview</Status> : <span className="microcopy">Preview on the BOL before sending.</span>}</div>{previewError && <Notice tone="error">{previewError}</Notice>}{error && <Notice tone="error">{error}</Notice>}</div><div className="signing-actions"><button className="button button--primary button--full button--touch" onClick={saveAndSend} disabled={busy || !viewerReady || !validSignature || preview !== 'ready' || !checkedRecovery}>{busy ? <Status busy>{stage === 'preparing' ? 'Preparing PDF' : 'Sending PDF'}</Status> : <><Send size={17} />{stage === 'failed' ? 'Try save and send again' : 'Save and send'}</>}</button><p className="microcopy">Sends a flattened PDF to the demo server.</p></div></div> : pending ? <div className="rail-section transfer-section" aria-live="polite"><div className="transfer-mark"><Send size={22} /></div><h2>{stage === 'preparing' ? 'Preparing PDF' : stage === 'sending' ? 'Sending pickup' : stage === 'uncertain' ? 'Receipt unconfirmed' : 'Send failed'}</h2><p className="body-small">{stage === 'sending' ? 'Waiting for durable storage confirmation from the demo server.' : 'Your prepared PDF is kept. Retry sends the same version and checks the same operation.'}</p>{error && <Notice tone="error">{error}</Notice>}{busy ? null : <button className="button button--primary button--full button--touch" onClick={saveAndSend}><Send size={17} />Retry send</button>}<button className="text-button local-copy" disabled={busy} onClick={() => downloadBlob(new Blob([pending.bytes], { type: 'application/pdf' }), `${shipment.id}-prepared-pickup.pdf`)}><ArrowDownToLine size={15} />Download prepared copy</button><details className="record-details"><summary>Transfer reference</summary><dl><dt>Operation</dt><dd className="hash-text">{pending.operationId}</dd><dt>Prepared</dt><dd>{dateTime(pending.createdAt)}</dd></dl></details></div> : isStored ? <div className={'rail-section receipt-section' + (selected?.id === arrivedId ? ' receipt-section--arrive' : '')} aria-live="polite"><div className="transfer-mark transfer-mark--success"><Check size={24} /></div><h2>{result?.capture.id === selected?.id ? 'Received by demo server' : 'Stored demo pickup'}</h2><p className="body-small">{dateTime(result?.capture.id === selected?.id ? result.receipt.receivedAt : selected?.createdAt)}</p><Status tone={viewerState === 'error' ? 'warning' : viewerState === 'ready' && viewedStoredId === selected?.id ? 'success' : 'neutral'} busy={viewerState === 'loading'}>{viewerState === 'error' ? 'Stored PDF unavailable' : viewerState === 'ready' && viewedStoredId === selected?.id ? 'Stored PDF reopened' : 'Opening stored PDF'}</Status><button className="button button--primary button--full button--touch" onClick={() => onAccounting(shipment.id, selected?.id)}>Open in Accounting<ArrowRight size={17} /></button><a className="text-button" href={selected?.url} download={selected?.name}><ArrowDownToLine size={15} />Download stored PDF</a><details className="record-details"><summary>Record details</summary><dl><dt>Capture</dt><dd className="hash-text">{result?.capture.id === selected?.id ? result.receipt.id : selected?.captureId || selected?.id}</dd><dt>SHA-256</dt><dd className="hash-text">{selected?.sha256 || result?.receipt.sha256 || 'Not supplied'}</dd></dl></details></div> : <div className="rail-section"><Notice>No original BOL is available for signing.</Notice></div>}
        {recoveryWarning && <div className="rail-section"><Notice tone="warning">{recoveryWarning}</Notice></div>}
        <div className="rail-section provenance"><span className="provenance-label">Demo pickup</span><p>A pickup acknowledgement is separate from retailer delivery evidence. Original documents stay unchanged.</p></div>
      </aside>
    </div>
  </main>;
}
