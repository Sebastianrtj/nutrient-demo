import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Eraser, PenLine } from 'lucide-react';
import type { SignaturePoint, SignatureStroke } from '../../shared/contracts';

export default function SignaturePad({ strokes, onChange, disabled = false, signer = 'driver' }: { strokes: SignatureStroke[]; onChange: (value: SignatureStroke[]) => void; disabled?: boolean; signer?: 'driver' | 'receiver' }) {
  const helpId = useId();
  const drawing = useRef(false);
  const current = useRef<SignatureStroke[]>(strokes); current.current = strokes;
  const [cursor, setCursor] = useState<SignaturePoint>({ x: 0.2, y: 0.55 });
  const [keyboard, setKeyboard] = useState(false);
  const [penDown, setPenDown] = useState(false);
  function point(event: PointerEvent<SVGSVGElement>): SignaturePoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }
  function start(event: PointerEvent<SVGSVGElement>) {
    if (disabled || event.button !== 0) return;
    event.preventDefault(); setKeyboard(false); setPenDown(false); drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = point(event); onChange([...current.current, [at, at]]);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!drawing.current || disabled) return;
    const next = [...current.current]; next[next.length - 1] = [...next[next.length - 1], point(event)]; onChange(next);
  }
  function stop() { drawing.current = false; }
  function key(event: KeyboardEvent<SVGSVGElement>) {
    if (disabled) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); setKeyboard(true);
      if (!penDown) onChange([...current.current, [cursor, cursor]]);
      setPenDown(!penDown); return;
    }
    if (event.key === 'Escape') { setPenDown(false); return; }
    const offset: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!offset[event.key]) return;
    event.preventDefault(); setKeyboard(true);
    const step = event.shiftKey ? 0.04 : 0.012;
    const nextPoint = { x: Math.max(0.02, Math.min(0.98, cursor.x + offset[event.key][0] * step)), y: Math.max(0.03, Math.min(0.97, cursor.y + offset[event.key][1] * step)) };
    setCursor(nextPoint);
    if (penDown) { const next = [...current.current]; next[next.length - 1] = [...next[next.length - 1], nextPoint]; onChange(next); }
  }
  return <div className={`signature ${disabled ? 'signature--disabled' : ''}`}>
    <div className="signature-label"><span><PenLine size={16} aria-hidden="true" />{signer === 'receiver' ? 'Receiver signature' : 'Driver pickup signature'}</span><button type="button" className="text-button" disabled={disabled || !strokes.length} onClick={() => { setPenDown(false); onChange([]); }}><Eraser size={14} />Clear</button></div>
    <svg role="application" aria-label={signer === 'receiver' ? 'Draw a fresh receiver signature' : 'Draw a fresh driver pickup signature'} aria-describedby={helpId} aria-disabled={disabled} tabIndex={disabled ? -1 : 0} viewBox="0 0 1000 400" preserveAspectRatio="none" className="signature-pad" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onKeyDown={key} onBlur={() => { setPenDown(false); setKeyboard(false); }}>
      <line x1="45" x2="955" y1="325" y2="325" stroke="#dedede" strokeWidth="2" />
      {!strokes.length && <text x="500" y="205" textAnchor="middle" fill="#858585" fontSize="38" fontFamily="sans-serif">{signer === 'receiver' ? 'Your receiving signature' : 'Your pickup signature'}</text>}
      {strokes.map((stroke, index) => <path key={index} d={stroke.map((at, i) => `${i ? 'L' : 'M'}${at.x * 1000},${at.y * 400}`).join(' ')} fill="none" stroke="var(--slate)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />)}
      {keyboard && <circle cx={cursor.x * 1000} cy={cursor.y * 400} r="10" fill={penDown ? 'var(--teal)' : 'white'} stroke="var(--teal)" strokeWidth="3" />}
    </svg>
    <details className="keyboard-help"><summary>Keyboard signing</summary><p id={helpId}>Use arrow keys to move. Enter lowers or lifts the pen. Hold Shift for larger steps. Escape lifts the pen. Clear removes all strokes.</p></details>
  </div>;
}
