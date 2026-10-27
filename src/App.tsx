import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { installMotionTokens, reduced } from './lib/motion';
import { useGlider } from './lib/motion-hooks';
import { ArrowLeft, ArrowUpRight, Mountain, RefreshCw } from 'lucide-react';
import type { Assessment, Bootstrap, CaptureResult } from '../shared/contracts';
import { api } from './api';
import { Notice, Status } from './ui';
import Dock, { ShipmentList } from './components/Dock';
import Accounting from './components/Accounting';
import Story from './story/Presentation';

type Route = { view: 'dock' | 'accounting' | 'present'; id?: string; documentId?: string };
function readRoute(): Route {
  const [routePath, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = routePath.split('/');
  if (parts[0] === 'accounting') return { view: 'accounting', id: parts[1] ? decodeURIComponent(parts[1]) : undefined, documentId: new URLSearchParams(query).get('document') || undefined };
  if (!parts[0] || parts[0] === 'present') return { view: 'present' };
  return { view: 'dock', id: parts[0] === 'dock' ? parts[1] ? decodeURIComponent(parts[1]) : undefined : 'RS-417652' };
}
function navigate(route: Route) { location.hash = `/${route.view}${route.id ? `/${encodeURIComponent(route.id)}` : ''}${route.documentId ? `?document=${encodeURIComponent(route.documentId)}` : ''}`; }

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [shipmentQuery, setShipmentQuery] = useState('');
  const previousRoute = useRef(route);
  const [returningId, setReturningId] = useState<string>();
  const nav = useRef<HTMLElement>(null), navRule = useRef<HTMLSpanElement>(null);
  useGlider(navRule, () => nav.current?.querySelector('[aria-current=page]'), [route.view], { keepY: true, instant: Boolean(document.documentElement.dataset.nav) });
  useEffect(() => { installMotionTokens(); }, []);
  useEffect(() => { if (!returningId) return; const timer = setTimeout(() => setReturningId(undefined), 1600); return () => clearTimeout(timer); }, [returningId]);
  const queueScroll = useRef<Record<string, number>>({});
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await api.bootstrap()); } catch (reason) { setError(reason instanceof Error ? reason.message : 'The source records could not load.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let activeTransition: ViewTransition | undefined;
    function changed() {
      const previous = previousRoute.current;
      if (!previous.id) queueScroll.current[previous.view] = window.scrollY;
      const next = readRoute(); previousRoute.current = next;
      const kind = previous.view === 'present' || next.view === 'present' ? null : previous.view !== next.view ? previous.id && next.id ? 'record' : 'nav' : !previous.id && next.id ? 'push' : previous.id && !next.id ? 'pop' : null;
      setReturningId(kind === 'pop' ? previous.id : undefined);
      const scroll = () => window.scrollTo({ top: next.id ? 0 : queueScroll.current[next.view] || 0, behavior: 'instant' });
      if (kind && !reduced() && document.startViewTransition) {
        activeTransition?.skipTransition();
        const html = document.documentElement; html.dataset.nav = kind; html.dataset.dir = kind === 'pop' || (kind !== 'push' && next.view === 'dock') ? 'back' : 'forward';
        const transition = document.startViewTransition(() => { if (previousRoute.current !== next) return; flushSync(() => setRoute(next)); scroll(); });
        activeTransition = transition;
        void transition.finished.catch(() => undefined).then(() => { if (activeTransition === transition) { delete html.dataset.nav; delete html.dataset.dir; activeTransition = undefined; } });
      } else { activeTransition?.skipTransition(); setRoute(next); requestAnimationFrame(scroll); }
    }
    window.addEventListener('hashchange', changed); return () => { window.removeEventListener('hashchange', changed); activeTransition?.skipTransition(); };
  }, []);
  useEffect(() => { document.title = `${route.view === 'accounting' ? 'Accounting' : route.view === 'present' ? 'The record journey' : 'Dock'}${route.id ? ` · ${route.id}` : ''} · Ridgeline`; }, [route]);
  const captured = useCallback((id: string, result: CaptureResult) => {
    setData(current => current ? {
      ...current,
      shipments: current.shipments.map(item => item.id === id ? { ...item, documents: [...item.documents.filter(doc => doc.id !== result.capture.id), result.capture] } : item),
      deductions: current.deductions.map(item => item.shipmentId === id ? { ...item, documents: [...item.documents.filter(doc => doc.id !== result.capture.id), result.capture] } : item),
    } : current);
  }, []);
  const assessed = useCallback((assessment: Assessment) => { setData(current => current ? { ...current, deductions: current.deductions.map(item => item.id === assessment.deductionId ? { ...item, assessment } : item) } : current); }, []);
  function openAccounting(shipmentId?: string, documentId?: string) {
    const match = data?.deductions.find(item => item.shipmentId === (shipmentId || 'RS-417652'));
    navigate({ view: 'accounting', id: match?.id, documentId: match ? documentId : undefined });
  }
  const shipment = data?.shipments.find(item => item.id === route.id);
  return <div className={`app-shell ${route.view === 'present' ? 'app-shell--present' : ''} ${route.view === 'accounting' && route.id ? 'app-shell--accounting-case' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to workspace</a>
    <header className="app-header"><a className="brand" href="#/dock" aria-label="Ridgeline shipments"><Mountain size={25} strokeWidth={1.7} aria-hidden="true" /><span>RIDGELINE</span></a><nav ref={nav} className="main-nav" aria-label="Workspaces"><span ref={navRule} className="nav-rule" aria-hidden="true" /><a className={route.view === 'dock' ? 'nav-link nav-link--active' : 'nav-link'} href="#/dock" aria-current={route.view === 'dock' ? 'page' : undefined}>Dock</a><a className={route.view === 'accounting' ? 'nav-link nav-link--active' : 'nav-link'} href="#/accounting" aria-current={route.view === 'accounting' ? 'page' : undefined}>Accounting</a></nav><a className={`present-link ${route.view === 'present' ? 'present-link--active' : ''}`} href="#/present">Present<ArrowUpRight size={15} /></a><span className="header-proof">Demo proof</span></header>
    <div id="main-content" tabIndex={-1} className="app-content">
      {loading && !data ? <main className="workspace"><div className="empty-state"><Status busy>Opening shipment records</Status></div></main> : error && !data ? <main className="workspace"><div className="empty-state"><h1>Records could not load</h1><Notice tone="error">{error}</Notice><button className="button button--primary" onClick={() => void load()}><RefreshCw size={16} />Retry records</button></div></main> : data ? route.view === 'present' ? <Story data={data} onCaptured={captured} onAssessment={assessed} /> : route.view === 'accounting' ? <Accounting deductions={data.deductions} shipments={data.shipments} sampleDate={data.sampleDate} id={route.id} documentId={route.documentId} onAssessment={assessed} /> : route.id ? shipment ? <Dock key={shipment.id} shipment={shipment} onCaptured={captured} onAccounting={openAccounting} /> : <main className="workspace"><div className="empty-state"><h1>Shipment not found</h1><p>Choose a shipment from the supplied source pack.</p><a className="button button--secondary" href="#/dock"><ArrowLeft size={16} />All shipments</a></div></main> : <ShipmentList returningId={returningId} shipments={data.shipments} query={shipmentQuery} setQuery={setShipmentQuery} /> : null}
    </div>
    {route.view !== 'present' && <footer className="app-footer"><span>Ridgeline proof <span className="footer-dot">·</span> Synthetic samples</span><span>Proposed identity <span className="footer-dot">·</span> Demo service <span className="footer-dot">·</span> Nutrient evaluation</span></footer>}
  </div>;
}
