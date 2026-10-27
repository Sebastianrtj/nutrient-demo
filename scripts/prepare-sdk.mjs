import { cp, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
const source = path.resolve('node_modules/@nutrient-sdk/viewer/dist/nutrient-viewer-lib');
const target = path.resolve('public/nutrient-viewer-lib');
try { await access(source); } catch { console.log('SDK assets not installed yet.'); process.exit(0); }
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
console.log('Nutrient runtime assets ready.');
