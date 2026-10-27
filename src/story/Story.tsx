import { appUrl } from '../lib/base-path';
import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import StoryScene from './StoryScene';
import AccountingScene from './AccountingScene';
import { useStoryMotion } from './motion';
import './story.css';

export interface StoryProps { onDock: () => void; onAccounting: () => void; }
const beats = [
  { label: 'Inside the dock', title: 'Print. Sign. Scan.\nThen find it.', body: 'Paper changes hands. If the signed BOL is missing later, Accounting has less evidence to work with.', detail: 'The current paper trail', focus: 'Illustrated risk. The blank line is not a finding about a supplied shipment.' },
  { label: 'Paperless pickup', title: 'Sign once.\nKeep the record.', body: 'Review the BOL, capture a fresh pickup signature and send the saved PDF.', detail: 'Review → Sign → Send', focus: 'Open the live proof to see the actual service receipt.' },
  { label: 'Distinct receiving', title: 'One truck.\nTwo acknowledgements.', body: 'The driver signs at pickup. The receiver acknowledges delivery separately.', detail: 'Pickup ≠ Receiving', focus: 'A new pickup record cannot fill a historical delivery gap.' },
  { label: 'Accounting retrieval', title: 'The record,\nwithin reach.', body: 'Find one shipment. Review its sources. Take the evidence with you.', detail: 'Retrieve → Assess → Prepare', focus: 'A review packet supports a decision. It does not establish delivery or recovery.' },
] as const;
// Keep the cinematic context through live-view visits and refreshes in the same tab.
const BEAT_POSITION_KEY = 'ridgeline-presenter-beat-v1';
let lastPresenterStep = 0;
function readPresenterStep() {
  try {
    const saved = Number(sessionStorage.getItem(BEAT_POSITION_KEY));
    if (Number.isInteger(saved) && saved >= 0 && saved < beats.length) return saved;
  } catch { /* The in-memory step still works without browser storage. */ }
  return lastPresenterStep;
}
function rememberPresenterStep(step: number) {
  lastPresenterStep = step;
  try { sessionStorage.setItem(BEAT_POSITION_KEY, String(step)); } catch { /* Optional persistence. */ }
}
export function resetPresenterStep() { rememberPresenterStep(0); }
function Arrow({ back = false }: { back?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={back ? 'M19 12H5m7-7-7 7 7 7' : 'M5 12h14m-7-7 7 7-7 7'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function Story({ onDock, onAccounting, step: controlledStep }: StoryProps & { step?: number }) {
  const [localStep, setStep] = useState(readPresenterStep);
  const integrated = controlledStep !== undefined;
  const step = controlledStep ?? localStep;
  const [paused, setPaused] = useState(false);
  const [stillView, setStillView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const { frame, moving, replay } = useStoryMotion(step, !stillView && !reducedMotion, paused);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const id = useId();
  const beat = beats[step];
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync(); media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    // Decode the next visual before its first transition when the browser permits it.
    for (const url of [appUrl('/story/dock-office.png'), appUrl('/story/plant-road-dc.png'), appUrl('/story/truck.png'), appUrl('/story/accounting-assets/original-bol.png'), appUrl('/story/accounting-assets/invoice.png'), appUrl('/story/accounting-assets/historical-scan.png')]) {
      const image = new Image(); image.src = url; void image.decode().catch(() => undefined);
    }
  }, []);
  function goTo(next: number, focus = false) {
    const bounded = Math.max(0, Math.min(beats.length - 1, next));
    if (bounded !== step) { setPaused(false); rememberPresenterStep(bounded); setStep(bounded); }
    if (focus) tabs.current[bounded]?.focus();
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % beats.length
      : event.key === 'ArrowLeft' ? (index + beats.length - 1) % beats.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? beats.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); goTo(next, true);
  }
  return <section className={`rl-story${integrated ? " rl-story--integrated" : ""}`} aria-labelledby={`${id}-heading`} data-beat={step === 3 ? 'accounting' : step} data-still={stillView || reducedMotion} data-motion-running={moving} data-motion-paused={paused}>
    {!integrated && <header className="rl-story__header">
      <div><p className="rl-story__eyebrow">Ridgeline · From dock to record</p><h1 id={`${id}-heading`}>Keep the record moving.</h1></div>
      <span className="rl-story__proposal">Fictional account · Proposed experience</span>
    </header>}
    <div className="rl-story__stage" id={`${id}-panel`} role={integrated ? undefined : "tabpanel"} aria-labelledby={integrated ? `${id}-heading` : `${id}-tab-${step}`} tabIndex={integrated ? undefined : 0}>
      <div className="rl-story__copy" key={step} aria-live="polite" aria-atomic="true">
        <span className="rl-story__counter">{!integrated && <>0{step + 1} <span>/ 04</span><i /></>}{beat.label}</span>
        {integrated ? <h1 id={`${id}-heading`}>{beat.title}</h1> : <h2>{beat.title}</h2>}<p className="rl-story__body">{beat.body}</p><p className="rl-story__sequence">{beat.detail}</p>
        {step === 1 && <button className="rl-story__launch" onClick={onDock}>{integrated ? "Continue to live Dock" : "Open live Dock"} <Arrow /></button>}
        {step === 3 && <button className="rl-story__launch" onClick={onAccounting}>{integrated ? "Continue to live Accounting" : "Open live Accounting"} <Arrow /></button>}
        <p className="rl-story__focus">{beat.focus}</p>
      </div>
      <figure className="rl-story__figure">
        {step === 3 ? <AccountingScene progress={frame.evidence} still={stillView || reducedMotion} /> : <StoryScene step={step} frame={frame} still={stillView || reducedMotion} />}
        {step !== 3 && <div className="rl-story__mobile-legend" aria-hidden="true">{step === 0 ? '01 Print BOL · 02 Capture signature · 03 Retain copy' : step === 1 ? 'Plant · Pickup acknowledgement' : 'Truck · Illustrated journey   /   DC · Receiving'}</div>}
        <figcaption>
          <span className="rl-story__illustration-label"><span className="rl-story__legend-line" /> {step === 0 ? 'Illustrated paper workflow' : step === 3 ? 'Illustrated retrieval · Supplied sample documents · No case decision shown' : 'Process illustration · No live tracking or delivery status'}</span>
          {!reducedMotion && <span className="rl-story__motion-controls">
            {moving ? <button className="rl-story__motion" onClick={() => setPaused(value => !value)} aria-pressed={paused}>{paused ? 'Resume motion' : 'Pause motion'}</button> : !stillView && <button className="rl-story__motion" onClick={() => { setPaused(false); replay(); }}>Replay beat</button>}
            <button className="rl-story__motion" onClick={() => { setStillView(value => !value); setPaused(false); }} aria-pressed={stillView}>{stillView ? 'Use motion' : 'Use still view'}</button>
          </span>}
          {reducedMotion && <span className="rl-story__still-label">Still view · Reduced motion</span>}
        </figcaption>
      </figure>
    </div>
    {!integrated && <footer className="rl-story__footer">
      <div className="rl-story__steps" role="tablist" aria-label="Presentation beats" style={{ '--story-beat': step } as React.CSSProperties}>
        {beats.map((item, index) => <button key={item.label} ref={element => { tabs.current[index] = element; }} id={`${id}-tab-${index}`} type="button" role="tab" aria-selected={step === index} aria-controls={`${id}-panel`} tabIndex={step === index ? 0 : -1} onClick={() => goTo(index)} onKeyDown={event => onTabKey(event, index)}><span>0{index + 1}</span>{item.label}</button>)}
      </div>
      <div className="rl-story__transport" aria-label="Presenter controls"><button className="rl-story__previous" onClick={() => goTo(step - 1)} disabled={step === 0} aria-label="Previous beat"><Arrow back /></button><button className="rl-story__next" onClick={() => goTo(step === 3 ? 0 : step + 1)}>{step === 3 ? 'Back to the start' : 'Next'} <Arrow /></button></div>
    </footer>}
  </section>;
}
