import { appUrl } from '../lib/base-path';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import './accounting-scene.css';

const sources = [
  { id: 'original-bol', title: 'Original BOL', file: 'RS-417652.pdf', alt: 'Supplied original BOL for shipment RS-417652' },
  { id: 'invoice', title: 'Invoice', file: 'INV-2104464.pdf', alt: 'Supplied invoice INV-2104464' },
  { id: 'historical-scan', title: 'Historical scan', file: 'P10_RS-417652_20260707.pdf', alt: 'Supplied historical scanned BOL for shipment RS-417652' },
] as const;

function reveal(progress: number, start: number, end: number, distance = 10): CSSProperties {
  const value = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return { opacity: value, transform: `translateY(${(1 - value) * distance}px)` };
}

/** A process illustration; its supplied documents are not a saved case assessment. */
export default function AccountingScene({ progress, still }: { progress: number; still: boolean }) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [loadedSources, setLoadedSources] = useState<string[]>([]);
  const position = still ? 1 : progress;
  function markMissing(id: string) {
    setFailedSources(current => current.includes(id) ? current : [...current, id]);
  }
  return <div className="rl-story__accounting" role="group" aria-label="One shipment links to original BOL, invoice and historical scan. A person reviews the sources before preparing a packet. New demo pickup remains separate."
    data-retrieval-progress={position.toFixed(3)} data-retrieval-settled={position >= .9999} data-still={still}>
    <div className="rl-story__retrieval-record" style={reveal(position, 0, .3, 5)}>
      <div className="rl-story__retrieval-query"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6" /><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg><strong>RS-417652</strong><span>One shipment</span></div>
      <div className="rl-story__retrieval-refs"><span>Invoice <b>INV-2104464</b></span><span>Deduction <b>CHB-0899904</b></span></div>
    </div>
    <svg className="rl-story__retrieval-links" viewBox="0 0 840 30" preserveAspectRatio="none" style={reveal(position, .08, .4, 0)} aria-hidden="true"><path d="M420 0V10M135 30V20Q135 10 145 10H695Q705 10 705 20V30M420 10V30" /><circle cx="420" cy="10" r="2.5" /></svg>
    <div className="rl-story__retrieval-sources">
      {sources.map((source, index) => <article className="rl-story__retrieval-source" key={source.id} data-source={source.id} style={reveal(position, .1 + index * .07, .62 + index * .04, 15)}>
        <div className="rl-story__retrieval-source-heading"><strong>{source.title}</strong><span>0{index + 1} / Source</span></div>
        <div className="rl-story__retrieval-paper" data-image-state={failedSources.includes(source.id) ? 'unavailable' : loadedSources.includes(source.id) ? 'ready' : 'loading'}>
          {failedSources.includes(source.id) ? <div className="rl-story__retrieval-image-fallback"><svg viewBox="0 0 32 40" fill="none" aria-hidden="true"><path d="M5 2h15l8 8v28H5zM20 2v9h8M11 18h11M11 23h11M11 28h7" stroke="currentColor" strokeWidth="1.2" /></svg><span>Preview unavailable</span></div> : <img className="rl-story__source-preview" src={appUrl(`/story/accounting-assets/${source.id}.png`)} alt={source.alt} onLoad={() => setLoadedSources(current => current.includes(source.id) ? current : [...current, source.id])} onError={() => markMissing(source.id)} />}
        </div>
        <p className="rl-story__retrieval-file">{source.file}</p>
      </article>)}
    </div>
    <div className="rl-story__retrieval-provenance" style={reveal(position, .38, .8, 7)}><span>Original evidence stays intact.</span><span className="rl-story__retrieval-pickup"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2.5h6l3 3V14H3zM9 2.5V6h3" stroke="currentColor" strokeWidth="1.2" /></svg>New demo pickup <b>Separate version</b></span></div>
    <div className="rl-story__retrieval-review">
      <div className="rl-story__retrieval-assessment" style={reveal(position, .48, .9, 8)}><span className="rl-story__retrieval-person"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.4" /><path d="M5 20v-2a7 7 0 0 1 14 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></span><div><strong>Your assessment</strong><p>Compare sources. Keep gaps visible.</p></div></div>
      <svg className="rl-story__retrieval-arrow" viewBox="0 0 24 24" fill="none" style={reveal(position, .62, .95, 0)} aria-hidden="true"><path d="M3 12h17m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="rl-story__retrieval-packet" style={reveal(position, .66, 1, 8)}><svg viewBox="0 0 32 40" fill="none" aria-hidden="true"><path d="M5 2h15l8 8v28H5zM20 2v9h8M11 18h11M11 23h11M11 28h7M2 6v32h3" stroke="currentColor" strokeWidth="1.2" /></svg><div><strong>Review packet</strong><span>Sources + assessment</span></div></div>
    </div>
  </div>;
}
