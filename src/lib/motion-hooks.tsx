import { useEffect, useLayoutEffect, useRef } from 'react';
import type { DependencyList, RefObject } from 'react';
import { anim, arc, finishFlight, fixedCopy, glideTo, growWidth, reduced, rise, roll } from './motion';

/** One measured surface; resize and scroll never leave it behind its target. */
export function useGlider(ref: RefObject<HTMLElement | null>, target: () => Element | null | undefined, deps: DependencyList, options: Parameters<typeof glideTo>[2] = {}) {
  useLayoutEffect(() => {
    const el = ref.current, to = target();
    if (!el) return;
    el.hidden = !to;
    if (!to) return;
    glideTo(el, to, options);
    let measured = to.getBoundingClientRect();
    const update = () => {
      const next = target(); if (!next || !el.isConnected) return;
      const rect = next.getBoundingClientRect();
      if (rect.left === measured.left && rect.top === measured.top && rect.width === measured.width && rect.height === measured.height) return;
      measured = rect; glideTo(el, next, { ...options, instant: true });
    };
    const observer = new ResizeObserver(update);
    observer.observe(el.offsetParent || to); observer.observe(to);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, deps);
}

export function RollingNumber({ value }: { value: number }) {
  const el = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { if (el.current) roll(el.current, String(value)); }, [value]);
  return <><span ref={el} aria-hidden="true" className="rolling-number" /><span className="sr-only">{value}</span></>;
}

/** Snapshot before React changes the set/order. Copies are inert; semantics update immediately. */
export function useFlipList(ref: RefObject<HTMLTableSectionElement | null>, deps: DependencyList) {
  const before = useRef<Map<string, { rect: DOMRect; copy: HTMLElement; el: HTMLElement }>>(new Map());
  const snapshot = () => {
    before.current.forEach(item => item.copy.remove()); before.current.clear();
    if (reduced()) return;
    ref.current?.querySelectorAll<HTMLElement>('[data-flip-id]').forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > innerHeight) return;
      const copy = el.cloneNode(true) as HTMLElement;
      // Freeze real column widths before detaching a semantic table row.
      const cells = [...el.children] as HTMLElement[];
      [...copy.children].forEach((cell, i) => Object.assign((cell as HTMLElement).style, { width: `${cells[i].getBoundingClientRect().width}px`, flex: 'none' }));
      copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
      copy.inert = true; copy.setAttribute('aria-hidden', 'true');
      before.current.set(el.dataset.flipId!, { rect, copy, el });
    });
  };
  useLayoutEffect(() => {
    if (!before.current.size) return;
    const remaining = new Map(before.current); before.current.clear();
    ref.current?.querySelectorAll<HTMLElement>('[data-flip-id]').forEach(el => {
      const old = remaining.get(el.dataset.flipId!); remaining.delete(el.dataset.flipId!);
      const last = el.getBoundingClientRect();
      el.getAnimations().forEach(a => a.cancel());
      if (old) {
        old.copy.remove();
        const dy = old.rect.top - last.top, dx = old.rect.left - last.left;
        if (dx || dy) anim(el, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { spring: 'glide' });
      } else if (last.bottom > 0 && last.top < innerHeight) anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
    });
    remaining.forEach(({ rect, copy, el }) => {
      if (el.isConnected) { copy.remove(); return; }
      const layer = document.createElement('div'); layer.className = 'motion-row-exit'; layer.inert = true; layer.setAttribute('aria-hidden', 'true');
      Object.assign(layer.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const table = document.createElement('table'); table.className = el.closest('table')?.className || 'data-table shipment-table';
      table.style.width = '100%'; const body = document.createElement('tbody'); body.append(copy); table.append(body); layer.append(table); document.body.append(layer);
      void finishFlight(layer, anim(layer, [{ opacity: .85 }, { opacity: 0 }], { duration: 120, easing: 'ease-out' }));
    });
  }, deps);
  useEffect(() => () => { before.current.forEach(item => item.copy.remove()); }, []);
  return snapshot;
}

export function useChipMotion(ref: RefObject<HTMLElement | null>, deps: DependencyList) {
  const before = useRef(new Map<string, DOMRect>());
  const source = useRef<{ key: string; rect: DOMRect } | null>(null);
  function prepare(from?: { key: string; el: Element }) {
    before.current = new Map([...ref.current?.querySelectorAll<HTMLElement>('[data-chip]') || []].map(el => [el.dataset.chip!, el.getBoundingClientRect()]));
    source.current = from ? { key: from.key, rect: from.el.getBoundingClientRect() } : null;
  }
  useLayoutEffect(() => {
    const old = before.current; before.current = new Map();
    ref.current?.querySelectorAll<HTMLElement>('[data-chip]').forEach(el => {
      const rect = el.getBoundingClientRect(), prev = old.get(el.dataset.chip!);
      if (prev) { if (prev.left !== rect.left || prev.top !== rect.top) anim(el, [{ transform: `translate(${prev.left - rect.left}px,${prev.top - rect.top}px)` }, { transform: 'none' }], { spring: 'glide' }); }
      else if (source.current && source.current.key === el.dataset.chip && !reduced()) {
        const from = source.current.rect, copy = fixedCopy(el, from); copy.style.height = `${rect.height}px`; copy.style.width = `${rect.width}px`;
        const origin = { left: from.left, top: from.top, width: rect.width, height: rect.height };
        void finishFlight(copy, arc(copy, origin, rect, { opacity: [.75, 0], lift: -12 }));
        anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: 200, fill: 'backwards' });
      }
    });
    source.current = null;
  }, deps);
  return prepare;
}

export function removeChip(el: HTMLElement) {
  if (reduced()) return;
  const copy = fixedCopy(el); void finishFlight(copy, anim(copy, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6)', filter: 'blur(3px)' }], { duration: 160, easing: 'ease-out' }));
}

export function useNewTab(ref: RefObject<HTMLElement | null>, captureId?: string) {
  const seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    if (!captureId || seen.current.has(captureId)) return;
    seen.current.add(captureId);
    const tab = ref.current?.querySelector<HTMLElement>(`[data-document-id="${CSS.escape(captureId)}"]`);
    if (tab) { void growWidth(tab); rise(tab.querySelector('.source-tab-time'), { delay: 360, y: 3, blur: 0 }); }
  }, [captureId]);
}
