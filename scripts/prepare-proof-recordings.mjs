import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(app, 'src/story/proof-recordings.json');
const contents = await fs.readFile(source, 'utf8');
const { recordings } = JSON.parse(contents);
const expected = ['discovery', 'documents', 'flows', 'recovery', 'demo', 'productization', 'walkthrough'];
if (!Array.isArray(recordings) || recordings.length !== expected.length || new Set(recordings.map(item => item.id)).size !== expected.length) throw new Error('Expected seven distinct proof recordings.');
for (const item of recordings) {
  if (!expected.includes(item.id) || !/^[a-z0-9-]+\.mp4$/.test(item.src) || !(item.durationSeconds > 0)) throw new Error(`Incomplete proof recording: ${item.id}`);
  const stat = await fs.stat(path.join(app, 'public/proof', item.src));
  if (!stat.isFile() || stat.size === 0) throw new Error(`Missing proof recording: ${item.src}`);
  if (!/^[a-z0-9-]+\.jpg$/.test(item.poster)) throw new Error(`Invalid recording poster: ${item.id}`);
  const poster = await fs.stat(path.join(app, 'public/proof', item.poster));
  if (!poster.isFile() || poster.size === 0) throw new Error(`Missing recording poster: ${item.poster}`);
}
await fs.copyFile(source, path.join(app, 'public/proof/recordings.json'));
console.log('Prepared seven proof recordings and their fallback-player manifest.');
