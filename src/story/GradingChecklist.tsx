import { appUrl } from '../lib/base-path';
import { Check } from 'lucide-react';
import { useRef } from 'react';
import './grading-checklist.css';

const criteria = [
  {
    id: 'discovery-scope',
    title: 'Discovery → scope',
    proof: 'Customer findings lead to the scope and its boundaries.',
    links: [
      { label: 'Discovery', href: '#/present?slide=discovery' },
      { label: 'Scope', href: '#/present?slide=success' },
    ],
  },
  {
    id: 'documents-matching',
    title: 'Correct documents + matching',
    proof: 'Shipment, invoice and PO stay matched; originals remain separate.',
    links: [
      { label: 'Evidence review', href: '#/present?slide=accounting-live&case=CHB-0899904&document=bol-RS-417652' },
    ],
  },
  {
    id: 'working-flows',
    title: 'Both working flows',
    proof: 'Review, sign and store; retrieve, assess and prepare the packet.',
    links: [
      { label: 'Live Dock', href: '#/present?slide=dock-live&shipment=RS-417652' },
      { label: 'Live Accounting', href: '#/present?slide=accounting-live&case=CHB-0899904&document=bol-RS-417652' },
    ],
  },
  {
    id: 'failure-recovery',
    title: 'Failure recovery',
    proof: 'Keep prepared work through failed transfers, refresh and retry.',
    links: [
      { label: 'Dock recovery', href: '#/present?slide=dock-live&shipment=RS-417652' },
      { label: 'Recorded retry', href: appUrl('/proof/recovery.html') },
    ],
  },
  {
    id: 'customer-demo',
    title: 'Customer-facing demo',
    proof: 'Walk one shipment through clear tasks and an inspectable record.',
    links: [
      { label: 'Demo story', href: '#/present?slide=demo-dock' },
      { label: 'Retrieval story', href: '#/present?slide=demo-accounting' },
    ],
  },
  {
    id: 'productization-cost',
    title: 'Productization + cost',
    proof: 'Separate reusable work, customer integration, costs and unquoted dependencies.',
    links: [
      { label: 'Repeatability', href: '#/present?slide=repeatability' },
      { label: 'Cost assumptions', href: '#/present?slide=cost' },
    ],
  },
] as const;

/** Proposed judging criteria from S078; the checks are list cues, not awarded results. */
export default function GradingChecklist() {
  const recording = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  return <>
    <p className="rl-deck__eyebrow">Sent evaluation statement</p>
    <h1>The proof, against my criteria</h1>
    <ul className="rl-grade" aria-label="My proposed evaluation criteria" role="list">
      {criteria.map(criterion => <li className="rl-grade__criterion" data-criterion={criterion.id} key={criterion.id}>
        <Check className="rl-grade__check" size={19} strokeWidth={1.5} aria-hidden="true" />
        <div className="rl-grade__content">
          <h2>{criterion.title}</h2>
          <p className="rl-grade__proof">{criterion.proof}</p>
          <div className="rl-grade__links">{criterion.links.map(link => <a key={link.href} href={link.href} {...(link.href.startsWith('/') ? {
            target: '_blank', rel: 'noopener noreferrer',
            onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              recording.current?.showModal();
              video.current?.load();
            },
          } : {})}>{link.label}</a>)}</div>
        </div>
      </li>)}
    </ul>
    <p className="rl-deck__source rl-grade__footnote">Proposed in my email · Production boundaries remain as stated.</p>
    <dialog className="rl-grade-recording" ref={recording} aria-labelledby="recovery-recording-title" onClose={() => video.current?.pause()} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <div className="rl-grade-recording__header"><h2 id="recovery-recording-title">Failed send → refresh → safe retry</h2><button type="button" onClick={() => recording.current?.close()}>Close recording</button></div>
      <p>Controlled first-upload failure. Retained work, one stored version and the reopened PDF.</p>
      <video ref={video} controls preload="none" aria-label="Recorded controlled failure, refresh and successful retry" src={appUrl("/proof/recovery.mp4")} />
      <p className="rl-grade-recording__meta">21 seconds · Original speed · Synthetic records · Browser-only test fault · Recorded working-screen revision</p>
    </dialog>
  </>;
}
