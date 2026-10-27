import { appUrl } from '../lib/base-path';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Maximize2, Minimize2, StickyNote, X, Monitor, Printer, PenLine, ScanLine, Archive, Search, Tablet, Files, ShieldCheck } from 'lucide-react';
import Story, { resetPresenterStep } from './Story';
import Dock, { ShipmentList } from '../components/Dock';
import Accounting from '../components/Accounting';
import GradingChecklist from './GradingChecklist';
import type { Assessment, Bootstrap, CaptureResult } from '../../shared/contracts';
import { clockLabel, plannedSeconds, presentationSlides, presentationBuilds, presentationChapters } from './presentation-content';
import './presentation.css';

const BUILDS_KEY = 'ridgeline-presentation-builds-v1';
function readBuilds(): Record<string, number> {
  try { const saved = JSON.parse(sessionStorage.getItem(BUILDS_KEY) || '{}'); return Object.fromEntries(Object.entries(presentationBuilds).map(([id, max]) => [id, Math.max(1, Math.min(max, Number(saved[id]) || 1))])); } catch { return {}; }
}
const POSITION_KEY = 'ridgeline-presentation-position-v2';
let rememberedSlide = 0;
function readPosition() {
  const requested = new URLSearchParams(location.hash.split('?')[1] || '').get('slide');
  const id = requested === 'demo' ? 'demo-dock' : requested;
  const direct = presentationSlides.findIndex(s => s.id === id);
  if (direct >= 0) return direct;
  try {
    const saved = presentationSlides.findIndex(slide => slide.id === sessionStorage.getItem(POSITION_KEY));
    if (saved >= 0) return saved;
  } catch { /* In-memory position remains usable without browser storage. */ }
  return rememberedSlide;
}
function EvidenceNote({ children }: { children: React.ReactNode }) { return <p className="rl-deck__source">{children}</p>; }

function SlideContent({ id, step }: { id: string; step: number }) {
  const point = (index: number) => ({ 'data-reveal': index, 'aria-hidden': step < index, 'data-current': step === index });
  switch (id) {
    case 'title': return <div className="rl-deck__cover">
      <div className="rl-deck__cover-copy"><p className="rl-deck__eyebrow">Nutrient · Discovery & working proof</p><h1>Ridgeline<br />Building Products</h1><p className="rl-deck__cover-scope">Paperless pickup.<br />Retrievable shipment evidence.</p><p className="rl-deck__byline">Sebastian Jorna <span>Fictional customer exercise</span></p></div>
      <figure className="rl-deck__cover-art"><picture><source media="(prefers-reduced-motion: reduce)" srcSet={appUrl("/story/record-journey-still.jpg")} /><img src={appUrl("/story/record-journey.gif")} width={900} height={601} alt="Animated journey between the Ridgeline plant and retailer distribution centre" decoding="async" /></picture><figcaption>A shipment moves. Its record needs to stay within reach.</figcaption></figure>
    </div>;
    case 'agenda': return <><p className="rl-deck__eyebrow">Presentation overview</p><h1>Today’s discussion</h1><div className="rl-deck__agenda">
      {presentationChapters.map((chapter, index) => <div key={chapter.label} {...point(index + 1)}><span>{String(index + 1).padStart(2, '0')}</span><h2>{chapter.label}</h2><p>{chapter.description}</p></div>)}
    </div><EvidenceNote>14:45 planned presentation · Questions follow</EvidenceNote></>;
    case 'client': return <><p className="rl-deck__eyebrow">Customer context</p><h1>Ridgeline at a glance</h1><p className="rl-deck__lead">A manufacturer of vinyl siding, trim and composite decking.</p>
      <div className="rl-deck__metrics"><div {...point(1)}><strong>~1,800</strong><span>employees</span></div><div {...point(2)}><strong>11</strong><span>manufacturing plants · US & Mexico</span></div><div {...point(3)}><strong>$500–650m</strong><span>annual revenue · supplied estimate</span></div></div>
      <div className="rl-deck__trigger" {...point(4)}><span>Why now</span><h2>The ERP migration means rewriting the shipping screen.</h2><p>The rugged tablets are already in place.</p></div>
      <EvidenceNote>Supplied fictional account · Two retail chains account for about half of revenue</EvidenceNote></>;
    case 'request': return <><p className="rl-deck__eyebrow">The inbound request</p><h1>A viewer and signing SDK<br />for the shipping dock</h1>
      <blockquote className="rl-deck__quote" {...point(1)}>“Looking for an Android PDF viewer and signature SDK for our shipping docks. Would like to talk to someone technical.”</blockquote>
      <div className="rl-deck__request-meta"><div {...point(2)}><span>Who</span><strong>Dana Kowalski</strong><p>Lead Application Developer</p></div><div {...point(3)}><span>How they found Nutrient</span><strong>Website inbound</strong><p>A technical conversation was requested.</p></div></div>
      <EvidenceNote>Request reproduced from the supplied account brief</EvidenceNote></>;
    case 'workflow': return <><p className="rl-deck__eyebrow">Discovery · the work</p><h1>The record changes hands</h1><p className="rl-deck__lead">The driver’s acknowledgement is needed long after the truck leaves.</p>
      <ol className="rl-deck__workflow">{[['ERP BOL', 'Create the shipping PDF', Monitor], ['Print', 'Clerk prints the document', Printer], ['Sign', 'Driver reviews and signs', PenLine], ['Scan', 'Clerk digitizes the copy', ScanLine], ['Retain', 'Save to shared storage', Archive], ['Retrieve', 'Accounting needs the record', Search]].map(([title, body, Icon], index) => {
        const Cue = Icon as typeof Monitor;
        return <li key={String(title)} {...point(index + 1)} className={step === index + 1 ? 'is-current' : ''}><span>{String(index + 1).padStart(2, '0')}</span><div className="rl-deck__workflow-cue" aria-hidden="true"><div><Cue size={30} strokeWidth={1.5} /></div></div><h2>{String(title)}</h2><p>{String(body)}</p></li>;
      })}</ol>
      <div className="rl-deck__two-insights"><div {...point(7)}><h2>At the dock</h2><p>Printing, scanning and equipment handling.</p></div><div {...point(8)}><h2>Later in Accounting</h2><p>Missing supporting records when a deduction is challenged.</p></div></div>
      <EvidenceNote>Current workflow described by Dana · Storage and ERP interfaces remain open</EvidenceNote></>;
    case 'discovery': return <><p className="rl-deck__eyebrow">Discovery · findings to decisions</p><h1>What changed the scope</h1>
      <div className="rl-deck__discovery" role="table" aria-label="Discovery findings and resulting decisions"><div className="rl-deck__discovery-head" role="row"><span role="columnheader">Lens</span><span role="columnheader">What we heard</span><span role="columnheader">What the proof addresses</span></div>
      {[['Work', 'Review, sign and retain the BOL', 'Paperless pickup capture'], ['Consequence', 'Accounting cannot always produce proof', 'Shipment-linked evidence review'], ['Scale', '~130,000 BOLs across 11 plants last year', 'Stable identity and recoverable handoff'], ['Priority', 'VP wants paperless; Accounting uses scans', 'Both working flows'], ['Outcome', 'A usable record available when needed', 'Stored reopen and review packet'], ['Open decisions', 'ERP contract, integrity and acceptance', 'Explicit integration and evidence limits']].map((row, index) => <div className="rl-deck__discovery-row" role="row" {...point(index + 1)} key={row[0]}>{row.map((cell, index) => <span key={cell} role="cell" className={index === 0 ? 'rl-deck__lens' : undefined}>{cell}</span>)}</div>)}</div>
      <EvidenceNote>Customer-reported scale · Revenue recovery was not quantified or proved</EvidenceNote></>;
    case 'success': return <><p className="rl-deck__eyebrow">Proposed scope · sent evaluation statement</p><h1>One record connects two jobs</h1>
      <div className="rl-deck__jobs"><div {...point(1)}><span>Dock</span><h2>Review → Sign → Retain</h2><p>Preview the pickup signature. Flatten the PDF, send it and reopen the stored version.</p></div><div {...point(2)}><span>Accounting</span><h2>Retrieve → Assess → Prepare</h2><p>Find the matching sources. Save an explicit assessment and export a review packet.</p></div></div>
      <div className="rl-deck__criteria"><div {...point(3)}><strong>Correct record</strong><p>Shipment, invoice and PO agree.</p></div><div {...point(4)}><strong>Originals preserved</strong><p>New pickup is a separate version.</p></div><div {...point(5)}><strong>Recoverable transfer</strong><p>Retry saves one version.</p></div></div>
      <EvidenceNote>Proposed scope and success criteria · Sent evaluation statement</EvidenceNote></>;
    case 'boundaries': return <><p className="rl-deck__eyebrow">Scope boundary</p><h1>What this proof establishes</h1>
      <div className="rl-deck__scope" role="table" aria-label="What is demonstrated and what needs production validation">
        <div className="rl-deck__scope-head" role="row"><span role="columnheader">Capability</span><span role="columnheader">Demonstrated here</span><span role="columnheader">Validate in production</span></div>
        {[
          { label: 'Documents', proof: 'Browser signing + flattened PDF', next: 'Native Android on rugged tablets', Icon: Tablet, cue: 'tablet' },
          { label: 'Records', proof: 'Local receipt, reopen + retry', next: 'Live ERP, identity + managed storage', Icon: Archive, cue: 'archive' },
          { label: 'Evidence', proof: 'Matched sources + human review packet', next: 'Retailer acceptance + revenue outcomes', Icon: Files, cue: 'documents' },
          { label: 'Trust', proof: 'New pickup and originals kept separate', next: 'Signer identity + integrity controls', Icon: ShieldCheck, cue: 'shield' },
        ].map(({ label, proof, next, Icon, cue }, index) => <div className="rl-deck__scope-row" role="row" {...point(index + 1)} key={label}>
          <div className="rl-deck__scope-capability" role="cell"><span className={`rl-deck__scope-cue rl-deck__scope-cue--${cue}`} aria-hidden="true"><span><Icon size={29} strokeWidth={1.5} /></span></span><h2>{label}</h2></div>
          <p role="cell"><span className="rl-deck__scope-mobile-label">Demonstrated</span>{proof}</p>
          <p role="cell"><span className="rl-deck__scope-mobile-label">Production validation</span>{next}</p>
        </div>)}
      </div>
      <p className="rl-deck__scope-takeaway" {...point(5)}>A new pickup record does not establish historical delivery.</p></>;
    case 'demo-divider': return <div className="rl-deck__divider"><span className="rl-deck__chapter-number">02</span><p className="rl-deck__eyebrow">The working proof</p><h1>One shipment.<br />Two jobs.</h1><p>Follow the document through Dock and Accounting.</p></div>;
    case 'product-divider': return <div className="rl-deck__divider"><span className="rl-deck__chapter-number">03</span><p className="rl-deck__eyebrow">Product & cost</p><h1>Making it<br />repeatable</h1><p>A reusable workflow with customer-specific integration.</p></div>;
    case 'stack': return <><p className="rl-deck__eyebrow">Implementation</p><h1>The stack and its responsibilities</h1><div className="rl-deck__stack">
      <div {...point(1)}><span>Document capabilities</span><h2>Nutrient Web SDK <small>1.24.0</small></h2><p>PDF viewing · electronic signature annotation · flattened export</p></div>
      <div {...point(2)}><span>Workflow and records</span><h2>React / TypeScript + Worker API</h2><p>Matching · upload and receipt · retry · versions · assessment · packet</p></div>
      <div {...point(3)}><span>Production integration</span><h2>Native Android + customer adapters</h2><p>Device verification · ERP · identity · managed storage</p></div>
    </div><EvidenceNote>SDK trial with visible evaluation watermark · No live ERP, OCR, AI extraction or Document Engine</EvidenceNote></>;
    case 'repeatability': return <><p className="rl-deck__eyebrow">The next customer</p><h1>Reuse the workflow.<br />Adapt the integration.</h1><div className="rl-deck__reuse">
      <div {...point(1)}><span>Keep</span><h2>The document workflow</h2><p>Capture, version, receipt, retrieval, assessment and packet contracts.</p></div>
      <div {...point(2)}><span>Configure</span><h2>The customer’s document rules</h2><p>BOL templates, pickup region, identifiers, naming and retention policy.</p></div>
      <div {...point(3)}><span>Integrate</span><h2>The deployment environment</h2><p>ERP, Android, identity and storage adapters; operations and support.</p></div>
    </div><p className="rl-deck__statement" {...point(4)}>Pilot in one plant before expanding.</p></>;
    case 'cost': return <><p className="rl-deck__eyebrow">Planning allowance · not a quote</p><h1>Cost to productize and deploy</h1><div className="rl-deck__cost-summary" {...point(1)}><strong>$60k–108k</strong><p>Initial reusable product work<br />plus one customer implementation</p></div>
      <div className="rl-deck__cost-lines"><div {...point(2)}><span>Reusable core, native adapter and hardening</span><strong>$48k–84k</strong><small>320–560 engineering / QA hours</small></div><div {...point(3)}><span>Customer mapping, templates and pilot</span><strong>$12k–24k</strong><small>80–160 customer-specific hours</small></div><div {...point(4)}><span>Support + provisional infrastructure</span><strong>$700–2,100 / month</strong><small>Validate traffic, retention and service level</small></div></div>
      <EvidenceNote>Assumes $150/hour · Nutrient licensing, devices / MDM and premium external services excluded and unquoted</EvidenceNote></>;
    case 'close': return <><p className="rl-deck__eyebrow">Conclusion & discussion</p><h1>A usable record,<br />ready for review</h1><p className="rl-deck__closing-lead">Paperless pickup connects to retrievable shipment evidence.</p><div className="rl-deck__pilot" {...point(2)}><span>Proposed next step</span><h2>A one-plant pilot</h2><p>Validate the actual tablets and ERP handoff. Measure capture success, retrieval time and Accounting’s evidence needs.</p></div><p className="rl-deck__questions">Questions</p></>;
    case 'criteria': return <GradingChecklist />;
    default: return null;
  }
}

interface PresentationProps {
  data: Bootstrap;
  onCaptured: (shipmentId: string, result: CaptureResult) => void;
  onAssessment: (assessment: Assessment) => void;
}
interface LiveContext { shipmentId: string; caseId: string; documentId?: string; dockList?: boolean; queue?: boolean; }
const LIVE_KEY = 'ridgeline-presentation-live-v1';
const cinematicSteps: Record<string, number> = { 'demo-dock': 0, 'demo-pickup': 1, 'demo-receiving': 2, 'demo-accounting': 3 };
function readLiveContext(): LiveContext {
  let saved: Partial<LiveContext> = {};
  try { saved = JSON.parse(sessionStorage.getItem(LIVE_KEY) || '{}'); } catch { /* Optional context. */ }
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  return { shipmentId: 'RS-417652', caseId: 'CHB-0899904', ...saved,
    ...(query.has('shipment') ? { shipmentId: query.get('shipment')!, dockList: false } : {}),
    ...(query.has('case') ? { caseId: query.get('case')!, queue: false } : {}),
    ...(query.has('document') ? { documentId: query.get('document')! } : {}),
    ...(query.has('list') ? { dockList: true } : {}), ...(query.has('queue') ? { queue: true } : {}) };
}
export default function Presentation({ data, onCaptured, onAssessment }: PresentationProps) {
  const [position, setPosition] = useState(readPosition);
  const [builds, setBuilds] = useState<Record<string, number>>(readBuilds);
  const [live, setLive] = useState<LiveContext>(readLiveContext);
  const [documentRequest, setDocumentRequest] = useState(0);
  const [shipmentQuery, setShipmentQuery] = useState('');
  const [visited, setVisited] = useState(() => ({ dock: presentationSlides[readPosition()].id === 'dock-live', accounting: presentationSlides[readPosition()].id === 'accounting-live' }));
  const [notesOpen, setNotesOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  const heading = useRef<HTMLDivElement>(null);
  const slide = presentationSlides[position];
  const isLive = slide.id === 'dock-live' || slide.id === 'accounting-live';
  const cinematicStep = cinematicSteps[slide.id];
  const steps = presentationBuilds[slide.id] || 1;
  const step = builds[slide.id] || 1;
  const start = presentationSlides.slice(0, position).reduce((sum, item) => sum + item.seconds, 0);
  // Keep working tasks mounted across slides: unsent ink, source selection and drafts survive Back/Next.
  const accountingContext = useRef(live);
  if (slide.id === 'accounting-live') accountingContext.current = live;
  const account = accountingContext.current;
  const shipment = data.shipments.find(item => item.id === live.shipmentId);
  function goTo(next: number, focus = true, context = live) {
    const index = Math.max(0, Math.min(presentationSlides.length - 1, next));
    const id = presentationSlides[index].id;
    rememberedSlide = index;
    setPosition(index);
    setVisited(value => ({ dock: value.dock || id === 'dock-live', accounting: value.accounting || id === 'accounting-live' }));
    const query = new URLSearchParams({ slide: id });
    if (id === 'dock-live') { if (context.dockList) query.set('list', '1'); else query.set('shipment', context.shipmentId); }
    if (id === 'accounting-live') { if (context.queue) query.set('queue', '1'); else { query.set('case', context.caseId); if (context.documentId) query.set('document', context.documentId); } }
    history.replaceState(null, '', `#/present?${query}`);
    heading.current?.scrollTo({ top: 0 });
    if (focus) requestAnimationFrame(() => heading.current?.focus());
  }
  function openLive(kind: 'dock' | 'accounting', changes: Partial<LiveContext> = {}) {
    if (kind === 'accounting' && changes.documentId) setDocumentRequest(value => value + 1);
    const context = { ...live, ...changes }; setLive(context);
    goTo(presentationSlides.findIndex(item => item.id === `${kind}-live`), true, context);
  }
  function openAccounting(shipmentId: string, documentId?: string) {
    const match = data.deductions.find(item => item.shipmentId === shipmentId);
    openLive('accounting', { shipmentId, caseId: match?.id || live.caseId, documentId, queue: !match });
  }
  function routeWithinDeck(href: string) {
    const [path, query = ''] = href.replace(/^#\/?/, '').split('?');
    const [kind, encodedId] = path.split('/');
    const id = encodedId ? decodeURIComponent(encodedId) : undefined;
    if (kind === 'dock') openLive('dock', { shipmentId: id || live.shipmentId, dockList: !id });
    else if (kind === 'accounting') {
      openLive('accounting', { caseId: id || live.caseId, documentId: new URLSearchParams(query).get('document') || undefined, queue: !id });
    } else return false;
    return true;
  }
  function captureNavigation(event: React.MouseEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    const target = event.target as HTMLElement;
    const anchor = target.closest<HTMLAnchorElement>('a[href^="#/"]');
    const row = !target.closest('button,input,select,textarea,a,[role="button"],[role="tab"],summary') && !window.getSelection()?.toString() ? target.closest<HTMLElement>('[data-row-href]') : null;
    const href = anchor?.getAttribute('href') || row?.dataset.rowHref;
    if (href && routeWithinDeck(href)) { event.preventDefault(); event.stopPropagation(); }
  }
  function advance() {
    requestAnimationFrame(() => heading.current?.focus());
    if (step < steps) setBuilds(value => ({ ...value, [slide.id]: step + 1 }));
    else goTo(position + 1);
  }
  function previous() {
    requestAnimationFrame(() => heading.current?.focus());
    if (step > 1) setBuilds(value => ({ ...value, [slide.id]: step - 1 }));
    else if (position > 0) {
      const previousId = presentationSlides[position - 1].id;
      setBuilds(value => ({ ...value, [previousId]: presentationBuilds[previousId] || 1 }));
      goTo(position - 1);
    }
  }
  useEffect(() => { try { sessionStorage.setItem(BUILDS_KEY, JSON.stringify(builds)); } catch { /* Optional persistence. */ } }, [builds]);
  useEffect(() => { try { sessionStorage.setItem(LIVE_KEY, JSON.stringify(live)); } catch { /* Optional persistence. */ } }, [live]);
  useEffect(() => {
    rememberedSlide = position;
    try { sessionStorage.setItem(POSITION_KEY, slide.id); } catch { /* Optional persistence. */ }
  }, [position, slide.id]);
  useEffect(() => {
    const onHash = () => {
      if (!location.hash.startsWith('#/present')) return;
      const next = readPosition(); setPosition(next); setLive(readLiveContext());
      if (presentationSlides[next].id === 'accounting-live' && new URLSearchParams(location.hash.split('?')[1] || '').has('document')) setDocumentRequest(value => value + 1);
      setVisited(value => ({ dock: value.dock || presentationSlides[next].id === 'dock-live', accounting: value.accounting || presentationSlides[next].id === 'accounting-live' }));
    };
    window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === 'Escape') { setNotesOpen(false); return; }
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || target?.closest?.('input,textarea,select,button,a,[contenteditable="true"],[role="tab"],.rl-deck__live')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') { event.preventDefault(); if (event.shiftKey) goTo(position + 1); else advance(); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      else if (event.key === 'Home') { event.preventDefault(); setBuilds({}); resetPresenterStep(); setLive({ shipmentId: 'RS-417652', caseId: 'CHB-0899904' }); setVisited({ dock: false, accounting: false }); goTo(0); }
      else if (event.key === 'End') { event.preventDefault(); goTo(presentationSlides.length - 1); }
      else if (event.key.toLowerCase() === 'a') setBuilds(value => ({ ...value, [slide.id]: steps }));
      else if (event.key.toLowerCase() === 'n') setNotesOpen(value => !value);
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [position, step, steps, live]);
  useEffect(() => {
    const change = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', change); return () => document.removeEventListener('fullscreenchange', change);
  }, []);
  async function toggleFullscreen() {
    try { setFullscreenError(''); if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
    catch { setFullscreenError('Fullscreen is unavailable in this browser. The presentation remains usable.'); }
  }
  return <section className={`rl-deck${cinematicStep !== undefined ? ' rl-deck--cinematic' : ''}${isLive ? ' rl-deck--live' : ''}${slide.id.endsWith('divider') ? ' rl-deck--divider' : ''}`} aria-label="Ridgeline presentation" data-slide={slide.id} data-step={step} data-steps={steps} data-planned-seconds={plannedSeconds}>
    <div className="rl-deck__content" onClick={event => { if (!isLive && !window.getSelection()?.toString() && !(event.target as HTMLElement).closest('button,a,input,select,textarea,[contenteditable="true"]')) advance(); }} ref={heading} tabIndex={-1} aria-label={`${position + 1}. ${slide.label}`}>
      {cinematicStep !== undefined ? <Story step={cinematicStep} onDock={() => openLive('dock')} onAccounting={() => openLive('accounting', { queue: false })} /> : !isLive && <article className="rl-deck__slide" key={slide.id}><SlideContent id={slide.id} step={step} /></article>}
      {visited.dock && <div className="rl-deck__live rl-deck__live--dock" hidden={slide.id !== 'dock-live'} onClickCapture={captureNavigation}>
        {live.dockList ? <ShipmentList shipments={data.shipments} query={shipmentQuery} setQuery={setShipmentQuery} /> : shipment ? <Dock active={slide.id === 'dock-live'} key={shipment.id} shipment={shipment} onCaptured={(id, result) => { onCaptured(id, result); setLive(value => ({ ...value, shipmentId: id, documentId: result.capture.id })); }} onAccounting={openAccounting} /> : <div className="empty-state"><h1>Shipment unavailable</h1><button onClick={() => openLive('dock', { dockList: true })}>Choose a shipment</button></div>}
      </div>}
      {visited.accounting && <div className="rl-deck__live rl-deck__live--accounting" hidden={slide.id !== 'accounting-live'} onClickCapture={captureNavigation}>
        <Accounting deductions={data.deductions} shipments={data.shipments} sampleDate={data.sampleDate} id={account.queue ? undefined : account.caseId} documentId={account.documentId} documentRequest={documentRequest} onAssessment={onAssessment} />
      </div>}
    </div>
    <footer className="rl-deck__controls">
      <nav className="rl-deck__chapters" aria-label="Presentation progress">
        {presentationChapters.map(chapter => {
          const active = chapter.slides.includes(slide.id);
          return <button key={chapter.label} className={`rl-deck__chapter${active ? ' is-active' : ''}`} aria-current={active ? 'step' : undefined} aria-label={`${chapter.label}${active ? ` · ${slide.label}` : ''}`} onClick={() => goTo(presentationSlides.findIndex(item => item.id === chapter.slides[0]))}>
            <span className="rl-deck__chapter-label">{chapter.label}</span><span className="rl-deck__chapter-detail">{active ? slide.label.replace('Live · ', '') : '\u00a0'}</span>
            <span className="rl-deck__segments" aria-hidden="true">{chapter.slides.map(id => { const index = presentationSlides.findIndex(item => item.id === id); return <i key={id} className={index === position ? 'is-current' : index < position ? 'is-complete' : ''} />; })}</span>
          </button>;
        })}
      </nav>
      <div className="rl-deck__transport">
        <div className="rl-deck__position"><span>{String(position + 1).padStart(2, '0')} <i>/ {presentationSlides.length}</i></span><label><span className="sr-only">Jump to slide</span><select aria-label="Jump to slide" value={position} onChange={event => goTo(Number(event.target.value), false)}>{presentationSlides.map((item, index) => <option key={item.id} value={index}>{String(index + 1).padStart(2, '0')} · {item.label}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label></div>
        {steps > 1 && <div className="rl-deck__build-progress"><span aria-live="polite">Point {step} / {steps}</span><span className="rl-deck__build-dots" aria-hidden="true">{Array.from({ length: steps }, (_, index) => <i key={index} className={index < step ? 'is-revealed' : ''} />)}</span></div>}
        <div className="rl-deck__utilities"><button aria-label="Presenter notes" aria-expanded={notesOpen} onClick={() => setNotesOpen(value => !value)} title="Presenter notes · N"><StickyNote size={17} /></button><button aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button></div>
        <div className="rl-deck__navigation"><button aria-label="Previous point or slide" onClick={previous} disabled={position === 0 && step === 1}><ArrowLeft size={18} /></button><button className="rl-deck__next" aria-label={step < steps ? "Reveal next point" : "Next slide"} onClick={advance} disabled={position === presentationSlides.length - 1 && step === steps}>{step < steps ? 'Reveal next' : 'Next slide'} <ArrowRight size={18} /></button></div>
      </div>
    </footer>
    {notesOpen && <aside className="rl-deck__notes" aria-label="Presenter notes panel"><div><p>{slide.section}</p><button aria-label="Close presenter notes" onClick={() => setNotesOpen(false)}><X size={18} /></button></div><h2>{slide.label}</h2><p className="rl-deck__timing">{clockLabel(start)}–{clockLabel(start + slide.seconds)} <span>· {clockLabel(slide.seconds)} for this slide · {clockLabel(plannedSeconds)} total planned</span></p><p>{slide.notes}</p><small>Click the slide, press Space / Right, or use Reveal next to introduce one point. Left undoes a reveal. A shows all points; Shift + Right skips to the next slide. Home restarts with fresh reveals; End opens discussion. N toggles these notes. During live tasks use the footer controls; document keys stay within the task. Live-demo time is included in the plan.</small></aside>}
    {fullscreenError && <p className="rl-deck__fullscreen-error" role="status">{fullscreenError}</p>}
  </section>;
}
