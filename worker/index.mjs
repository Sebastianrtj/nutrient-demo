import catalog from './catalog.json' with {type:'json'};
import largeAssets from './large-assets.json' with {type:'json'};
import { createNutrientHandler } from './handler.mjs';

export const handleNutrient = createNutrientHandler(catalog);
const PART_SIZE = 20 * 1024 * 1024;
const contentType = path => path.endsWith('.mp4') ? 'video/mp4' : path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.gif') ? 'image/gif' : 'application/octet-stream';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), large = largeAssets[url.pathname];
    if (!large) return await handleNutrient(request, env, ctx) || env.ASSETS.fetch(request);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status:405, headers:{Allow:'GET, HEAD'}});
    let start = 0, end = large.size - 1, status = 200;
    const invalidRange = () => new Response(null, {status:416, headers:{'Content-Range':`bytes */${large.size}`}});
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return invalidRange();
      if (!match[1]) {
        const suffix = Number(match[2]);
        if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalidRange();
        start = Math.max(0, large.size - suffix);
      } else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= large.size) return invalidRange();
      status = 206;
    }
    const headers = {'Content-Type':contentType(url.pathname), 'Content-Length':String(end-start+1), 'Accept-Ranges':'bytes', 'Cache-Control':'public, max-age=86400'};
    if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${large.size}`;
    if (request.method === 'HEAD') return new Response(null, {status, headers});
    let index = Math.floor(start/PART_SIZE), reader, partStart = 0, partOffset = 0;
    // ASSETS bindings need not honor Range. Slice the streamed bytes ourselves,
    // keeping memory bounded and cancelling a part once the requested range ends.
    const stream = new ReadableStream({
      async pull(controller) {
        try {
          while (true) {
            if (!reader) {
              if (index >= large.parts.length || index*PART_SIZE > end) { controller.close(); return; }
              partStart = index*PART_SIZE; partOffset = 0;
              const response = await env.ASSETS.fetch(new Request(url.origin + large.parts[index++]));
              if (!response.ok || !response.body) throw new Error('Runtime asset part unavailable');
              reader = response.body.getReader();
            }
            const {value, done} = await reader.read();
            if (done) { reader = null; continue; }
            const offset = partStart + partOffset;
            partOffset += value.byteLength;
            const from = Math.max(0, start-offset), to = Math.min(value.byteLength, end-offset+1);
            if (to > from) controller.enqueue(value.subarray(from, to));
            if (offset+value.byteLength > end) { await reader.cancel(); reader=null; controller.close(); return; }
            if (to > from) return;
          }
        } catch (error) { controller.error(error); }
      },
      async cancel() { await reader?.cancel(); }
    });
    return new Response(stream, {status, headers});
  }
};
