import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Eye, FileText, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import Receiving from './Receiving';
import { chronologicalBolRecords } from '../../shared/bol-records';
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

export function hasSignature(strokes: SignatureStroke[]) {
  const points = strokes.filter(line => line.length > 1).flat().filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (points.length < 3) return false;
  return Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)) >= 0.015
    || Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)) >= 0.015;
}

export interface DockProps { active?: boolean; requestedTask?: 'pickup' | 'receiving'; taskRequest?: number; shipment: Shipment; onCaptured: (id: string, result: CaptureResult) => void; onAccounting: (id: string, documentId?: string) => void; }
export default function Dock(props: DockProps) {
  const [mode, setMode] = useState<'pickup' | 'receiving'>(() => props.requestedTask ?? (new URLSearchParams(location.hash.split('?')[1] || '').get('task') === 'receiving' ? 'receiving' : 'pickup'));
  const [visited, setVisited] = useState(mode === 'receiving'), [checked, setChecked] = useState(false), [locked, setLocked] = useState(false);
  useEffect(() => { let active = true; recovery.read(props.shipment.id).then(work => { if (active && work) { setMode(work.receiving ? 'receiving' : 'pickup'); if (work.receiving) setVisited(true); } }).catch(() => undefined).finally(() => { if (active) setChecked(true); }); return () => { active = false; }; }, [props.shipment.id]);
  // A presentation entry selects the stage once; manual switches and retained work stay usable.
  const appliedTask = useRef(`${props.requestedTask || ''}:${props.taskRequest || 0}`);
  useEffect(() => {
    if (!props.requestedTask || !checked || locked) return;
    const request = `${props.requestedTask}:${props.taskRequest || 0}`;
    if (appliedTask.current === request) return;
    appliedTask.current = request;
    setMode(props.requestedTask);
    if (props.requestedTask === 'receiving') setVisited(true);
  }, [props.requestedTask, props.taskRequest, checked, locked]);
  function choose(next: 'pickup' | 'receiving') { if (locked) return; setMode(next); if (next === 'receiving') setVisited(true); if (location.hash.startsWith('#/dock/')) history.replaceState(null, '', location.hash.split('?')[0] + (next === 'receiving' ? '?task=receiving' : '')); }
  const latestPickup = chronologicalBolRecords(props.shipment.documents).filter(doc => doc.kind === 'demo-pickup').at(-1);
  const hasPickup = Boolean(latestPickup);
  const activitySwitch = <nav className="dock-activity-switch" aria-label="Acknowledgement stage"><button aria-pressed={mode === 'pickup'} disabled={locked && mode !== 'pickup'} onClick={() => choose('pickup')}><span>1</span>Driver pickup</button><button aria-pressed={mode === 'receiving'} disabled={locked && mode !== 'receiving'} onClick={() => choose('receiving')}><span>2</span>Receiver delivery</button></nav>;
  if (!checked) return <main className="workspace"><Status busy>Opening shipment</Status></main>;
  return <><div className="dock-activity-host" hidden={mode !== 'pickup'}><PickupDock {...props} active={props.active !== false && mode === 'pickup'} activitySwitch={activitySwitch} onReceiving={() => choose('receiving')} onLockChange={setLocked} /></div>{visited && <div className="dock-activity-host" hidden={mode !== 'receiving'}>{hasPickup ? <Receiving key={latestPickup?.id || 'original'} {...props} active={props.active !== false && mode === 'receiving'} activitySwitch={activitySwitch} onLockChange={setLocked} /> : <main className="workspace document-workspace receiving-workspace"><div className="breadcrumbs"><a href="#/dock"><ArrowLeft size={14} />Shipments</a><span>/</span><span>{props.shipment.id}</span></div><div className="page-heading document-heading"><div><h1>Acknowledge delivery</h1><p className="subtitle">{props.shipment.customer} · {props.shipment.destination}</p></div></div>{activitySwitch}<div className="receiving-prerequisite"><FileText size={28} /><h2>Start with the driver’s signed BOL</h2><p>Save the pickup first. Then the receiver adds their signature and delivery details to that same document.</p><button className="button button--primary" onClick={() => choose('pickup')}>Sign driver pickup<ArrowRight size={16} /></button></div></main>}</div>}</>;
}
function PickupDock({ shipment, onCaptured, onAccounting, activitySwitch, onReceiving, onLockChange, active }: DockProps & { activitySwitch: ReactNode; active: boolean; onReceiving: () => void; onLockChange: (value: boolean) => void }) {
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
  const signingDate = useRef<string | null>(null);
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
  useEffect(() => { onLockChange(busy || Boolean(pending)); }, [busy, pending, onLockChange]);
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
      if (value && !value.receiving) { setPending(value); setSelectedId('pending'); setStage('uncertain'); operationId.current = value.operationId; }
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
    const date = signingDate.current;
    if (!date) { setPreview('error'); setPreviewError('Clear and sign again to set the signing date.'); return; }
    const timer = window.setTimeout(() => {
      handle.setSignature(strokes, date).then(() => {
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
    setPending(null); setStrokes([]); signingDate.current = null; setSelectedId(response.capture.id); setStage('received'); setError('');
  }
  async function saveAndSend() {
    if (busyRef.current || !checkedRecovery) return;
    const date = signingDate.current;
    if (!pending && (!viewer.current || !validSignature || preview !== 'ready' || !original || !date)) return;
    busyRef.current = true; setError('');
    try {
      if (pending) { attempts.current += 1; await send(pending); return; }
      echoSignature(rail.current?.querySelector<SVGSVGElement>('.signature-pad') || null, strokes, viewer.current?.driverClientRect() || null, documentColumn.current?.querySelector('.pdf-pane')?.getBoundingClientRect() || null);
      setStage('preparing');
      const handle = viewer.current!;
      // Flush the latest pad strokes after all preview work, before export.
      await handle.setSignature(strokes, date!);
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
  function editSignature(value: SignatureStroke[]) {
    if (!value.length) signingDate.current = null;
    else if (!signingDate.current && hasSignature(value)) {
      signingDate.current = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
    }
    setStrokes(value); setPreview('empty'); if (stage === 'failed') setStage('editing');
  }
  function selectDocument(doc: DocumentRecord) {
    if (busy || doc.id === selectedId) return;
    setSelectedId(doc.id);
    if (doc.kind === 'bol') { setStrokes([]); signingDate.current = null; operationId.current = ''; }
  }
  return <main className="workspace document-workspace" data-preview-state={preview}>
    <div className="breadcrumbs"><a href="#/dock"><ArrowLeft size={14} />Shipments</a><span>/</span><span>{shipment.id}</span></div>
    <div className="page-heading document-heading"><div><div className="title-line"><h1>{isStored ? 'Pickup record' : 'Review and sign'}</h1><span className="shipment-reference">{shipment.id}</span></div><p className="subtitle">{shipment.customer} <span className="subtitle-divider">/</span> {shipment.destination}</p></div><span className="quiet-meta">Dock pickup · Plant {shipment.plant}</span></div>
    {activitySwitch}
    <div className="work-split dock-split">
      <section ref={documentColumn} className="document-column" aria-label="Shipment document">
        <div ref={switcher} className="source-switcher" aria-label="Document versions"><span ref={rule} className="source-rule" aria-hidden="true" />{documents.map(doc => <button key={doc.id} data-document-id={doc.id} className={`source-tab ${!isPending && selected?.id === doc.id ? 'source-tab--active' : ''}`} onClick={() => selectDocument(doc)} disabled={busy || Boolean(pending)} aria-pressed={!isPending && selected?.id === doc.id}><FileText size={15} />{docLabel(doc)}{doc.kind === 'demo-pickup' && <span className="source-tab-time">{dateTime(doc.createdAt)}</span>}</button>)}{pending && <button className={`source-tab ${isPending ? 'source-tab--active' : ''}`} onClick={() => setSelectedId('pending')} aria-pressed={isPending}><FileText size={15} />Prepared pickup</button>}</div>
        <div className="document-caption"><span>{isPending ? 'Prepared PDF · receipt pending' : isStored ? `Demo pickup · ${dateTime(selected?.createdAt)}` : 'Original BOL · supplied sample'}</span><span className="document-filename" title={selected?.name}>{isPending ? 'Retained for retry' : selected?.name}</span></div>
        <PdfPane active={active} url={isPending ? pendingUrl : selected?.url} title={`BOL for ${shipment.id}`} readOnly={!isOriginal || Boolean(pending)} onReady={ready} onStateChange={setViewerState} />
      </section>
      <aside ref={rail} className="task-rail" aria-label="Pickup task">
        <div className="rail-section shipment-summary"><div className="eyebrow">Carrier</div><div className="carrier-name">{shipment.carrier}</div><p className="load-summary">{shipment.pallets} pallets · {shipment.totalWeightLb.toLocaleString()} lb</p><details className="shipment-details"><summary>Shipment details</summary><dl className="compact-facts"><div><dt>Ship date</dt><dd>{date(shipment.shipDate, true)}</dd></div><div><dt>Customer PO</dt><dd>{shipment.customerPo || 'Not supplied'}</dd></div></dl></details></div>
        {trackStage && <TransferTrack stage={trackStage} attempt={attempts.current} onDone={() => setTrackFinale(false)} />}
        {isOriginal && !pending ? <div className="rail-section signing-section"><div className="signing-body"><h2>Sign for pickup</h2><button className="text-button acknowledgement-link" disabled={!viewerReady} onClick={toggleDriverFocus}><Eye size={15} />{focused ? 'Back to page' : 'Show driver acknowledgement'}</button><SignaturePad strokes={strokes} onChange={editSignature} disabled={busy || !checkedRecovery} /><div className="signature-preview-status" aria-live="polite">{preview === 'ready' ? <Status tone="success">Signature previewed on BOL</Status> : preview === 'updating' ? <Status busy>Updating preview</Status> : <span className="microcopy">Preview on the BOL before sending.</span>}</div>{previewError && <Notice tone="error">{previewError}</Notice>}{error && <Notice tone="error">{error}</Notice>}</div><div className="signing-actions"><button className="button button--primary button--full button--touch" onClick={saveAndSend} disabled={busy || !viewerReady || !validSignature || preview !== 'ready' || !checkedRecovery}>{busy ? <Status busy>{stage === 'preparing' ? 'Preparing PDF' : 'Sending PDF'}</Status> : <><Send size={17} />{stage === 'failed' ? 'Try save and send again' : 'Save and send'}</>}</button><p className="microcopy">Sends a flattened PDF to the demo server.</p></div></div> : pending ? <div className="rail-section transfer-section" aria-live="polite"><div className="transfer-mark"><Send size={22} /></div><h2>{stage === 'preparing' ? 'Preparing PDF' : stage === 'sending' ? 'Sending pickup' : stage === 'uncertain' ? 'Receipt unconfirmed' : 'Send failed'}</h2><p className="body-small">{stage === 'sending' ? 'Waiting for durable storage confirmation from the demo server.' : 'Your prepared PDF is kept. Retry sends the same version and checks the same operation.'}</p>{error && <Notice tone="error">{error}</Notice>}{busy ? null : <button className="button button--primary button--full button--touch" onClick={saveAndSend}><Send size={17} />Retry send</button>}<button className="text-button local-copy" disabled={busy} onClick={() => downloadBlob(new Blob([pending.bytes], { type: 'application/pdf' }), `${shipment.id}-prepared-pickup.pdf`)}><ArrowDownToLine size={15} />Download prepared copy</button><details className="record-details"><summary>Transfer reference</summary><dl><dt>Operation</dt><dd className="hash-text">{pending.operationId}</dd><dt>Prepared</dt><dd>{dateTime(pending.createdAt)}</dd></dl></details></div> : isStored ? <div className={'rail-section receipt-section' + (selected?.id === arrivedId ? ' receipt-section--arrive' : '')} aria-live="polite"><div className="transfer-mark transfer-mark--success"><Check size={24} /></div><h2>{result?.capture.id === selected?.id ? 'Received by demo server' : 'Stored demo pickup'}</h2><p className="body-small">{dateTime(result?.capture.id === selected?.id ? result.receipt.receivedAt : selected?.createdAt)}</p><Status tone={viewerState === 'error' ? 'warning' : viewerState === 'ready' && viewedStoredId === selected?.id ? 'success' : 'neutral'} busy={viewerState === 'loading'}>{viewerState === 'error' ? 'Stored PDF unavailable' : viewerState === 'ready' && viewedStoredId === selected?.id ? 'Stored PDF reopened' : 'Opening stored PDF'}</Status><button className="button button--primary button--full button--touch" onClick={() => onAccounting(shipment.id, selected?.id)}>Open in Accounting<ArrowRight size={17} /></button><button className="button button--secondary button--full" onClick={onReceiving}>Acknowledge delivery<ArrowRight size={16} /></button><a className="text-button" href={selected?.url} download={selected?.name}><ArrowDownToLine size={15} />Download stored PDF</a><details className="record-details"><summary>Record details</summary><dl><dt>Capture</dt><dd className="hash-text">{result?.capture.id === selected?.id ? result.receipt.id : selected?.captureId || selected?.id}</dd><dt>SHA-256</dt><dd className="hash-text">{selected?.sha256 || result?.receipt.sha256 || 'Not supplied'}</dd></dl></details></div> : <div className="rail-section"><Notice>No original BOL is available for signing.</Notice></div>}
        {recoveryWarning && <div className="rail-section"><Notice tone="warning">{recoveryWarning}</Notice></div>}
        <div className="rail-section provenance"><span className="provenance-label">Demo pickup</span><p>A pickup acknowledgement is separate from retailer delivery evidence. Original documents stay unchanged.</p></div>
      </aside>
    </div>
  </main>;
}
