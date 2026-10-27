import { PDFDocument } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { accountingStatus, followUpReason } from '../shared/accounting-status.ts';

const BASE = '/nutrientdemo';
const MAX_BYTES = 12 * 1024 * 1024;
const json = (value, status=200) => Response.json(value, {status, headers:{'Cache-Control':'no-store'}});
const fail = (status, message) => { throw Object.assign(new Error(message), {status}); };
const sha = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(v=>v.toString(16).padStart(2,'0')).join('');
const safeName = value => value.replace(/[^A-Za-z0-9._ -]/g,'_');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
async function readBounded(request, limit) {
  if (Number(request.headers.get('content-length')||0)>limit) fail(413,'Upload is too large. Maximum PDF size is 12 MB.');
  if (!request.body) return new Uint8Array();
  const reader=request.body.getReader(), chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail(413,'Request body is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}return bytes;
}

/** Hosted implementation of the same contracts, with strongly consistent R2 records. */
export function createNutrientHandler(catalog) {
  const originals=new Map(catalog.documents.map(doc=>[doc.record.id,doc]));
  return async function nutrient(request,env) {
    const url=new URL(request.url);
    if(url.pathname===BASE)return Response.redirect(url.origin+BASE+'/',308);
    if(!url.pathname.startsWith(BASE+'/api/'))return null;
    let cookie;
    try {
      if(!env.NUTRIENT_FILES)fail(503,'Demo storage is not connected.');
      const path=url.pathname.slice((BASE+'/api').length);
      const value=request.headers.get('cookie')?.match(/(?:^|;\s*)nutrient_demo_session=([^;]+)/)?.[1];
      let session=value&&uuid.test(value)?value:null;
      if(!session&&path==='/bootstrap'&&request.method==='GET'){
        session=crypto.randomUUID();cookie=`nutrient_demo_session=${session}; Path=${BASE}/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`;
      }
      if(path==='/health')return json({ok:true,service:'Ridgeline hosted demo',storage:'R2',sampleDate:catalog.sampleDate});
      if(!session)fail(401,'Open the presentation first to start your demo session.');
      if(!['GET','HEAD'].includes(request.method)){
        if(request.headers.get('origin')!==url.origin)fail(403,'Write requests must come from this demo.');
      }
      const bucket=env.NUTRIENT_FILES, prefix=`nutrient/sessions/${session}/`;
      const operationKey=operation=>prefix+'captures/'+operation+'.pdf';
      const listed=await bucket.list({prefix:prefix+'captures/',limit:101,include:['customMetadata']});
      const captures=listed.objects.map(item=>({key:item.key,...JSON.parse(item.customMetadata.record)}));
      const publicCapture=record=>({capture:record.capture,receipt:record.receipt});
      const shipment=id=>{
        const s=catalog.shipments.find(s=>s.id===id)||fail(404,'Shipment not found.');
        return {...s,documents:[...s.documents,...captures.filter(c=>c.capture.shipmentId===id).map(c=>c.capture)]};
      };
      const deduction=async id=>{
        const d=catalog.deductions.find(d=>d.id===id)||fail(404,'Deduction not found.');
        const saved=await bucket.get(prefix+'assessments/'+encodeURIComponent(id)+'.json');
        return {...d,assessment:saved?await saved.json():null,documents:[...d.documents,...captures.filter(c=>c.capture.shipmentId===d.shipmentId).map(c=>c.capture)]};
      };
      const document=id=>originals.get(id)||(()=>{const c=captures.find(c=>c.capture.id===id);return c?{record:c.capture,key:c.key,pages:c.pages,sourceDocumentId:c.sourceDocumentId,receipt:c.receipt}:fail(404,'Document not found.');})();
      const documentBytes=async doc=>{
        const response=doc.assetPath?await env.ASSETS.fetch(new Request(url.origin+doc.assetPath)):await bucket.get(doc.key);
        if(!response||response.status>=400)fail(503,'Stored document could not be read.');
        return new Uint8Array(await response.arrayBuffer());
      };
      let response;
      if(path==='/bootstrap'&&request.method==='GET'){
        response=json({sampleDate:catalog.sampleDate,shipments:catalog.shipments.map(s=>shipment(s.id)),deductions:await Promise.all(catalog.deductions.map(d=>deduction(d.id)))});
      } else if(/^\/shipments\/[^/]+$/.test(path)&&request.method==='GET') response=json(shipment(decodeURIComponent(path.split('/')[2])));
      else if(/^\/deductions\/[^/]+$/.test(path)&&request.method==='GET') response=json(await deduction(decodeURIComponent(path.split('/')[2])));
      else if(/^\/documents\/[^/]+$/.test(path)&&['GET','HEAD'].includes(request.method)){
        const doc=document(decodeURIComponent(path.split('/')[2]));
        let body;
        if(doc.assetPath){const source=await env.ASSETS.fetch(new Request(url.origin+doc.assetPath,{method:request.method,headers:request.headers}));if(!source.ok)fail(503,'Source PDF is unavailable.');body=source.body;response=new Response(body,source);}
        else {const object=await bucket.get(doc.key,{range:request.headers});if(!object)fail(404,'Stored PDF not found.');const headers=new Headers({'Content-Length':String(object.range?.length||object.size),'ETag':object.httpEtag,'Accept-Ranges':'bytes'});if(object.range)headers.set('Content-Range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);response=new Response(request.method==='HEAD'?null:object.body,{status:object.range?206:200,headers});}
        response.headers.set('Content-Type','application/pdf');response.headers.set('Content-Disposition',`inline; filename="${safeName(doc.record.name)}"`);response.headers.set('Cache-Control',doc.assetPath?'public, max-age=86400':'private, no-store');
      } else if(/^\/shipments\/[^/]+\/captures$/.test(path)&&request.method==='POST'){
        const s=shipment(decodeURIComponent(path.split('/')[2]));const operation=request.headers.get('x-operation-id')||'',sourceId=request.headers.get('x-source-document-id')||'';
        if(!/^[A-Za-z0-9_-]{1,128}$/.test(operation))fail(400,'A stable X-Operation-Id is required.');
        const source=originals.get(sourceId);if(!source||source.record.shipmentId!==s.id||source.record.kind!=='bol')fail(409,'Source document must be this shipment’s original unsigned BOL.');
        if(!request.headers.get('content-type')?.startsWith('application/pdf'))fail(415,'Capture must use application/pdf.');
        const bytes=await readBounded(request,MAX_BYTES),text=new TextDecoder();
        if(bytes.length<100||text.decode(bytes.slice(0,5))!=='%PDF-'||!text.decode(bytes.slice(-2048)).includes('%%EOF'))fail(400,'Capture is not a complete PDF.');
        const hash=await sha(bytes);
        const verify=previous=>{if(previous.capture.shipmentId!==s.id||previous.sourceDocumentId!==sourceId||previous.receipt.sha256!==hash)fail(409,'Operation ID is already used for a different capture. Retry the original bytes with the same source.');return json(publicCapture(previous));};
        const previous=await bucket.head(operationKey(operation));if(previous)return verify(JSON.parse(previous.customMetadata.record));
        if(captures.length>=50||listed.truncated)fail(429,'This demo session has reached its capture allowance.');
        for(const doc of originals.values())if(doc.record.sha256===hash&&doc.record.id!==sourceId)fail(409,'Uploaded bytes belong to a different supplied document.');
        let pages;try{pages=(await PDFDocument.load(bytes,{updateMetadata:false})).getPageCount();}catch{fail(400,'Capture PDF could not be opened.');}
        if(pages!==source.pages)fail(400,'Capture page count differs from the source BOL.');
        const id=crypto.randomUUID(),at=new Date().toISOString();
        const saved={sourceDocumentId:sourceId,pages,capture:{id:'demo-'+id,shipmentId:s.id,kind:'demo-pickup',name:`Demo pickup - ${s.id} - ${at.slice(0,10)}.pdf`,url:`${BASE}/api/documents/demo-${id}`,createdAt:at,sha256:hash,captureId:id},receipt:{id,receivedAt:at,sha256:hash,bytes:bytes.length,operationId:operation}};
        // The PDF, receipt and operation identity commit atomically as one R2 object.
        const stored=await bucket.put(operationKey(operation),bytes,{onlyIf:new Headers({'If-None-Match':'*'}),httpMetadata:{contentType:'application/pdf'},customMetadata:{record:JSON.stringify(saved)},sha256:Uint8Array.from(hash.match(/../g),pair=>parseInt(pair,16)).buffer});
        if(!stored){const winner=await bucket.head(operationKey(operation));if(!winner)fail(503,'Receipt could not be confirmed. Retry this operation.');return verify(JSON.parse(winner.customMetadata.record));}
        response=json(publicCapture(saved),201);
      } else if(/^\/deductions\/[^/]+\/assessment$/.test(path)&&request.method==='PUT'){
        const d=await deduction(decodeURIComponent(path.split('/')[2]));let data;try{data=JSON.parse(new TextDecoder().decode(await readBounded(request,16*1024)));}catch(e){if(e.status)throw e;fail(400,'Assessment body must be JSON.');}
        if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'Assessment body must be a JSON object.');
        if(!['ready','needs-evidence','investigate'].includes(data.status))fail(400,'Choose a valid assessment status.');
        if(typeof data.note!=='string'||!data.note.trim()||data.note.length>4000)fail(400,'Add a reviewer note between 1 and 4000 characters.');
        const assessment={deductionId:d.id,status:data.status,note:data.note.trim(),updatedAt:new Date().toISOString()};
        if(data.sourceDocumentId){if(typeof data.sourceDocumentId!=='string'||!d.documents.some(doc=>doc.id===data.sourceDocumentId))fail(400,'Assessment source must belong to this deduction’s shipment.');const source=document(data.sourceDocumentId),page=data.pageNumber??1;if(!Number.isInteger(page)||page<1||page>source.pages)fail(400,'Assessment page is outside the source document.');assessment.sourceDocumentId=data.sourceDocumentId;assessment.pageNumber=page;}
        else if(data.pageNumber!==undefined&&data.pageNumber!==null)fail(400,'A page citation requires a source document.');
        await bucket.put(prefix+'assessments/'+encodeURIComponent(d.id)+'.json',JSON.stringify(assessment),{httpMetadata:{contentType:'application/json'}});response=json(assessment);
      } else if(/^\/deductions\/[^/]+\/packet$/.test(path)&&request.method==='GET'){
        const d=await deduction(decodeURIComponent(path.split('/')[2])),generatedAt=new Date().toISOString(),entries={},documents=[];
        for(const record of d.documents){const doc=document(record.id),bytes=await documentBytes(doc),hash=await sha(bytes);if(hash!==record.sha256)fail(503,'Document integrity check failed.');const archivePath=(record.kind==='demo-pickup'?'demo-pickup/':'original-evidence/')+safeName(record.name);entries[archivePath]=bytes;documents.push({...record,archivePath,bytes:bytes.length,sha256:hash,pages:doc.pages,provenance:record.kind==='demo-pickup'?'new-demo-pickup':'supplied-original',...(doc.sourceDocumentId?{sourceDocumentId:doc.sourceDocumentId,receipt:doc.receipt}:{})});}
        const limitations=['Synthetic Ridgeline hiring-exercise sample, historical data as of 2026-10-01.','Prepared for human review; not a submitted or accepted retailer dispute.','A historical scan file does not establish delivery or disputed quantities.','New demo pickups do not establish historical pickup or consignee delivery.','Hashes track file versions; they do not authenticate signers or provide certificate-backed integrity.'];
        const status=accountingStatus(d.assessment),reason=d.assessment?followUpReason(d.assessment.status):undefined;
        const manifest={formatVersion:1,generatedAt,sampleDate:catalog.sampleDate,deduction:d,limitations,caseStatus:{value:status.value,label:status.label,...(reason?{followUpReason:reason}:{})},documents};
        const summary=['RIDGELINE · DEDUCTION REVIEW PACKET',`Prepared: ${generatedAt}`,`Historical sample date: ${catalog.sampleDate}`,`Deduction: ${d.id}`,`Shipment: ${d.shipmentId}`,`Invoice: ${d.invoiceNo}`,`Customer PO: ${d.customerPo}`,`Reason: ${d.reasonText}`,`Amount USD: ${d.amountUsd.toFixed(2)}`,`Historical evidence state: ${d.evidenceState}`,'','MATCH / EVIDENCE WARNINGS',...d.matchWarnings,'','HUMAN ASSESSMENT',`Status: ${status.label}`,...(reason?[`Follow-up reason: ${reason}`]:[]),`Note: ${d.assessment?.note||'Not reviewed'}`,`Source: ${d.assessment?.sourceDocumentId||'None cited'}`,`Page: ${d.assessment?.pageNumber||'None cited'}`,'','INCLUDED DOCUMENTS',...documents.map(doc=>`${doc.archivePath} [${doc.provenance}]`),'','LIMITATIONS',...limitations].join('\n');
        entries['summary.txt']=strToU8(summary);entries['manifest.json']=strToU8(JSON.stringify(manifest,null,2));response=new Response(zipSync(entries,{level:0}),{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${safeName(d.id)}-review-packet.zip"`,'Cache-Control':'private, no-store'}});
      } else response=json({error:'API route not found.'},404);
      if(cookie)response.headers.set('Set-Cookie',cookie);
      return response;
    } catch(error) {return json({error:error.status?error.message:'Demo service could not complete this operation.'},error.status||500);}
  };
}
