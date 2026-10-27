// src/lib/motion.ts
// Ridgeline motion · shared helpers for every variation in the motion handoff.
// Timing bands from the brief: press 80–120ms · everyday 160–240ms · featured 350–500ms.
// Reduced motion: movement becomes an opacity change or an instant state. Work is never delayed.

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Spring { easing: string; duration: number; fn: (p: number) => number }

/** Sample a damped spring (stiffness k, damping d) into a CSS linear() easing + duration. */
export function spring(k: number, d: number, m = 1, eps = 0.004): Spring {
  const w0 = Math.sqrt(k / m), z = d / (2 * Math.sqrt(k * m)), wd = w0 * Math.sqrt(Math.max(1e-6, 1 - z * z));
  const x = (t: number) => z < 1
    ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t))
    : 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  let T = 0, ok = 0; const dt = 1 / 240;
  while (T < 3) { T += dt; if (Math.abs(1 - x(T)) < eps) { ok += dt; if (ok > 0.05) break; } else ok = 0; }
  T -= ok;
  const pts = Array.from({ length: 49 }, (_, i) => +x(T * i / 48).toFixed(4)); pts[0] = 0; pts[48] = 1;
  const linearOk = typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
  return { easing: linearOk ? `linear(${pts.join(', ')})` : 'cubic-bezier(.22,1,.36,1)', duration: Math.round(T * 1000), fn: p => (p >= 1 ? 1 : x(T * p)) };
}

export const SPR = {
  snap: spring(900, 60),    // everyday state changes · critically damped, no overshoot
  glide: spring(520, 40),   // rules, rings, surfaces, rows that travel a short way
  travel: spring(240, 26),  // featured moments · one soft overshoot
  pop: spring(760, 34),     // checks, chips, small arrivals · gentle overshoot
} as const;
export type SpringName = keyof typeof SPR;
export const PRESS = { duration: 90, easing: 'cubic-bezier(.3,0,.2,1)' };

interface AnimOptions { spring?: SpringName; duration?: number; easing?: string; delay?: number; fill?: FillMode; id?: string }

/** Element.animate with spring defaults and a reduced-motion path (opacity only, or instant). */
export function anim(el: Element | null | undefined, keyframes: Keyframe[], o: AnimOptions = {}): Animation | null {
  if (!el) return null;
  const s = SPR[o.spring ?? 'snap'];
  if (reduced()) {
    const hasOpacity = keyframes.some(k => 'opacity' in k);
    const kf = hasOpacity ? keyframes.map(k => ({ opacity: k.opacity ?? 1 })) : keyframes.slice(-1);
    return el.animate(kf, { duration: hasOpacity ? 120 : 1, fill: o.fill ?? 'none', id: o.id });
  }
  return el.animate(keyframes, { duration: o.duration ?? s.duration, easing: o.easing ?? s.easing, delay: o.delay ?? 0, fill: o.fill ?? 'none', id: o.id });
}

/** Arrive softly: up from a few px, out of a light blur. */
export function rise(els: Iterable<Element> | Element | null | undefined, o: { stagger?: number; delay?: number; y?: number; x?: number; blur?: number } = {}) {
  if (!els) return;
  const list = els instanceof Element ? [els] : Array.from(els);
  list.forEach((el, i) => anim(el, [
    { opacity: 0, transform: `translate(${o.x ?? 0}px, ${o.y ?? 5}px)`, filter: `blur(${o.blur ?? 4}px)` },
    { opacity: 1, transform: 'none', filter: 'blur(0px)' },
  ], { delay: (o.delay ?? 0) + i * (o.stagger ?? 35), fill: 'backwards' }));
}

/** Small arrivals (checks, chips, dots). */
export const pop = (el: Element | null | undefined, from = 0.5, delay = 0) =>
  anim(el, [{ opacity: 0, transform: `scale(${from})` }, { opacity: 1, transform: 'none' }], { spring: 'pop', delay, fill: 'backwards' });

/** Roll only the characters that changed (counts, timestamps). Never use it to count money up.
 *  The element must not have React-managed children: render it empty and let this own its text. */
export function roll(el: HTMLElement, next: string) {
  const prev = el.dataset.v; el.dataset.v = next;
  if (prev === undefined || reduced()) { el.textContent = next; return; }
  if (prev === next) return;
  const L = Math.max(prev.length, next.length), a = prev.padStart(L), b = next.padStart(L);
  const settle: Promise<unknown>[] = [];
  const finish = () => { if (el.dataset.v === next) el.textContent = next; };   // drop padding once settled
  queueMicrotask(() => { Promise.all(settle).then(finish, finish); });
  el.replaceChildren(...Array.from(b, (ch, i) => {
    const d = document.createElement('span'); d.className = 'digit';
    if (a[i] === ch) { d.textContent = ch; return d; }
    const o = document.createElement('i'), n = document.createElement('i'); o.textContent = a[i]; n.textContent = ch; d.append(o, n);
    const dir = ch > a[i] || a[i] === ' ' ? 1 : -1;
    anim(o, [{ transform: 'none', opacity: 1 }, { transform: `translateY(${-95 * dir}%)`, opacity: 0 }], { fill: 'forwards', delay: i * 16 });
    const na = anim(n, [{ transform: `translateY(${95 * dir}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { fill: 'backwards', delay: i * 16 });
    if (na) settle.push(na.finished.catch(() => undefined));
    return d;
  }));
}

/** One shared element (rule, surface, ring) glides onto a target. Its offsetParent must be positioned. */
export function glideTo(g: HTMLElement, target: Element, o: { pad?: number; padY?: number; spring?: SpringName; instant?: boolean; keepY?: boolean } = {}) {
  const parent = g.offsetParent as HTMLElement | null; if (!parent) return;
  const b = parent.getBoundingClientRect(), r = target.getBoundingClientRect(), px = o.pad ?? 0, py = o.padY ?? px;
  const to: Record<string, string> = { left: `${r.left - b.left - parent.clientLeft + parent.scrollLeft - px}px`, width: `${r.width + px * 2}px` };
  if (!o.keepY) Object.assign(to, { top: `${r.top - b.top - parent.clientTop + parent.scrollTop - py}px`, height: `${r.height + py * 2}px` });
  const computed = getComputedStyle(g);
  const from: Record<string, string> = {}; for (const k in to) from[k] = computed.getPropertyValue(k);
  g.getAnimations().forEach(a => a.cancel());
  for (const k in to) g.style.setProperty(k, to[k]);
  const placed = g.dataset.placed === '1'; g.dataset.placed = '1';
  if (!placed || o.instant) { if (!placed && !o.instant) anim(g, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' }); return; }
  if (Object.keys(from).some(k => from[k] !== to[k])) anim(g, [from, to], { spring: o.spring ?? 'glide' });
}

/** FLIP for a fixed set of elements: measure, mutate, play back from the old positions. */
export function flip(els: () => HTMLElement[], mutate: () => void, o: { spring?: SpringName } = {}) {
  const first = new Map(els().map(e => [e, e.getBoundingClientRect()]));
  mutate();
  for (const e of els()) {
    const f = first.get(e); if (!f) continue;
    const l = e.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
    if (dx || dy) anim(e, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { spring: o.spring ?? 'glide' });
  }
}

/** Height unfold / fold for elements that cannot use grid-template-rows. */
export function unfold(el: HTMLElement, o: { spring?: SpringName; delay?: number } = {}) {
  const h = el.offsetHeight; el.style.overflow = 'hidden';
  const cs = getComputedStyle(el);
  const a = anim(el, [{ height: '0px', paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px', opacity: 0 }, { height: `${h}px`, paddingTop: cs.paddingTop, paddingBottom: cs.paddingBottom, borderWidth: cs.borderWidth, opacity: 1 }], { spring: o.spring, delay: o.delay, fill: 'backwards' });
  const done = () => { el.style.overflow = ''; };
  return a ? a.finished.then(done, done) : Promise.resolve(done());
}
export function fold(el: HTMLElement, o: { spring?: SpringName } = {}) {
  el.style.overflow = 'hidden';
  const a = anim(el, [{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: '0px', paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px', opacity: 0 }], { spring: o.spring, fill: 'forwards' });
  return a ? a.finished.then(() => undefined, () => undefined) : Promise.resolve();
}
/** A new inline item (a source tab) opens its own room. */
export function growWidth(el: HTMLElement, o: { spring?: SpringName; delay?: number } = {}) {
  const cs = getComputedStyle(el), w = el.offsetWidth;
  el.style.overflow = 'hidden';
  const a = anim(el, [
    { width: '0px', paddingLeft: '0px', paddingRight: '0px', opacity: 0 },
    { width: `${w}px`, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, opacity: 1 },
  ], { spring: o.spring ?? 'glide', delay: o.delay, fill: 'backwards' });
  const done = () => { el.style.overflow = ''; };
  return a ? a.finished.then(done, done) : Promise.resolve(done());
}

/** Press: 90ms down, spring release. For elements CSS :active can't reach (e.g. programmatic). */
export function press(el: HTMLElement | null, depth = 0.975) {
  if (!el || reduced()) return;
  el.animate([{ transform: 'none' }, { transform: `scale(${depth})` }], { ...PRESS, fill: 'forwards' });
  setTimeout(() => el.animate([{ transform: `scale(${depth})` }, { transform: 'none' }], { duration: SPR.pop.duration, easing: SPR.pop.easing }), 100);
}

/** Draw an SVG stroke (checks, outlines). */
export function draw(path: SVGGeometryElement, duration = 260, delay = 0) {
  const L = path.getTotalLength();
  path.style.strokeDasharray = String(L); path.style.strokeDashoffset = reduced() ? '0' : String(L);
  if (reduced()) return null;
  return path.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration, delay, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
}

/** A fixed-position copy of an element, for flights that outlive the source (route or viewer swaps). */
export function fixedCopy(el: Element, rect: DOMRect = el.getBoundingClientRect(), className = 'motion-flight') {
  const c = el.cloneNode(true) as HTMLElement;
  const style = getComputedStyle(el);
  for (const property of ['display', 'color', 'font', 'background', 'border', 'border-radius', 'padding', 'gap', 'align-items', 'justify-content', 'box-shadow', 'white-space']) c.style.setProperty(property, style.getPropertyValue(property));
  c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
  c.inert = true; c.setAttribute('aria-hidden', 'true'); c.classList.add(className);
  Object.assign(c.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', zIndex: '1000', pointerEvents: 'none', transformOrigin: '0 0' });
  document.body.append(c);
  return c;
}

export interface Box { left: number; top: number; width: number; height: number }
/** Fly an element along a gentle arc from one client rect to another (uniform or free scale). */
export function arc(el: HTMLElement, from: Box, to: Box, o: { lift?: number; spring?: SpringName; uniform?: boolean; shadow?: boolean; opacity?: [number, number] } = {}) {
  const dx = to.left - from.left, dy = to.top - from.top;
  const sx = to.width / from.width, sy = o.uniform ? sx : to.height / from.height, lift = o.lift ?? -18;
  const [o0, o1] = o.opacity ?? [1, 1];
  const shadow = (on: boolean) => (o.shadow ? (on ? '0 10px 24px rgb(16 30 38 / .22)' : '0 0 0 rgb(0 0 0 / 0)') : 'none');
  return anim(el, [
    { transform: 'none', boxShadow: shadow(false), opacity: o0 },
    { transform: `translate(${dx / 2}px, ${dy / 2 + lift}px) scale(${((1 + sx) / 2) * 1.04}, ${((1 + sy) / 2) * 1.04})`, boxShadow: shadow(true), opacity: (o0 + o1) / 2, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, boxShadow: shadow(false), opacity: o1 },
  ], { spring: o.spring ?? 'travel', fill: 'forwards' });
}

/** Keep the CSS tokens in sync with SPR (motion.css ships the same values as a static fallback). */
export function installMotionTokens(root: HTMLElement = document.documentElement) {
  for (const [k, s] of Object.entries(SPR)) { root.style.setProperty(`--sp-${k}`, s.easing); root.style.setProperty(`--sp-${k}-d`, `${s.duration}ms`); }
}

/** Dispose decorative work even when its source disappears mid-flight. */
export async function finishFlight(el: HTMLElement, animation: Animation | null) {
  try { await animation?.finished; } catch { /* Superseded motion. */ } finally { el.remove(); }
}
