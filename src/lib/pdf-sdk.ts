import { appUrl } from './base-path';
import { draw } from './motion';
import type { Instance } from '@nutrient-sdk/viewer';
import type { SignatureStroke, ReceivingDetails } from '../../shared/contracts';

export interface PdfHandle {
  setSignature(strokes: SignatureStroke[], signingDate: string, receiving?: ReceivingDetails): Promise<void>;
  clearSignature(): Promise<void>;
  focusSignature(): void;
  focusDriver(): () => void;
  driverClientRect(): { left: number; top: number; width: number; height: number } | null;
  exportFlattened(): Promise<ArrayBuffer>;
  destroy(): void;
}

type Sdk = typeof import('@nutrient-sdk/viewer')['default'];
let sdkPromise: Promise<Sdk> | undefined;
const mounts = new WeakMap<HTMLElement, Promise<PdfHandle>>();

// Verified on all 40 supplied 612 × 792 BOLs. These are PDF page coordinates,
// independent of screen zoom. Driver and consignee use distinct regions.
const driverRegion = { left: 294, top: 558, width: 170, height: 20 };
const receiverRegion = { left: 308, top: 590, width: 156, height: 20 };
const driverDateRegion = { left: 498, top: 558, width: 70, height: 20 };

function signatureLines(strokes: SignatureStroke[], sdk: Sdk, region: typeof driverRegion) {
  const clean = strokes.map(line => line.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    .filter(line => line.length > 1);
  const points = clean.flat();
  if (points.length < 3) throw new Error('Add your signature before saving.');
  const minX = Math.min(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const width = Math.max(...points.map(p => p.x)) - minX;
  const height = Math.max(...points.map(p => p.y)) - minY;
  if (width < 0.015 && height < 0.015) throw new Error('Add a clear signature before saving.');
  // The drawing pad's normalized X/Y coordinates represent a 3:1 input surface.
  // Crop the empty margins, preserve the actual stroke aspect ratio, then fit.
  const drawingWidth = Math.max(width * 3, 0.01);
  const drawingHeight = Math.max(height, 0.01);
  const scale = Math.min(region.width / drawingWidth, region.height / drawingHeight);
  const offsetX = region.left + (region.width - drawingWidth * scale) / 2;
  const offsetY = region.top + (region.height - drawingHeight * scale) / 2;
  return sdk.Immutable.List(clean.map(line => sdk.Immutable.List(line.map(p => new sdk.Geometry.DrawingPoint({
    x: offsetX + (p.x - minX) * 3 * scale,
    y: offsetY + (p.y - minY) * scale,
  })))));
}

export async function mountPdf(
  element: HTMLElement,
  url: string,
  opts: { readOnly?: boolean; signer?: 'driver' | 'receiver'; signal?: AbortSignal } = {},
): Promise<PdfHandle> {
  const previous = mounts.get(element);
  const pending = (async () => {
    if (previous) {
      try { (await previous).destroy(); } catch { /* A failed mount owns no viewer. */ }
    }
    opts.signal?.throwIfAborted();
    if (!element.isConnected) throw new Error('Document view was closed.');
    if (element.clientWidth < 1 || element.clientHeight < 1) throw new Error('Document view has no available space.');
    sdkPromise ??= import('@nutrient-sdk/viewer').then(module => module.default);
    const sdk = await sdkPromise;
    opts.signal?.throwIfAborted();
    if (!element.isConnected) throw new Error('Document view was closed.');
    const licenseKey = import.meta.env.VITE_NUTRIENT_LICENSE_KEY;
    const publishableKey = import.meta.env.VITE_NUTRIENT_PUBLISHABLE_KEY;
    const allowedTools = new Set(['pager', 'zoom-in', 'zoom-out', 'zoom-mode', 'spacer', 'pan', 'search']);
    // Give each asynchronous load its own container. A stale React effect can
    // finish after a source switch; its cleanup must only own that old mount.
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    element.appendChild(container);
    let instance: Instance;
    try {
      instance = await sdk.load({
        container,
        signal: opts.signal,
        document: new URL(url, window.location.origin).href,
        baseUrl: new URL(import.meta.env.BASE_URL, window.location.origin).href,
        styleSheets: [new URL(appUrl('viewer-theme.css'), window.location.origin).href],
        ...(licenseKey ? { licenseKey } : publishableKey ? { session: publishableKey } : {}),
        toolbarItems: sdk.defaultToolbarItems.filter(item => allowedTools.has(item.type)),
        initialViewState: new sdk.ViewState({
          readOnly: Boolean(opts.readOnly),
          zoom: sdk.ZoomMode.FIT_TO_WIDTH,
          showToolbar: true,
          enableAnnotationToolbar: false,
        }),
      });
    } catch (error) {
      sdk.unload(container);
      container.remove();
      throw error;
    }
    if (opts.signal?.aborted) { sdk.unload(container); container.remove(); opts.signal.throwIfAborted(); }
    const region = opts.signer === 'receiver' ? receiverRegion : driverRegion;
    const dateRegion = opts.signer === 'receiver' ? { ...driverDateRegion, top: 590 } : driverDateRegion;
    const acknowledgementView = () => opts.signer === 'receiver' && element.clientWidth < 600 ? { left: 220, top: 540, width: 355, height: 194 } : { left: 20, top: 510, width: 572, height: 190 };
    let detailIds: string[] = [];
    let alive = true;
    let signatureId: string | null = null;
    let signingDateId: string | null = null;
    let signatureWork: Promise<void> = Promise.resolve();
    // Preview edits, Clear and export share one ordered mutation queue. A late
    // preview must never repaint ink after Clear or race the committed export.
    function changeSignature(change: () => Promise<void>): Promise<void> {
      const next = signatureWork.catch(() => undefined).then(async () => {
        if (!alive) throw new Error('Reopen the document to sign.');
        if (opts.readOnly) throw new Error('This record is read only.');
        await change();
      });
      signatureWork = next;
      return next;
    }
    return {
      setSignature(strokes, signingDate, receiving) { return changeSignature(async () => {
        const page = instance.pageInfoForIndex(0);
        if (!page || Math.abs(page.width - 612) > 1 || Math.abs(page.height - 792) > 1) {
          throw new Error('This form needs its signature position checked.');
        }
        if (!/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([1-9]|[12]\d|3[01]), \d{4}$/.test(signingDate)) {
          throw new Error('The signing date is unavailable. Clear and sign again.');
        }
        const lines = signatureLines(strokes, sdk, region);
        const annotation = new sdk.Annotations.InkAnnotation({
          ...(signatureId ? { id: signatureId } : {}),
          pageIndex: 0,
          isSignature: true,
          readOnly: true,
          lines,
          boundingBox: new sdk.Geometry.Rect(region),
          lineWidth: 1.35,
          strokeColor: new sdk.Color({ r: 32, g: 49, b: 59 }),
        });
        if (signatureId) await instance.update(annotation);
        else {
          const created = await instance.create(annotation);
          const signature = created.find(value => value instanceof sdk.Annotations.InkAnnotation);
          if (!signature || !('id' in signature) || typeof signature.id !== 'string') {
            throw new Error('The PDF signature could not be created. Please try again.');
          }
          signatureId = signature.id;
        }
        const dateAnnotation = new sdk.Annotations.TextAnnotation({
          ...(signingDateId ? { id: signingDateId } : {}),
          pageIndex: 0,
          readOnly: true,
          text: { format: 'plain', value: signingDate },
          font: 'Helvetica',
          fontSize: 9,
          fontColor: new sdk.Color({ r: 32, g: 49, b: 59 }),
          horizontalAlign: 'center',
          verticalAlign: 'center',
          boundingBox: new sdk.Geometry.Rect(dateRegion),
        });
        if (signingDateId) await instance.update(dateAnnotation);
        else {
          const created = await instance.create(dateAnnotation);
          const date = created.find(value => value instanceof sdk.Annotations.TextAnnotation);
          if (!date || !('id' in date) || typeof date.id !== 'string') {
            throw new Error('The PDF signing date could not be created. Please try again.');
          }
          signingDateId = date.id;
        }
        if (opts.signer === 'receiver') {
          if (!receiving) throw new Error('Receiving details are required.');
          if (detailIds.length) await instance.delete(detailIds);
          detailIds = [];
          const notes = receiving.exceptions.replace(/\s+/g, ' ').trim() || 'No exceptions noted by receiver.';
          // Keep the first line above the form's y=660 rule. Continue longer notes
          // below that rule, so printed form lines never strike through the text.
          const measure = document.createElement('canvas').getContext('2d');
          if (!measure) throw new Error('Receiving notes could not be measured.');
          measure.font = '8px Helvetica';
          let split = notes.length;
          while (split > 1 && measure.measureText(notes.slice(0, split)).width > 330) split--;
          if (split < notes.length) { const space = notes.lastIndexOf(' ', split); if (space > split / 2) split = space; }
          const name = 'Received by: ' + receiving.receiverName.replace(/\s+/g, ' ').trim();
          let nameSplit = name.length;
          while (nameSplit > 1 && measure.measureText(name.slice(0, nameSplit)).width > 330) nameSplit--;
          if (nameSplit < name.length) { const space = name.lastIndexOf(' ', nameSplit); if (space > nameSplit / 2) nameSplit = space; }
          const printedName = [name.slice(0, nameSplit), name.slice(nameSplit).trimStart()].filter(Boolean).join('\n');
          const fields = [
            { text: String(receiving.palletsReceived), box: { left: 292, top: 625, width: 42, height: 17 }, align: 'center' as const, size: 10 },
            { text: receiving.exceptions ? 'See notes below' : 'None noted', box: { left: 414, top: 624, width: 154, height: 14 }, align: 'left' as const, size: 8 },
            { text: notes.slice(0, split), box: { left: 228, top: 648, width: 340, height: 12 }, align: 'left' as const, size: 8 },
            { text: notes.slice(split).trimStart(), box: { left: 228, top: 666, width: 340, height: 45 }, align: 'left' as const, size: 8 },
            { text: printedName, box: { left: 228, top: 716, width: 340, height: 20 }, align: 'left' as const, size: 8 },
          ];
          for (const field of fields.filter(field => field.text)) {
            const created = await instance.create(new sdk.Annotations.TextAnnotation({ pageIndex: 0, readOnly: true, text: { format: 'plain', value: field.text }, font: 'Helvetica', fontSize: field.size, fontColor: new sdk.Color({ r: 32, g: 49, b: 59 }), horizontalAlign: field.align, verticalAlign: 'top', boundingBox: new sdk.Geometry.Rect(field.box) }));
            const annotation = created.find(value => value instanceof sdk.Annotations.TextAnnotation);
            if (!annotation || !('id' in annotation) || typeof annotation.id !== 'string') throw new Error('Receiving details could not be added to the PDF.');
            detailIds.push(annotation.id);
          }
        }
      }); },
      clearSignature() { return changeSignature(async () => {
        const ids = [signatureId, signingDateId, ...detailIds].filter((id): id is string => Boolean(id));
        if (ids.length) await instance.delete(ids);
        signatureId = null;
        signingDateId = null; detailIds = [];
      }); },
      focusSignature() {
        if (!alive) return;
        instance.jumpAndZoomToRect(0, new sdk.Geometry.Rect(acknowledgementView()));
      },
      driverClientRect() {
        if (!alive) return null;
        try { const r = instance.transformPageToClientSpace(new sdk.Geometry.Rect(region), 0); return { left: r.left, top: r.top, width: r.width, height: r.height }; } catch { return null; }
      },
      focusDriver() {
        if (!alive) return () => undefined;
        const previous = instance.viewState;
        const bounds = container.getBoundingClientRect();
        const visible = instance.transformClientToPageSpace(new sdk.Geometry.Rect({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }), 0);
        const id = 'acknowledgement-focus-' + crypto.randomUUID();
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        node.setAttribute('width', String(region.width + 8)); node.setAttribute('height', '28'); node.setAttribute('aria-hidden', 'true'); node.style.pointerEvents = 'none';
        const outline = document.createElementNS(node.namespaceURI, 'rect') as SVGRectElement;
        for (const [k, v] of Object.entries({ x: '1', y: '1', width: String(region.width + 6), height: '26', rx: '3', fill: 'none', stroke: '#225e65', 'stroke-width': '1.5' })) outline.setAttribute(k, v);
        node.append(outline);
        instance.jumpAndZoomToRect(0, new sdk.Geometry.Rect(acknowledgementView()));
        instance.setCustomOverlayItem(new sdk.CustomOverlayItem({ id, node, pageIndex: 0, position: new sdk.Geometry.Point({ x: region.left - 4, y: region.top - 4 }), onAppear() { draw(outline, 340, 120); } }));
        return () => { if (alive) { instance.removeCustomOverlayItem(id); instance.setViewState(previous); instance.jumpToRect(0, visible); } };
      },
      async exportFlattened() {
        await signatureWork;
        if (!alive) throw new Error('Reopen the document before saving.');
        if (!signatureId || !signingDateId) throw new Error('Add your signature and signing date before saving.');
        return instance.exportPDF({ flatten: true });
      },
      destroy() {
        if (!alive) return;
        alive = false;
        sdk.unload(container);
        container.remove();
      },
    } satisfies PdfHandle;
  })();
  mounts.set(element, pending);
  return pending;
}
