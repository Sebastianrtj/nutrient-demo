import { useLayoutEffect, useRef, useState } from 'react';
import { FileText, RotateCw } from 'lucide-react';
import { mountPdf } from '../lib/pdf-sdk';
import { Status } from '../ui';

export type ViewerHandle = Awaited<ReturnType<typeof mountPdf>>;
export type PdfLoadState = 'loading' | 'ready' | 'error';

export default function PdfPane({ url, readOnly = true, signer = 'driver', active = true, title, onReady, onStateChange }: { url?: string; readOnly?: boolean; signer?: 'driver' | 'receiver'; active?: boolean; title: string; onReady?: (handle: ViewerHandle | null) => void; onStateChange?: (state: PdfLoadState) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady); ready.current = onReady;
  const report = useRef(onStateChange); report.current = onStateChange;
  const [state, setState] = useState<PdfLoadState>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState(url);
  const displayState = source === url ? state : 'loading';
  useLayoutEffect(() => {
    let closed = false;
    const controller = new AbortController();
    let viewer: ViewerHandle | undefined;
    let stopWaiting = () => {};
    setSource(url); setState('loading'); report.current?.('loading'); ready.current?.(null);
    if (!active || !url || !element.current) return;
    const mount = element.current;
    // Retained presentation tasks can be hidden when their source changes.
    // Wait for the visible layout before initializing the SDK in that task.
    const space = new Promise<void>(resolve => {
      const observer = new ResizeObserver(() => {
        if (mount.clientWidth > 0 && mount.clientHeight > 0) { observer.disconnect(); resolve(); }
      });
      stopWaiting = () => { observer.disconnect(); resolve(); };
      observer.observe(mount);
    });
    space.then(() => closed ? undefined : mountPdf(mount, url, { readOnly, signer, signal: controller.signal })).then(handle => {
      if (!handle) return;
      if (closed) { handle.destroy(); return; }
      viewer = handle; setState('ready'); report.current?.('ready'); ready.current?.(handle);
    }).catch(reason => {
      if (closed) return;
      setError(reason instanceof Error ? reason.message : 'The document could not be opened.'); setState('error'); report.current?.('error');
    });
    return () => { closed = true; controller.abort(); stopWaiting(); ready.current?.(null); viewer?.destroy(); };
  }, [url, readOnly, signer, active, attempt]);
  return <div className="pdf-pane" data-state={displayState} aria-label={title} aria-busy={Boolean(url) && displayState === 'loading'}>
    <div key={url} ref={element} className="pdf-mount" />
    {!url ? <div className="pdf-placeholder"><FileText size={32} /><h3>No document supplied</h3><p>The missing file remains an evidence gap.</p></div> : displayState === 'loading' ? <div className="pdf-placeholder pdf-loading" role="status"><div className="breathing-paper" aria-hidden="true"><span /><span /><span /><span /></div><Status busy>Opening source PDF</Status></div> : displayState === 'error' ? <div className="pdf-placeholder" role="alert"><FileText size={30} /><h3>Document could not open</h3><p>{error}</p><button className="button button--secondary" onClick={() => setAttempt(value => value + 1)}><RotateCw size={16} />Retry document</button></div> : null}
  </div>;
}
