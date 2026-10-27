import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Eye, FileText, Send } from 'lucide-react';
import type { CaptureResult, ReceivingDetails, SignatureStroke } from '../../shared/contracts';
import { chronologicalBolRecords } from '../../shared/bol-records';
import { receivingDefaults, receivingError } from '../../shared/receiving';
import { api, downloadBlob, recovery, RequestError } from '../api';
import type { PendingCapture } from '../api';
import { dateTime, docLabel, Notice, Status } from '../ui';
import PdfPane from './PdfPane';
import type { ViewerHandle } from './PdfPane';
import SignaturePad from './SignaturePad';
import TransferTrack from './TransferTrack';
import type { DockProps } from './Dock';
import { hasSignature } from './Dock';

const profileKey = 'ridgeline-receiver-name:v1';
export default function Receiving({ shipment, onCaptured, onAccounting, activitySwitch, onLockChange, active }: DockProps & { activitySwitch: ReactNode; active: boolean; onLockChange: (value: boolean) => void }) {
  const draftKey = 'ridgeline-receiving-draft:v1:' + shipment.id;
  const orderedRecords = chronologicalBolRecords(shipment.documents);
  const pickup = orderedRecords.filter(doc => doc.kind === 'demo-pickup').at(-1);
  // A new receiving record starts from the saved pickup, never an old receiving record.
  const [baseId, setBaseId] = useState(pickup?.id);
  const base = shipment.documents.find(doc => doc.id === baseId);
  const [fields, setFields] = useState<ReceivingDetails>(() => {
    try { const draft = JSON.parse(localStorage.getItem(draftKey) || 'null'); if (draft && typeof draft.receiverName === 'string' && typeof draft.receivedDate === 'string' && typeof draft.palletsReceived === 'number' && typeof draft.exceptions === 'string') return draft; } catch { /* Browser storage is optional. */ }
    let name = ''; try { name = localStorage.getItem(profileKey) || ''; } catch { /* Optional convenience. */ }
    return receivingDefaults(shipment, name);
  });
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]), [confirmed, setConfirmed] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(Boolean(fields.exceptions));
  const [stage, setStage] = useState<'editing' | 'preparing' | 'sending' | 'failed' | 'uncertain' | 'received'>('editing');
  const [pending, setPending] = useState<PendingCapture | null>(null), [checked, setChecked] = useState(false);
  const [storedId, setStoredId] = useState(orderedRecords.filter(doc => doc.kind === 'demo-receiving' && doc.sourceDocumentId === pickup?.id).at(-1)?.id || ''), [result, setResult] = useState<CaptureResult | null>(null);
  const [openedId, setOpenedId] = useState('');
  const [url, setUrl] = useState(''), [ready, setReady] = useState(false), [preview, setPreview] = useState('empty');
  const [error, setError] = useState(''), [warning, setWarning] = useState('');
  const viewer = useRef<ViewerHandle | null>(null), busyRef = useRef(false), previewFocused = useRef(false);
  const restore = useRef<(() => void) | null>(null), [focused, setFocused] = useState(false);
  const busy = stage === 'preparing' || stage === 'sending';
  const stored = shipment.documents.find(doc => doc.id === storedId) || (result?.capture.id === storedId ? result.capture : undefined);
  const records = orderedRecords.filter(doc => doc.kind === 'demo-receiving' && doc.sourceDocumentId === baseId);
  const validInk = hasSignature(strokes), fieldError = receivingError(fields, shipment.pallets);
  const notesRequired = fields.palletsReceived !== shipment.pallets || exceptionsOpen;
  const valid = !fieldError && (!notesRequired || Boolean(fields.exceptions.trim()));
  useEffect(() => { onLockChange(busy || Boolean(pending)); }, [busy, pending, onLockChange]);
  useEffect(() => { try { localStorage.setItem(draftKey, JSON.stringify(fields)); } catch { /* Keep live fields usable. */ } }, [fields, draftKey]);
  useEffect(() => { let active = true; recovery.read(shipment.id).then(work => { if (active && work?.receiving) { setFields(work.receiving); setBaseId(work.sourceDocumentId); setStoredId(''); setPending(work); setStage('uncertain'); } }).catch(() => setWarning('Keep this page open if sending fails. Browser recovery is unavailable.')).finally(() => { if (active) setChecked(true); }); return () => { active = false; }; }, [shipment.id]);
  useEffect(() => { if (!pending) { setUrl(''); return; } const objectUrl = URL.createObjectURL(new Blob([pending.bytes], { type: 'application/pdf' })); setUrl(objectUrl); return () => URL.revokeObjectURL(objectUrl); }, [pending]);
  useEffect(() => {
    const handle = viewer.current;
    if (!handle || !ready || pending || stored || busy) return;
    let active = true; setError('');
    if (!validInk || !valid) { setPreview('empty'); handle.clearSignature().catch(reason => { if (active) setError(reason.message); }); return () => { active = false; }; }
    setPreview('updating');
    const timer = setTimeout(() => {
      const date = new Date(fields.receivedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      handle.setSignature(strokes, date, fields).then(() => { if (!active) return; if (!previewFocused.current) { handle.focusSignature(); previewFocused.current = true; } setPreview('ready'); }).catch(reason => { if (active) { setPreview('error'); setError(reason.message); } });
    }, 140);
    return () => { active = false; clearTimeout(timer); };
  }, [fields, strokes, ready, validInk, valid, pending, stored, busy]);
  function edit(patch: Partial<ReceivingDetails>) { setFields(value => ({ ...value, ...patch })); setConfirmed(false); setPreview('empty'); }
  function onReady(handle: ViewerHandle | null) { viewer.current = handle; setReady(Boolean(handle)); if (!handle) { setPreview('empty'); previewFocused.current = false; restore.current = null; setFocused(false); } else if (stored || pending) { handle.focusSignature(); if (stored) setOpenedId(stored.id); } }
  async function save() {
    if (busyRef.current || !checked || !base) return;
    if (!pending && (!valid || !validInk || !confirmed || preview !== 'ready' || !viewer.current)) return;
    busyRef.current = true; setError('');
    try {
      let work = pending;
      if (!work) {
        setStage('preparing');
        await viewer.current!.setSignature(strokes, new Date(fields.receivedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), fields);
        const bytes = await viewer.current!.exportFlattened();
        work = { shipmentId: shipment.id, sourceDocumentId: base.id, operationId: crypto.randomUUID(), createdAt: new Date().toISOString(), bytes, receiving: { ...fields, receiverName: fields.receiverName.trim(), exceptions: fields.exceptions.trim() } };
        await recovery.write(work).catch(() => setWarning('Keep this page open until receipt is confirmed. Browser recovery is unavailable.'));
        setPending(work);
      }
      setStage('sending');
      const response = await api.capture(shipment.id, work.bytes, work.operationId, work.sourceDocumentId, work.receiving);
      setResult(response); onCaptured(shipment.id, response); setStoredId(response.capture.id);
      await recovery.remove(shipment.id).catch(() => undefined);
      try { localStorage.setItem(profileKey, work.receiving!.receiverName); localStorage.removeItem(draftKey); } catch { /* Optional convenience. */ }
      setPending(null); setStrokes([]); setConfirmed(false); setStage('received');
    } catch (reason) { setStage(reason instanceof RequestError && reason.uncertain ? 'uncertain' : 'failed'); setError(reason instanceof Error ? reason.message : 'Receiving could not be saved. Your prepared PDF is kept for retry.'); }
    finally { busyRef.current = false; }
  }
  const details = stored?.receiving || pending?.receiving;
  return <main className="workspace document-workspace receiving-workspace" data-preview-state={preview}>
    <div className="breadcrumbs"><a href="#/dock"><ArrowLeft size={14} />Shipments</a><span>/</span><span>{shipment.id}</span></div>
    <div className="page-heading document-heading"><div><div className="title-line"><h1>{stored ? 'Signed delivery BOL' : 'Acknowledge delivery'}</h1><span className="shipment-reference">{shipment.id}</span></div><p className="subtitle">{shipment.customer}<span className="subtitle-divider">/</span>{shipment.destination}</p></div><span className="quiet-meta">Receiver delivery</span></div>
    {activitySwitch}
    <div className="work-split dock-split receiving-split">
      <section className="document-column" aria-label="Receiving document">
        <nav className="source-switcher" aria-label="Receiving versions"><button className={'source-tab' + (!stored && !pending ? ' source-tab--active' : '')} aria-pressed={!stored && !pending} disabled={busy || Boolean(pending)} onClick={() => { setStoredId(''); setStrokes([]); setConfirmed(false); }}><FileText size={15} />{base?.kind === 'demo-pickup' ? 'Pickup BOL' : 'Original BOL'}</button>{records.map(doc => <button key={doc.id} data-document-id={doc.id} className={'source-tab' + (stored?.id === doc.id ? ' source-tab--active' : '')} aria-pressed={stored?.id === doc.id} disabled={busy || Boolean(pending)} onClick={() => setStoredId(doc.id)}><FileText size={15} />{docLabel(doc, shipment.documents)}<span className="source-tab-time">{dateTime(doc.createdAt)}</span></button>)}{pending && <button className="source-tab source-tab--active" aria-pressed="true"><FileText size={15} />Prepared receiving</button>}</nav>
        {!stored && !pending && <button type="button" className="receiving-back-to-signing text-button" onClick={() => document.querySelector('.receiving-actions button')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'center' })}><ArrowLeft size={14} />Back to signing</button>}<div className="document-caption"><span>{pending ? 'Prepared receiving · receipt pending' : stored ? 'Signed BOL · Driver + receiver · ' + dateTime(stored.createdAt) : base?.kind === 'demo-pickup' ? 'Saved pickup · add receiver acknowledgement' : 'Original BOL · add receiver acknowledgement'}</span><span className="document-filename">{stored?.name || base?.name}</span></div>
        <PdfPane active={active} url={pending ? url : stored?.url || base?.url} signer="receiver" readOnly={Boolean(pending || stored)} title={'Receiving BOL for ' + shipment.id} onReady={onReady} />
      </section>
      <aside className="task-rail receiving-rail" aria-label="Receiving task">
        <div className="rail-section receiving-context"><div className="eyebrow">Delivering to</div><h2>{shipment.customer}</h2><p className="body-small">{shipment.destination} · PO {shipment.customerPo}</p><p className="microcopy">{shipment.pallets} pallets expected · {shipment.carrier}</p></div>
        {(busy || pending) && <TransferTrack receiving stage={stage === 'preparing' || stage === 'sending' || stage === 'failed' ? stage : 'uncertain'} />}
        {stored ? <div className="rail-section receipt-section"><div className="transfer-mark transfer-mark--success"><Check size={24} /></div><h2>{result?.capture.id === stored.id ? 'Receiving saved' : 'Stored signed delivery BOL'}</h2><p className="body-small">{dateTime(stored.createdAt)}</p><Status tone={ready && openedId === stored.id ? 'success' : 'neutral'} busy={!ready || openedId !== stored.id}>{ready && openedId === stored.id ? 'Stored PDF reopened' : 'Opening stored PDF'}</Status><dl className="compact-facts"><div><dt>Received by</dt><dd>{details?.receiverName}</dd></div><div><dt>Pallets</dt><dd>{details?.palletsReceived} of {shipment.pallets} expected</dd></div><div><dt>Receiving date</dt><dd>{details?.receivedDate}</dd></div><div><dt>Exceptions</dt><dd>{details?.exceptions || 'None noted'}</dd></div></dl><button className="button button--primary button--full button--touch" onClick={() => onAccounting(shipment.id, stored.id)}>Open in Accounting<ArrowRight size={17} /></button><button className="button button--secondary button--full" onClick={() => { setFields(receivingDefaults(shipment, stored.receiving?.receiverName)); setExceptionsOpen(false); setStoredId(''); setStrokes([]); setConfirmed(false); }}>New receiving record</button><a className="text-button" href={stored.url} download={stored.name}><ArrowDownToLine size={15} />Download stored PDF</a></div>
        : pending ? <div className="rail-section transfer-section"><h2>{busy ? 'Sending receiving record' : 'Receipt unconfirmed'}</h2><p className="body-small">The PDF and receiving details are kept. Retry sends the same version and operation.</p>{error && <Notice tone="error">{error}</Notice>}<button className="button button--primary button--full button--touch" onClick={save} disabled={busy}><Send size={17} />{busy ? 'Sending PDF' : 'Retry send'}</button><button className="text-button local-copy" onClick={() => downloadBlob(new Blob([pending.bytes], { type: 'application/pdf' }), shipment.id + '-prepared-receiving.pdf')}>Download prepared copy</button></div>
        : <form className="receiving-form" onSubmit={event => { event.preventDefault(); void save(); }}><div className="receiving-form-scroll"><div className="rail-section receiving-fields"><h2>Check delivery details</h2><p className="microcopy">Date and pallet count are prefilled. Change anything before signing.</p>
          <label className="receiving-field">Receiver name<input name="receiverName" autoComplete="name" value={fields.receiverName} maxLength={60} required disabled={busy} onChange={event => edit({ receiverName: event.target.value })} placeholder="Full name" /></label>
          <div className="receiving-field-pair"><label className="receiving-field">Receiving date<input type="date" value={fields.receivedDate} required disabled={busy} onChange={event => edit({ receivedDate: event.target.value })} /></label><label className="receiving-field">Pallets received<input type="number" inputMode="numeric" min="0" max="999" step="1" value={Number.isNaN(fields.palletsReceived) ? '' : fields.palletsReceived} required disabled={busy} onChange={event => edit({ palletsReceived: event.target.value === '' ? NaN : Number(event.target.value) })} /></label></div>
          {fields.palletsReceived !== shipment.pallets && <p className="receiving-difference" role="status">{shipment.pallets} expected. Note what changed below.</p>}
          <label className="receiving-exception-toggle"><input type="checkbox" checked={exceptionsOpen || Boolean(fields.exceptions) || fields.palletsReceived !== shipment.pallets} disabled={busy || fields.palletsReceived !== shipment.pallets} onChange={event => { setExceptionsOpen(event.target.checked); if (!event.target.checked) edit({ exceptions: '' }); setConfirmed(false); }} />Shortage, damage or other exceptions</label>
          {notesRequired && <label className="receiving-field">Exceptions / notes<textarea aria-label="Exceptions / notes" value={fields.exceptions} maxLength={200} required disabled={busy} onChange={event => edit({ exceptions: event.target.value })} placeholder="What was different at delivery?" /><span className="microcopy" aria-hidden="true">{fields.exceptions.length}/200</span></label>}
        </div><div className="rail-section signing-section"><h2>Sign for delivery</h2><button type="button" className="text-button acknowledgement-link" disabled={!ready} onClick={() => { if (restore.current) { restore.current(); restore.current = null; setFocused(false); } else if (viewer.current) { restore.current = viewer.current.focusDriver(); setFocused(true); if (matchMedia('(max-width:900px)').matches) document.querySelector('.receiving-workspace .document-column')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'start' }); } }}><Eye size={15} />{focused ? 'Back to page' : 'Show receiver acknowledgement'}</button><SignaturePad signer="receiver" strokes={strokes} onChange={value => { setStrokes(value); setPreview('empty'); setConfirmed(false); }} disabled={busy || !checked} /><div className="signature-preview-status" aria-live="polite">{preview === 'ready' ? <Status tone="success">Receiving previewed on BOL</Status> : preview === 'updating' ? <Status busy>Updating preview</Status> : <span className="microcopy">{validInk && !valid ? fieldError || 'Add the exception details above.' : 'Your signature appears on the consignee line.'}</span>}</div><label className="receiving-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I checked the received count and any exceptions.</label>{error && <Notice tone="error">{error}</Notice>}</div></div><div className="receiving-actions"><button className="button button--primary button--full button--touch" type="submit" disabled={busy || !checked || !ready || !valid || !validInk || !confirmed || preview !== 'ready'}><Send size={17} />{stage === 'preparing' ? 'Preparing PDF' : 'Save receiving record'}</button><p className="microcopy">One BOL with both signatures. Pickup version stays saved.</p></div></form>}
        {warning && <div className="rail-section"><Notice tone="warning">{warning}</Notice></div>}
        <div className="rail-section provenance"><span className="provenance-label">Demo receiving</span><p>A new delivery acknowledgement with a current capture timestamp. Review it separately from historical evidence.</p></div>
      </aside>
    </div>
  </main>;
}
