// src/components/TransferTrack.tsx
import { useEffect, useLayoutEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { anim, fold, glideTo, reduced, unfold } from '../lib/motion';

export type TrackStage = 'preparing' | 'sending' | 'received' | 'failed' | 'uncertain';
const STEPS = ['Preparing PDF', 'Sending pickup', 'Received by demo server'] as const;
const ROW = 30; // px; must match .transfer-track__step height

export default function TransferTrack({ stage, attempt = 0, onDone }: { stage: TrackStage; attempt?: number; onDone?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const node = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const marks = useRef<(HTMLSpanElement | null)[]>([]);
  const placed = useRef(false);
  const done = useRef(onDone); done.current = onDone;
  const index = stage === 'preparing' ? 0 : stage === 'received' ? 2 : 1;
  const paused = stage === 'failed' || stage === 'uncertain';

  // Arrive once. A refresh into a retained pickup mounts straight into the paused state.
  useLayoutEffect(() => { if (root.current && stage === 'preparing') void unfold(root.current); }, []);

  // The node and the fill move only when the stage index changes.
  useLayoutEffect(() => {
    const target = marks.current[index];
    if (!node.current || !fill.current || !target) return;
    glideTo(node.current, target, { instant: !placed.current });
    const to = `${index * ROW}px`;
    if (placed.current) anim(fill.current, [{ height: fill.current.style.height || '0px' }, { height: to }], { spring: 'glide' });
    fill.current.style.height = to;
    placed.current = true;
  }, [index]);

  // Received: hold for a beat on the last check, then fold away so the receipt can unfold.
  useEffect(() => {
    if (stage !== 'received') return;
    const t = window.setTimeout(() => {
      if (root.current) void fold(root.current).then(() => done.current?.()); else done.current?.();
    }, reduced() ? 0 : 380);
    return () => window.clearTimeout(t);
  }, [stage]);

  return <div ref={root} className="rail-section transfer-track-section">
    <div className="transfer-track">
      <span className="transfer-track__line" aria-hidden="true"><span ref={fill} className="transfer-track__fill" /></span>
      <span ref={node} className="transfer-track__node" data-paused={paused || undefined} aria-hidden="true" />
      <ol aria-label="Transfer progress">
        {STEPS.map((label, i) => {
          const state = stage === 'received' || i < index ? 'done' : i === index ? (paused ? 'paused' : 'current') : 'next';
          return <li key={label} className="transfer-track__step" data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span ref={el => { marks.current[i] = el; }} className="transfer-track__mark" aria-hidden="true">
              {state === 'done' ? <Check size={9} strokeWidth={3} /> : state === 'paused' ? '!' : null}
            </span>
            <span className="transfer-track__label">{label}{state === 'paused' ? <span className="sr-only"> (paused)</span> : null}</span>
            {i === 1 && paused ? <span className="transfer-track__meta" aria-hidden="true">paused</span>
              : i === 1 && attempt > 0 && state !== 'next' ? <span className="transfer-track__meta">retry {attempt}</span> : null}
          </li>;
        })}
      </ol>
    </div>
  </div>;
}
