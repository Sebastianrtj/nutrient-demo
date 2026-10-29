import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPdfSource } from './pdf-source.ts';

test('loads session-protected PDF bytes through the app fetch', async t => {
  const bytes = new TextEncoder().encode('%PDF-1.4\nsynthetic test');
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    if (init.credentials !== 'same-origin') return new Response('Session required', { status: 401 });
    return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } });
  });
  assert.deepEqual(new Uint8Array(await loadPdfSource('/api/documents/example')), bytes);
});

test('reports an expired session instead of trying to parse the error as PDF', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Session required' }, { status: 401 }));
  await assert.rejects(loadPdfSource('/api/documents/example'), /session has expired/);
});

test('rejects an HTML fallback served with HTTP 200', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<!doctype html><title>Fallback</title>'));
  await assert.rejects(loadPdfSource('/api/documents/example'), /did not return a PDF/);
});

test('a cancelled source cannot become the active PDF', async t => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort();
    return new Response('%PDF-1.4');
  });
  await assert.rejects(loadPdfSource('/api/documents/example', controller.signal), { name: 'AbortError' });
});
