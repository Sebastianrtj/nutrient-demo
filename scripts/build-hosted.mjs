import { spawnSync } from 'node:child_process';
import { mkdir, writeFile, copyFile, readdir, stat } from 'node:fs/promises';
import { loadCatalog,DEFAULT_SOURCE_ROOT,SAMPLE_DATE } from '../server/catalog.ts';
import { build } from 'esbuild';
for(const args of [['./node_modules/typescript/bin/tsc','--noEmit'],['./node_modules/vite/bin/vite.js','build']]){
 const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,DEMO_BASE_PATH:'/nutrientdemo/'}});if(result.status!==0)process.exit(result.status||1);
}
const catalog=loadCatalog(DEFAULT_SOURCE_ROOT);await mkdir('dist/_samples',{recursive:true});
const documents=[];
for(const [id,doc] of catalog.documents){const assetPath=`/nutrientdemo/_samples/${id}.pdf`;await copyFile(doc.path,`dist/_samples/${id}.pdf`);documents.push({record:{...doc.record,url:'/nutrientdemo'+doc.record.url},pages:doc.pages,warnings:doc.warnings,assetPath});}
const fix=doc=>({...doc,url:'/nutrientdemo'+doc.url});
const data={sampleDate:SAMPLE_DATE,shipments:catalog.shipments.map(s=>({...s,documents:s.documents.map(fix)})),deductions:catalog.deductions.map(d=>({...d,documents:d.documents.map(fix)})),documents};
await writeFile('worker/catalog.json',JSON.stringify(data));
// Cloudflare static assets have a 25MiB per-file limit. Stream unchanged large
// runtime files from bounded pieces without omitting any SDK component.
const largeAssets={};
async function split(directory){for(const item of await readdir(directory,{withFileTypes:true})){const path=directory+'/'+item.name;if(item.isDirectory())await split(path);else{const info=await stat(path);if(info.size>24*1024*1024){const {readFile,unlink}=await import('node:fs/promises');const bytes=await readFile(path),parts=[];for(let at=0,n=0;at<bytes.length;at+=20*1024*1024,n++){const part=path+`.part${n}`;await writeFile(part,bytes.subarray(at,Math.min(at+20*1024*1024,bytes.length)));parts.push('/nutrientdemo/'+part.replace(/^dist\//,''));}largeAssets['/nutrientdemo/'+path.replace(/^dist\//,'')]={parts,size:bytes.length};await unlink(path);}else if(item.name.endsWith('.mp4')){const asset='/nutrientdemo/'+path.replace(/^dist\//,'');largeAssets[asset]={parts:[asset],size:info.size,partSize:info.size};}}}}
await split('dist');await writeFile('worker/large-assets.json',JSON.stringify(largeAssets));
await build({entryPoints:['worker/index.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'.site-output/nutrient-worker.mjs',minify:true});
await build({entryPoints:['worker/index.mjs'],bundle:true,format:'iife',globalName:'NutrientDemoWorker',platform:'browser',target:'es2022',outfile:'.site-output/nutrient-worker.bundle.js',minify:true});
console.log('Hosted demo built, including',documents.length,'registered synthetic documents.');
