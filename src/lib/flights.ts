import type { SignatureStroke } from '../../shared/contracts';
import { anim, arc, finishFlight, reduced, SPR } from './motion';
import type { Box } from './motion';
const packetFlights = new WeakMap<HTMLElement, HTMLElement[]>();
const visible = (el: Element | null) => el && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().bottom > 0 && el.getBoundingClientRect().top < innerHeight;

export function flyCitation(from: Element | null, to: Element | null, label: string) {
  if (!visible(to)) return;
  if (!reduced()) anim(to, [{ boxShadow: '0 0 0 3px rgb(34 94 101 / .25)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 500, delay: visible(from) ? SPR.travel.duration : 0 });
  if (reduced() || !visible(from)) return;
  const a = from!.getBoundingClientRect(), b = to!.getBoundingClientRect();
  const chip = document.createElement('span'); chip.className = 'motion-citation-flight'; chip.textContent = label; chip.inert = true; chip.setAttribute('aria-hidden', 'true');
  Object.assign(chip.style, { left: `${a.left}px`, top: `${a.top}px` }); document.body.append(chip);
  const rect = chip.getBoundingClientRect();
  void finishFlight(chip, arc(chip, rect, { left: b.left + 10, top: b.top + 10, width: rect.width, height: rect.height }, { lift: -20, opacity: [1, 0] }));
}

export function echoSignature(pad: SVGSVGElement | null, strokes: SignatureStroke[], destination: Box | null, page: Box | null) {
  if (!pad || !strokes.length || reduced()) return;
  const points = strokes.flat(); if (!points.length) return;
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
  const w = Math.max(.01, Math.max(...points.map(p => p.x)) - minX), h = Math.max(.01, Math.max(...points.map(p => p.y)) - minY);
  const bounds = pad.getBoundingClientRect();
  const from = { left: bounds.left + minX * bounds.width, top: bounds.top + minY * bounds.height, width: w * bounds.width, height: h * bounds.height };
  const layer = document.createElement('div'); layer.className = 'motion-ink-flight'; layer.inert = true; layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `${minX * 3} ${minY} ${w * 3} ${h}`); svg.setAttribute('preserveAspectRatio', 'none');
  strokes.filter(line => line.length > 1).forEach(line => { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', line.map((p, i) => `${i ? 'L' : 'M'}${p.x * 3} ${p.y}`).join(' ')); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#20313b'); path.setAttribute('stroke-width', '.008'); svg.append(path); });
  layer.append(svg); document.body.append(layer);
  if (!destination || !page || destination.top < page.top || destination.top + destination.height > page.top + page.height || destination.left < page.left || destination.left + destination.width > page.left + page.width) {
    void finishFlight(layer, anim(layer, [{ opacity: .55 }, { opacity: 0, transform: 'translate(-14px,-4px)' }], { spring: 'travel' })); return;
  }
  const scale = Math.min(destination.width / (w * 3), destination.height / h);
  const target = { left: destination.left + (destination.width - w * 3 * scale) / 2, top: destination.top + (destination.height - h * scale) / 2, width: w * 3 * scale, height: h * scale };
  const flight = arc(layer, from, target, { opacity: [.55, .85] });
  void (async () => { try { await flight?.finished; await anim(layer, [{ opacity: .85 }, { opacity: 0 }], { duration: 200 })?.finished; } catch { /* Superseded. */ } finally { layer.remove(); } })();
}

/** Real download has already started before this decorative packet flight. */
export async function fileIntoZip(button: HTMLElement | null, count: number) {
  if (!button || reduced()) return;
  packetFlights.get(button)?.forEach(card => { card.getAnimations().forEach(a => a.cancel()); card.remove(); });
  const r = button.getBoundingClientRect();
  const cards = Array.from({ length: Math.min(4, Math.max(1, count)) }, (_, i) => {
    const card = document.createElement('div'); card.className = 'motion-packet-page'; card.inert = true; card.setAttribute('aria-hidden', 'true');
    Object.assign(card.style, { left: `${r.left + r.width / 2 - 17}px`, top: `${r.top - 48}px` }); document.body.append(card); return { card, i };
  });
  packetFlights.set(button, cards.map(({card}) => card));
  try {
    await Promise.all(cards.map(({ card, i }) => anim(card, [{ opacity: 0, transform: 'translateY(16px) scale(.6)' }, { opacity: 1, transform: `translate(${(i - (cards.length - 1) / 2) * 15}px,-20px) rotate(${(i - (cards.length - 1) / 2) * 11}deg)` }], { spring: 'pop', delay: i * 50, fill: 'forwards' })?.finished));
    await Promise.all(cards.map(({ card }) => { const from = getComputedStyle(card).transform; card.getAnimations().forEach(a => a.cancel()); return anim(card, [{ transform: from }, { transform: 'translate(0,-16px)' }], { spring: 'snap', fill: 'forwards' })?.finished; }));
    await Promise.all(cards.map(({ card, i }) => anim(card, [{ transform: 'translate(0,-16px)', opacity: 1 }, { transform: 'translate(0,42px) scale(.55)', opacity: 0 }], { duration: 220, delay: i * 25, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })?.finished));
  } catch { /* Route changes may interrupt motion, never the downloaded file. */ }
  finally { cards.forEach(({ card }) => card.remove()); }
}
