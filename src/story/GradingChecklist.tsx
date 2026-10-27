import { Check, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { appUrl } from '../lib/base-path';
import proofRecordings from './proof-recordings.json';
import './grading-checklist.css';

const criteria = [
  {
    id: 'discovery-scope',
    recording: 'discovery',
    title: 'Discovery → scope',
    proof: 'Customer findings lead to the scope and its boundaries.',
    links: [
      { label: 'Discovery', href: '#/present?slide=discovery' },
      { label: 'Scope', href: '#/present?slide=success' },
    ],
  },
  {
    id: 'documents-matching',
    recording: 'documents',
    title: 'Correct documents + matching',
    proof: 'Shipment, invoice and PO stay matched; originals remain separate.',
    links: [
      { label: 'Evidence review', href: '#/present?slide=accounting-live&case=CHB-0899904&document=bol-RS-417652' },
    ],
  },
  {
    id: 'working-flows',
    recording: 'flows',
    title: 'Both working flows',
    proof: 'Review, sign and store; retrieve, assess and prepare the packet.',
    links: [
      { label: 'Live Dock', href: '#/present?slide=dock-live&shipment=RS-417652' },
      { label: 'Live Accounting', href: '#/present?slide=accounting-live&case=CHB-0899904&document=bol-RS-417652' },
    ],
  },
  {
    id: 'failure-recovery',
    recording: 'recovery',
    title: 'Failure recovery',
    proof: 'Keep prepared work through failed transfers, refresh and retry.',
    links: [
      { label: 'Dock recovery', href: '#/present?slide=dock-live&shipment=RS-417652' },
    ],
  },
  {
    id: 'customer-demo',
    recording: 'demo',
    title: 'Customer-facing demo',
    proof: 'Walk one shipment through clear tasks and an inspectable record.',
    links: [
      { label: 'Demo story', href: '#/present?slide=demo-dock' },
      { label: 'Retrieval story', href: '#/present?slide=demo-accounting' },
    ],
  },
  {
    id: 'productization-cost',
    recording: 'productization',
    title: 'Productization + cost',
    proof: 'Separate reusable work, customer integration, costs and unquoted dependencies.',
    links: [
      { label: 'Repeatability', href: '#/present?slide=repeatability' },
      { label: 'Cost assumptions', href: '#/present?slide=cost' },
    ],
  },
] as const;

type ProofRecording = typeof proofRecordings.recordings[number];
const clock = (seconds: number) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const findRecording = (id: string) => proofRecordings.recordings.find(item => item.id === id)!;

/** Proposed judging criteria from S078; the checks are list cues, not awarded results. */
export default function GradingChecklist() {
  const recording = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [activeRecording, setActiveRecording] = useState<ProofRecording | null>(null);
  useEffect(() => {
    if (!activeRecording) return;
    if (!recording.current?.open) recording.current?.showModal();
    video.current?.load();
  }, [activeRecording]);
  function watchLink(item: ProofRecording, full = false) {
    const duration = item.durationSeconds ? clock(item.durationSeconds) : '';
    return <a className="rl-grade__watch" data-recording-id={item.id} href={appUrl(`/proof/watch.html?clip=${item.id}`)} target="_blank" rel="noopener noreferrer"
      aria-label={`Watch ${full ? 'the full walkthrough' : item.title}${duration ? ` (${duration})` : ''}`}
      onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        setActiveRecording({ ...item });
      }}><Play size={12} strokeWidth={1.6} aria-hidden="true" />{full ? 'Watch full walkthrough' : 'Watch'}{duration && <span className="rl-grade__duration">{duration}</span>}</a>;
  }
  return <>
    <p className="rl-deck__eyebrow">Sent evaluation statement</p>
    <h1>The proof, against my criteria</h1>
    <ul className="rl-grade" aria-label="My proposed evaluation criteria" role="list">
      {criteria.map(criterion => <li className="rl-grade__criterion" data-criterion={criterion.id} key={criterion.id}>
        <Check className="rl-grade__check" size={19} strokeWidth={1.5} aria-hidden="true" />
        <div className="rl-grade__content">
          <h2>{criterion.title}</h2>
          <p className="rl-grade__proof">{criterion.proof}</p>
          <div className="rl-grade__links">{criterion.links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}{watchLink(findRecording(criterion.recording))}</div>
        </div>
      </li>)}
    </ul>
    <div className="rl-deck__source rl-grade__footnote"><span>Proposed in my email · Production boundaries remain as stated.</span>{watchLink(findRecording('walkthrough'), true)}</div>
    <dialog className="rl-grade-recording" ref={recording} aria-labelledby="proof-recording-title" onClose={() => video.current?.pause()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <div className="rl-grade-recording__header"><h2 id="proof-recording-title">{activeRecording?.title}</h2><button type="button" onClick={() => recording.current?.close()}>Close recording</button></div>
      <p>{activeRecording?.description}</p>
      <video ref={video} controls autoPlay playsInline preload="none" aria-label={`Recording: ${activeRecording?.title || 'Proof walkthrough'}`} src={activeRecording ? appUrl(`/proof/${activeRecording.src}`) : undefined} poster={activeRecording ? appUrl(`/proof/${activeRecording.poster}`) : undefined} />
      <p className="rl-grade-recording__meta">Silent recording · Original speed · Synthetic records{activeRecording?.note && ` · ${activeRecording.note}`}</p>
    </dialog>
  </>;
}
