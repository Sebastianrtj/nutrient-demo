/** Fetch in the app's origin so session-protected PDFs do not rely on worker fetches. */
export async function loadPdfSource(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'same-origin', signal });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your demo session has expired. Reload the page to reopen the document.');
    throw new Error(`The PDF could not be downloaded (${response.status}). Retry document.`);
  }
  const bytes = await response.arrayBuffer();
  signal?.throwIfAborted();
  // Error pages and expired-session JSON must never be handed to the PDF engine.
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('The document service did not return a PDF. Retry document.');
  }
  return bytes;
}
