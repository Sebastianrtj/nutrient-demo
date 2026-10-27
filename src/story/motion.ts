import { useEffect, useRef, useState } from 'react';

export interface SceneFrame {
  truck: number;
  worldOpacity: number;
  worldScale: number;
  worldX: number;
  worldY: number;
  officeOpacity: number;
  officeScale: number;
  evidence: number;
}

export const ROAD = [[570, 792], [740, 714], [915, 638], [1080, 560]] as const;
export const RECORD_PATH = [[427, 580], [480, 870], [925, 965], [1235, 865]] as const;
type Curve = readonly (readonly [number, number])[];
export const pathFor = (p: Curve) => `M${p[0][0]} ${p[0][1]} C${p[1][0]} ${p[1][1]} ${p[2][0]} ${p[2][1]} ${p[3][0]} ${p[3][1]}`;
export function pointOn(p: Curve, t: number) {
  const a = 1 - t;
  return {
    x: a * a * a * p[0][0] + 3 * a * a * t * p[1][0] + 3 * a * t * t * p[2][0] + t * t * t * p[3][0],
    y: a * a * a * p[0][1] + 3 * a * a * t * p[1][1] + 3 * a * t * t * p[2][1] + t * t * t * p[3][1],
  };
}

function targetFor(step: number): SceneFrame {
  return {
    truck: step >= 2 ? 1 : 0,
    worldOpacity: step === 0 ? 0 : 1,
    worldScale: step === 0 ? 1.65 : step === 2 ? 1.1 : 1,
    worldX: step === 0 ? 300 : step === 2 ? -60 : 0,
    worldY: step === 0 ? -100 : step === 2 ? 20 : 0,
    officeOpacity: step === 0 ? 1 : 0,
    officeScale: step === 0 ? 1.045 : .84,
    evidence: step === 3 ? 1 : 0,
  };
}
function entranceFor(step: number): SceneFrame {
  if (step === 0) return { ...targetFor(0), officeScale: .965 };
  if (step === 1) return targetFor(0);
  if (step === 2) return targetFor(1);
  return { ...targetFor(3), evidence: 0 };
}
const keys = Object.keys(targetFor(0)) as Array<keyof SceneFrame>;

/** One pausable clock drives the camera, truck, and Accounting reveal. */
export function useStoryMotion(step: number, enabled: boolean, paused: boolean) {
  const [frame, setFrame] = useState<SceneFrame>(() => enabled ? entranceFor(step) : targetFor(step));
  const [moving, setMoving] = useState(enabled);
  const [replayCount, setReplayCount] = useState(0);
  const current = useRef(frame);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const target = targetFor(step);
    const from = { ...current.current };
    if (!enabled || keys.every(key => Math.abs(target[key] - from[key]) < .0001)) {
      current.current = target;
      setFrame(target);
      setMoving(false);
      return;
    }
    let request = 0;
    let previous = performance.now();
    let elapsed = 0;
    const duration = step === 3 ? 1050 : step === 2 ? 3200 : step === 0 ? 1500 : 1300;
    setMoving(true);
    const tick = (now: number) => {
      const dt = Math.min(now - previous, 80);
      previous = now;
      if (!pausedRef.current) {
        elapsed += dt;
        const p = Math.min(elapsed / duration, 1);
        const ease = p * p * p * (p * (p * 6 - 15) + 10);
        const next = { ...target };
        for (const key of keys) next[key] = from[key] + (target[key] - from[key]) * ease;
        current.current = next;
        setFrame(next);
        if (p === 1) { setMoving(false); return; }
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [step, enabled, replayCount]);

  function replay() {
    const start = entranceFor(step);
    current.current = start;
    setFrame(start);
    setReplayCount(count => count + 1);
  }
  return { frame, moving, replay };
}
