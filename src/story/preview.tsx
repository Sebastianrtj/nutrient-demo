import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import Story from './Story';

function Preview() {
  const [lastAction, setLastAction] = useState('');
  const frameWidth = Number(new URLSearchParams(window.location.search).get('width'));
  if (frameWidth >= 320 && frameWidth <= 1024) {
    return <iframe title={`Story at ${frameWidth} pixels`} src="/src/story/preview.html" style={{ display: 'block', width: frameWidth, height: 1100, border: 0, margin: '0 auto', background: '#f3f2ee' }} />;
  }
  // Changing the key simulates returning after the integrated app unmounts Story.
  return <><Story key={lastAction} onDock={() => setLastAction('Dock callback fired')} onAccounting={() => setLastAction('Accounting callback fired')} />{lastAction && <p role="status" style={{ margin: '0 36px 20px', font: '12px system-ui', color: '#225e65' }}>{lastAction} · Isolated development preview</p>}</>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
