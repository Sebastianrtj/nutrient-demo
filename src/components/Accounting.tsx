import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, FileText, Save } from 'lucide-react';
import type { Assessment, Deduction, DocumentRecord, Shipment } from '../../shared/contracts';
import { accountingStatus, followUpReasons } from '../../shared/accounting-status';
import { api, downloadBlob } from '../api';
import { date, dateTime, deadlineLabel, docLabel, money, Notice, Status } from '../ui';
import PdfPane from './PdfPane';
import AccountingQueue from './AccountingQueue';
import { TableSelect } from './TableControls';
import { clearAssessmentDraft, readAssessmentDraft, writeAssessmentDraft } from '../lib/accounting-drafts';
import type { AssessmentDraftFields } from '../lib/accounting-drafts';
import { useGlider } from '../lib/motion-hooks';
import { fileIntoZip, flyCitation } from '../lib/flights';
import './accounting.css';

const outcomes = [
  { value: 'follow-up', label: 'Needs follow-up', description: 'Something must be resolved before handoff.' },
  { value: 'ready', label: 'Ready for handoff', description: 'Your review is complete for the next reviewer.' },
] as const;

export default function Accounting({ deductions, shipments, sampleDate, id, documentId, documentRequest, onAssessment }: { deductions: Deduction[]; shipments: Shipment[]; sampleDate: string; id?: string; documentId?: string; documentRequest?: number; onAssessment: (value: Assessment) => void }) {
  if (id) return <DeductionCase key={id} id={id} documentId={documentId} documentRequest={documentRequest} initial={deductions.find(item => item.id === id)} shipments={shipments} sampleDate={sampleDate} onAssessment={onAssessment} />;
  return <AccountingQueue deductions={deductions} shipments={shipments} sampleDate={sampleDate} />;
}

function initialDocument(deduction: Deduction | undefined, requestedId?: string) {
  return deduction?.documents.find(doc => doc.id === requestedId)?.id
    || deduction?.documents.find(doc => doc.id === deduction.assessment?.sourceDocumentId)?.id
    || deduction?.documents.find(doc => doc.kind === 'invoice')?.id
    || deduction?.documents[0]?.id || '';
}

function DeductionCase({ id, documentId, documentRequest, initial, shipments, sampleDate, onAssessment }: { id: string; documentId?: string; documentRequest?: number; initial?: Deduction; shipments: Shipment[]; sampleDate: string; onAssessment: (value: Assessment) => void }) {
  const [deduction, setDeduction] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState(initialDocument(initial, documentId));
  const [citationId, setCitationId] = useState(initial?.assessment ? initial.assessment.sourceDocumentId || '' : initialDocument(initial, documentId));
  const [status, setStatus] = useState<AssessmentDraftFields['status']>(initial?.assessment?.status || '');
  const [note, setNote] = useState(initial?.assessment?.note || '');
  const [page, setPage] = useState(String(initial?.assessment?.pageNumber || 1));
  const [saved, setSaved] = useState<Assessment | null>(initial?.assessment || null);
  const [busy, setBusy] = useState<'save' | 'packet' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [panel, setPanelState] = useState<'evidence' | 'assessment'>('evidence');
  const assessmentScroll = useRef<HTMLDivElement>(null), panelScroll = useRef(0);
  function setPanel(next: 'evidence' | 'assessment') {
    if (panel === 'assessment' && next !== panel) panelScroll.current = assessmentScroll.current?.scrollTop || 0;
    setPanelState(next);
  }
  useLayoutEffect(() => {
    if (panel !== 'assessment') return;
    const restore = () => { if (assessmentScroll.current) assessmentScroll.current.scrollTop = panelScroll.current; };
    restore(); const frame = requestAnimationFrame(restore); return () => cancelAnimationFrame(frame);
  }, [panel]);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftWarning, setDraftWarning] = useState('');
  const sourceList = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLSpanElement>(null), emphasis = useRef<HTMLSpanElement>(null), surface = useRef<HTMLSpanElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null), packetButton = useRef<HTMLButtonElement>(null), outcomesRef = useRef<HTMLDivElement>(null), citationFields = useRef<HTMLDivElement>(null);
  const [filed, setFiled] = useState(false);
  const filedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(filedTimer.current); }; }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    api.deduction(id).then(value => {
      if (!active) return;
      setDeduction(value); setSaved(value.assessment);
      const recovered = readAssessmentDraft(id);
      const baseline: AssessmentDraftFields = { status: value.assessment?.status || '', note: value.assessment?.note || '', page: String(value.assessment?.pageNumber || 1), citationId: value.assessment ? value.assessment.sourceDocumentId || '' : initialDocument(value, documentId) };
      const draft = recovered.draft;
      const differs = draft && (draft.status !== baseline.status || draft.note.trim() !== baseline.note || draft.citationId !== baseline.citationId || draft.page !== baseline.page);
      const fields = differs ? draft : baseline;
      setStatus(fields.status); setNote(fields.note); setPage(fields.page); setCitationId(fields.citationId);
      setDraftRestored(Boolean(differs)); setDraftWarning(recovered.warning || '');
      setSelectedId(initialDocument(value, documentId));
    }).catch(reason => {
      if (active) setLoadError(reason instanceof Error ? reason.message : 'The case could not load.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reload]);

  // Reapply explicit navigation, even when it requests the same source again.
  // This changes the view, never a saved citation or draft.
  useEffect(() => {
    if (documentId && deduction?.documents.some(doc => doc.id === documentId)) setSelectedId(documentId);
  }, [documentId, documentRequest, deduction?.documents]);

  const shipment = shipments.find(item => item.id === deduction?.shipmentId);
  const documents = deduction?.documents || [];
  const selected = documents.find(doc => doc.id === selectedId) || documents[0];
  const citation = documents.find(doc => doc.id === citationId);
  const selectedOutcome = status === 'ready' ? 'ready' : status ? 'follow-up' : '';
  const payload = { status, note: note.trim(), ...(citation ? { sourceDocumentId: citation.id, pageNumber: Number(page) } : {}) };
  const dirty = !saved || saved.status !== payload.status || saved.note !== payload.note || saved.sourceDocumentId !== payload.sourceDocumentId || saved.pageNumber !== payload.pageNumber;
  const disabled = Boolean(busy) || loading || Boolean(loadError);
  useGlider(rule, () => sourceList.current?.querySelector('.source-tab--active'), [selected?.id, documents.length, loading], { keepY: true, pad: -9 });
  useGlider(emphasis, () => dirty ? saveButton.current : packetButton.current, [dirty, loading]);
  useGlider(surface, () => outcomesRef.current?.querySelector('.outcome-option--selected'), [selectedOutcome, loading], { spring: 'snap' });
  const requestedUnavailable = !loading && Boolean(documentId) && !documents.some(doc => doc.id === documentId);
  useEffect(() => {
    sourceList.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [selectedId, documents.length]);

  async function save() {
    if (!status) throw new Error('Choose Needs follow-up or Ready for handoff before saving.');
    if (status === 'follow-up') throw new Error('Choose a follow-up reason before saving.');
    if (!note.trim()) throw new Error('Add a short note about what the evidence supports or what is missing.');
    if (citationId && !citation) throw new Error('Choose an available assessment source, or select No source citation.');
    if (citation && (!Number.isInteger(Number(page)) || Number(page) < 1)) throw new Error('Enter a source page number of 1 or more.');
    const currentDraft = readAssessmentDraft(id);
    const submittedRevision = currentDraft.draft?.status === status && currentDraft.draft.note === note
      && currentDraft.draft.citationId === citationId && currentDraft.draft.page === page ? currentDraft.revision : undefined;
    const assessment = await api.assessment(id, { ...payload, status });
    setSaved(assessment); onAssessment(assessment);
    const cleared = clearAssessmentDraft(id, submittedRevision);
    setDraftRestored(false); setDraftWarning(cleared === 'unavailable' ? 'Assessment saved. Browser storage is unavailable.' : '');
  }
  async function saveOnly() {
    if (disabled) return;
    setBusy('save'); setError(''); setMessage('');
    try { await save(); setMessage('Assessment saved'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The assessment could not save.'); }
    finally { setBusy(null); }
  }
  async function preparePacket() {
    if (disabled || dirty) return;
    setBusy('packet'); setError(''); setMessage('');
    try {
      const { blob, filename } = await api.packet(id);
      if (!blob.size) throw new Error('The evidence packet was empty. Please retry.');
      downloadBlob(blob, filename); setMessage('Packet prepared · ' + filename);
      void fileIntoZip(packetButton.current, documents.length + 1).then(() => { if (!mounted.current) return; setFiled(true); clearTimeout(filedTimer.current); filedTimer.current = setTimeout(() => setFiled(false), 2400); });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The packet could not be prepared.'); }
    finally { setBusy(null); }
  }
  function changeSource(doc: DocumentRecord) { setSelectedId(doc.id); }
  function changeDraft(changes: Partial<AssessmentDraftFields>) {
    const fields = { status, note, citationId, page, ...changes };
    setStatus(fields.status); setNote(fields.note); setCitationId(fields.citationId); setPage(fields.page); setMessage(''); setError('');
    setDraftWarning(writeAssessmentDraft(id, fields) ? '' : 'Browser storage is unavailable. Keep this tab open or save before refreshing.');
  }

  if (!deduction) return <main className="workspace"><div className="breadcrumbs"><a href="#/accounting"><ArrowLeft size={14} />Deduction queue</a></div>{loading ? <div className="empty-state"><Status busy>Loading case</Status></div> : <div className="empty-state"><h1>Case could not load</h1><p>{loadError || 'This deduction was not found.'}</p><button className="button button--secondary" onClick={() => setReload(value => value + 1)}>Retry case</button></div>}</main>;

  return <main className="workspace accounting-workspace" data-panel={panel}>
    <section className="case-context" aria-label="Case context">
      <div className="case-topline"><a href="#/accounting"><ArrowLeft size={13} />Deduction queue</a><span>Sample as of {date(sampleDate, true)}</span></div>
      <div className="case-headline">
        <div className="case-title"><h1>Review evidence</h1><span className="case-id">{deduction.id}</span></div>
        <div className="case-total"><strong>{money(deduction.amountUsd)}</strong><span>Respond by {date(deduction.deadline)} · {deadlineLabel(deduction.deadline, sampleDate)}</span></div>
      </div>
      <p className="case-reason"><span>{deduction.sourcePortal} · </span>{deduction.reasonText}</p>
      <dl className="case-identity">
        <div><dt>Shipment</dt><dd>{shipment ? <a href={'#/dock/' + encodeURIComponent(shipment.id)}>{shipment.id}<ArrowRight size={12} /></a> : deduction.shipmentId || 'Unresolved'}</dd></div>
        <div><dt>Invoice</dt><dd>{deduction.invoiceNo}</dd></div>
        <div className="case-po"><dt>Customer PO</dt><dd>{deduction.customerPo}</dd></div>
      </dl>
    </section>

    {loadError && <div className="case-notice"><Notice tone="error">{loadError} <button className="text-button" onClick={() => setReload(value => value + 1)}>Retry case</button></Notice></div>}
    {requestedUnavailable && <div className="case-notice"><Notice tone="warning">The requested document is not part of this case. Choose an available source below.</Notice></div>}

    <div className="case-panel-tabs" role="tablist" aria-label="Case workspace">
      <button id="evidence-tab" role="tab" aria-selected={panel === 'evidence'} aria-controls="evidence-pane" tabIndex={panel === 'evidence' ? 0 : -1} onClick={() => setPanel('evidence')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setPanel('assessment'); document.getElementById('assessment-tab')?.focus(); } }}><FileText size={16} />Evidence</button>
      <button id="assessment-tab" role="tab" aria-selected={panel === 'assessment'} aria-controls="assessment-pane" tabIndex={panel === 'assessment' ? 0 : -1} onClick={() => setPanel('assessment')} onKeyDown={event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); setPanel('evidence'); document.getElementById('evidence-tab')?.focus(); } }}><Save size={16} />Assessment{dirty && (note || status) ? <span className="draft-dot" aria-label="Unsaved changes" /> : null}</button>
    </div>

    <div className="accounting-case-layout">
      <section id="evidence-pane" className="document-column" aria-label="Source evidence">
        <div ref={sourceList} className="source-switcher" aria-label="Evidence sources"><span ref={rule} className="source-rule" aria-hidden="true" />{documents.map(doc => <button key={doc.id} data-document-id={doc.id} className={'source-tab' + (selected?.id === doc.id ? ' source-tab--active' : '')} onClick={() => changeSource(doc)} aria-pressed={selected?.id === doc.id} disabled={Boolean(busy)}><FileText size={15} />{docLabel(doc)}{doc.kind === 'demo-pickup' && <span className="source-tab-time">{dateTime(doc.createdAt)}</span>}</button>)}</div>
        <div className="document-caption"><span>{selected?.kind === 'demo-pickup' ? 'Demo pickup · ' + dateTime(selected.createdAt) : selected ? docLabel(selected) + ' · supplied sample' : 'No source document available'}</span><span className="document-filename" title={selected?.name}>{selected?.name}</span></div>
        <PdfPane url={selected?.url} title={'Evidence for ' + deduction.id} />
        {selected?.kind === 'demo-pickup' && <p className="document-note">Created during this proof. This pickup record does not establish historical delivery.</p>}
      </section>

      <aside id="assessment-pane" className="assessment-rail" aria-label="Deduction assessment">
        <div ref={assessmentScroll} className="assessment-scroll">
          <div className="assessment-heading"><h2>Your assessment</h2></div>
          {draftRestored && <p className="draft-recovery-note" role="status">Unsaved draft restored from this browser.</p>}
          {draftWarning && <p className="draft-recovery-note draft-recovery-note--warning" role="status">{draftWarning}</p>}
          <details className="case-evidence-notes"><summary><span>Evidence notes</span></summary><div><p>{deduction.evidenceState === 'available' ? 'Historical source files are available.' : documents.some(doc => doc.kind === 'scan') ? 'Check the source match before relying on these files.' : 'No historical scan supplied for this shipment.'}</p>{deduction.matchWarnings.map((warning, index) => <p key={index}>{warning}</p>)}<p>Pickup and delivery are separate acknowledgements.</p></div></details>
          <fieldset disabled={disabled} className="outcome-fieldset"><legend className="field-label">Case status</legend><div ref={outcomesRef} className="outcome-options"><span ref={surface} className="outcome-surface" aria-hidden="true" />{outcomes.map(outcome => <label className={'outcome-option' + (selectedOutcome === outcome.value ? ' outcome-option--selected' : '')} key={outcome.value}><input type="radio" name={'outcome-' + id} value={outcome.value} checked={selectedOutcome === outcome.value} onChange={() => changeDraft({ status: outcome.value === 'follow-up' && (status === 'needs-evidence' || status === 'investigate') ? status : outcome.value })} /><span><span className="outcome-title">{outcome.label}</span><span className="outcome-description">{outcome.description}</span></span></label>)}</div></fieldset>
          {selectedOutcome === 'follow-up' && <div className="follow-up-fields"><TableSelect label="Follow-up reason" id="follow-up-reason" value={status === 'follow-up' ? '' : status} disabled={disabled} onChange={event => changeDraft({ status: (event.target.value || 'follow-up') as AssessmentDraftFields['status'] })}><option value="">Choose a reason</option>{followUpReasons.map(reason => <option key={reason.value} value={reason.value}>{reason.label}</option>)}</TableSelect></div>}
          <label className="field-label" htmlFor="assessment-note">Review note</label><textarea id="assessment-note" rows={4} value={note} disabled={disabled} onChange={event => changeDraft({ note: event.target.value })} placeholder={selectedOutcome === 'follow-up' ? 'What is missing or needs reconciling? What happens next?' : selectedOutcome === 'ready' ? 'What supports this case being ready for handoff?' : 'Record what the sources support.'} maxLength={4000} />
          <div ref={citationFields} className="citation-fields"><TableSelect label="Assessment source" id="citation-source" value={citationId} disabled={disabled} onChange={event => changeDraft({ citationId: event.target.value, page: '1' })}><option value="">No source citation</option>{citationId && !citation && <option value={citationId} disabled>Unavailable source · choose again</option>}{documents.map(doc => <option key={doc.id} value={doc.id}>{docLabel(doc)} · {doc.kind === 'demo-pickup' ? dateTime(doc.createdAt) : doc.name}</option>)}</TableSelect><div className="source-citation">{selected && selected.id !== citationId ? <button className="text-button" disabled={disabled} onClick={() => { flyCitation(sourceList.current?.querySelector('.source-tab--active') || null, citationFields.current?.querySelector('select') || null, docLabel(selected)); changeDraft({ citationId: selected.id, page: '1' }); }}>Use viewed source</button> : <span>{citation ? 'Source chosen for this note' : 'No source cited'}</span>}{citation && <label>Page<input type="number" min="1" step="1" inputMode="numeric" value={page} onChange={event => changeDraft({ page: event.target.value })} disabled={disabled} aria-label="Assessment source page" /></label>}</div></div>
        </div>
      </aside>

      <footer className="assessment-actions" aria-label="Assessment actions">
        {error && <Notice tone="error">{error}</Notice>}
        {message ? <p className="save-confirmation" role="status"><Check size={15} />{message}</p> : <p className="assessment-save-state">{deduction.id}<span>{dirty && (note || status) ? 'Unsaved changes' : accountingStatus(saved).label}</span></p>}
        <div className="assessment-action-buttons"><span ref={emphasis} className="action-emphasis" aria-hidden="true" />
          <button ref={saveButton} className={'button button--touch ' + (dirty ? 'button--primary' : 'button--secondary')} onClick={saveOnly} disabled={!dirty || disabled}>{busy === 'save' ? <Status busy>Saving</Status> : <><Save size={16} className="action-icon" />Save assessment</>}</button>
          <button ref={packetButton} className={'button button--touch ' + (dirty ? 'button--secondary' : 'button--primary')} onClick={preparePacket} disabled={dirty || disabled}>{busy === 'packet' ? <Status busy>Preparing</Status> : filed ? <><span className="tray-drop"><ArrowDownToLine size={17} /></span>Downloaded</> : <><ArrowDownToLine size={17} className="action-icon" />Prepare packet</>}</button>
        </div>
        <p className="microcopy">{dirty ? draftWarning ? 'Save your assessment before exporting.' : 'Draft kept on this browser. Save before exporting.' : saved?.status === 'ready' ? 'ZIP with sources and your assessment. Handoff remains manual.' : 'ZIP includes the follow-up reason and available sources.'}</p>
      </footer>
    </div>
  </main>;
}
