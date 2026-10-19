import test from 'node:test';
import assert from 'node:assert/strict';
import {buildKitchenBackup,bytesHash,backupHash,validateKitchenBackup} from '../src/data/backup.ts';
import {completeFixture} from './task4-complete-fixture.mjs';
async function completeSource(){const state=completeFixture(),workspaceId='11111111-2222-4333-8444-555555555555',rawState=JSON.stringify(state),rawStateSha256=await bytesHash(new TextEncoder().encode(rawState));return {authorize:async()=>true,validateState:async()=>{},read:async()=>({state,environment:'test',workspaceId,settings:{},documents:[],drafts:[],operationReceipts:[],documentManifest:[],workspaceEvidence:{rawState,rawStateSha256,rawRow:{zk_state:rawState,zk_revision:state.revision,zk_kitchenworkspaceid:workspaceId},rowVersion:'1',ownerId:'owner',ownerType:'systemuser',protocolVersion:2}})};}
test('document contract requires inventories even when they are actually empty',async()=>{const source=await completeSource();const original=source.read;source.read=async()=>({...await original(),sourceContract:{id:'kitchen-documents-v1',documents:'required',drafts:'required',manifestVersion:1},documents:[],drafts:[]});const result=await buildKitchenBackup(source);assert.equal(result.complete,true);source.read=async()=>({...await original(),sourceContract:{id:'kitchen-documents-v1',documents:'required',drafts:'required',manifestVersion:1},documents:null,drafts:[]});assert.equal((await buildKitchenBackup(source)).complete,false);});
async function documentSource(){
 const source=await completeSource(),base=await source.read(),bytes=Uint8Array.of(1,2,3),hash=await bytesHash(bytes),documentId='11111111-1111-4111-8111-111111111111',actor='cccccccc-1111-4111-8111-111111111111';
 const ref={provider:'sharepoint',siteCollectionId:'f8177aa4-4ba3-4ba1-8c26-5ed32d5b2923',webId:'c24ab669-3ca6-4530-aabf-6f42f8343ae7',libraryId:'9e71defe-f678-4c0c-b69c-45e4370a735a',itemId:'1',version:'etag-1',connectorIdentifier:'path-id',webUrl:'https://schelmenzunft.sharepoint.com/sites/SchelmenzunftStaufenTraditionszunftderStaufenerStubengesells/Shared Documents/General/Zunftküche/Rechnungen/receipt-'+documentId+'.jpg',sha256:hash,mimeType:'image/jpeg',size:3,originalName:'original.jpg'};
 function row(value,action,table){const history=[{requestId:crypto.randomUUID(),requestHash:'a'.repeat(64),actorId:actor,recordedAt:'2026-10-19T12:00:00.000Z',action,value:structuredClone(value)}];const payload={...value,history};return {...payload,rowVersion:'1',rawRow:{'@rowVersion':'1','@formattedValues':{},zk_actor:actor,zk_recordedat:history[0].recordedAt,zk_payload:JSON.stringify(payload),zk_eventid:base.state.event.id,zk_workspace:{logicalName:'zk_kitchenworkspace',id:base.workspaceId,name:null,rowVersion:null},[table+'id']:value.id}};}
 const doc=row({id:documentId,uploadId:documentId,eventId:base.state.event.id,workspaceId:base.workspaceId,principal:'editor@example.test',status:'linked',sha256:hash,mimeType:'image/jpeg',size:3,originalName:'original.jpg',ref},'upload.link','zk_kitchendocument');
 const draft=row({schemaVersion:1,id:'22222222-1111-4111-8111-111111111111',eventId:base.state.event.id,workspaceId:base.workspaceId,source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,reviewStatus:'editing',pages:[{documentId,documentRowVersion:'1',version:'etag-1',sha256:hash,originalReviewed:false}],header:{supplierId:'',number:'x',date:'',scope:'',grossCents:null},lines:[]},'draft.save','zk_kitchendraft');
 const value={...base,sourceContract:{id:'kitchen-documents-v1',documents:'required',drafts:'required',manifestVersion:1},documents:[doc],drafts:[draft],documentManifest:[{id:documentId,itemId:'1',version:'etag-1',sha256:hash,bytesBase64:Buffer.from(bytes).toString('base64')}]};source.read=async()=>structuredClone(value);return {source,value};
}
test('full document/draft/byte relationships survive separate local restore and missing bytes stay incomplete',async()=>{
 const {source,value}=await documentSource();const packet=await buildKitchenBackup(source);assert.equal(packet.complete,true);
 const {restoreLocalTest}=await import('../tools/backup-restore/restore.ts');const {mkdtemp,readFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const directory=join(await mkdtemp(join(tmpdir(),'kitchen-doc-restore-')),'target');await restoreLocalTest(packet,{kind:'isolated-local-test',directory,authorized:true});assert.deepEqual([...await readFile(join(directory,'original-0.bin'))],[1,2,3]);const restored=JSON.parse(await readFile(join(directory,'backup.json'),'utf8'));assert.equal(restored.drafts[0].pages[0].documentId,restored.documents[0].id);
 delete value.documentManifest[0].bytesBase64;assert.equal((await buildKitchenBackup(source)).complete,false);
});
test('correctly rehashed raw draft with invalid money/provenance still rejects',async()=>{
 const {source,value}=await documentSource();const draft=value.drafts[0];draft.header.grossCents='wrong';draft.history[0].value.header.grossCents='wrong';const {rowVersion,rawRow,...payload}=draft;rawRow.zk_payload=JSON.stringify(payload);await assert.rejects(()=>buildKitchenBackup(source),/Entwurf|Geld/);
});

async function rehash(packet) {const {payloadHash,...payload}=packet;packet.payloadHash=await backupHash(payload);return packet;}
async function rejectedBeforeRestore(packet) {
 const {restoreLocalTest}=await import('../tools/backup-restore/restore.ts');
 const {mkdtemp,access}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const directory=join(await mkdtemp(join(tmpdir(),'kitchen-doc-negative-')),'must-not-exist');
 await assert.rejects(()=>validateKitchenBackup(packet,async()=>{}));
 await assert.rejects(()=>restoreLocalTest(packet,{kind:'isolated-local-test',directory,authorized:true}));
 await assert.rejects(()=>access(directory),{code:'ENOENT'});
}
for(const table of ['documents','drafts'])for(const mutation of ['id','workspace','missing-workspace','workspace-type','event','actor','time','missing-audit']) {
 test(`rehashed ${table} native ${mutation} contradiction rejects import and restore before writes`,async()=>{
  const {source,value}=await documentSource();const packet=await buildKitchenBackup(source);
  const raw=packet[table][0].rawRow;
  if(mutation==='id')raw[table==='documents'?'zk_kitchendocumentid':'zk_kitchendraftid']=crypto.randomUUID();
  if(mutation==='workspace')raw.zk_workspace.id=crypto.randomUUID();
  if(mutation==='missing-workspace')delete raw.zk_workspace;
  if(mutation==='workspace-type')raw.zk_workspace.logicalName='team';
  if(mutation==='event')raw.zk_eventid='other-event';
  if(mutation==='actor')raw.zk_actor=crypto.randomUUID();
  if(mutation==='time')raw.zk_recordedat='2026-10-18T00:00:00.000Z';
  if(mutation==='missing-audit')delete raw.zk_actor;
  value[table][0].rawRow=structuredClone(raw);
  await assert.rejects(()=>buildKitchenBackup(source));
  await rejectedBeforeRestore(await rehash(packet));
 });
}
function earlierPage(packet,change) {
 const draft=packet.drafts[0],historical=structuredClone(draft.history[0]);
 historical.requestId=crypto.randomUUID();historical.recordedAt='2026-10-19T11:00:00.000Z';
 change(historical.value.pages[0]);draft.history.unshift(historical);
 const {rawRow,rowVersion,...payload}=draft;rawRow.zk_payload=JSON.stringify(payload);
}
test('rehashed historical draft with absent original rejects import and restore',async()=>{
 const {source,value}=await documentSource();const packet=await buildKitchenBackup(source);
 earlierPage(packet,page=>page.documentId=crypto.randomUUID());
 value.drafts=structuredClone(packet.drafts);await assert.rejects(()=>buildKitchenBackup(source));
 await rejectedBeforeRestore(await rehash(packet));
});
test('unknown historical row version or original version never claims complete',async()=>{
 for(const field of ['documentRowVersion','version']) {
  const {source,value}=await documentSource();earlierPage(value,page=>page[field]='unproved-older-version');
  const packet=await buildKitchenBackup(source);assert.equal(packet.complete,false);assert.ok(packet.missing.some(text=>/historisch/i.test(text)));
  assert.equal((await validateKitchenBackup(packet,async()=>{})).complete,false);
  const forged=structuredClone(packet);forged.complete=true;forged.missing=[];await rejectedBeforeRestore(await rehash(forged));
 }
});
test('unchanged source in an earlier draft snapshot remains complete with actual current evidence',async()=>{
 const {source,value}=await documentSource();earlierPage(value,()=>{});
 assert.equal((await buildKitchenBackup(source)).complete,true);
});
test('historical document reference needs its own exact manifest even when current pages no longer use it',async()=>{
 const {source,value}=await documentSource(),doc=value.documents[0];
 const historical=structuredClone(doc.history[0]);historical.requestId=crypto.randomUUID();historical.recordedAt='2026-10-19T11:00:00.000Z';
 historical.value.ref.version='old-external-version';doc.history.unshift(historical);
 const {rawRow,rowVersion,...payload}=doc;rawRow.zk_payload=JSON.stringify(payload);
 const packet=await buildKitchenBackup(source);assert.equal(packet.complete,false);
 assert.ok(packet.missing.some(text=>text.includes('historisch versioniertes Original fehlt')));
 assert.equal((await validateKitchenBackup(packet,async()=>{})).complete,false);
 const forged=structuredClone(packet);forged.complete=true;forged.missing=[];await rejectedBeforeRestore(await rehash(forged));
});
async function acceptedSource(){
 const {source,value}=await documentSource(),d=value.drafts[0],actor=d.history[0].actorId,operationId='66666666-1111-4111-8111-111111111111',hash='b'.repeat(64),time='2026-10-19T13:00:00.000Z';
 d.header={supplierId:value.state.suppliers[0].id,number:'SYNTHETIC-ACCEPTED',date:'2026-10-19',scope:'Küche',grossCents:1234};d.pages[0].originalReviewed=true;d.reviewStatus='accepted';
 const fields={header:structuredClone(d.header),lines:[],raw:{total:'12,34',lines:{}}},decisions={receipt:true,fields:true,originals:true,prices:'separate',stock:'separate'};
 d.acceptance={operationId,receiptId:d.id,requestHash:hash,appliedRevision:1,actorId:actor,recordedAt:time,reviewedFields:fields,reviewDecisions:decisions,documentVersion:structuredClone(d.pages)};
 const {rowVersion,rawRow,history,...snapshot}=d;d.history.push({requestId:operationId,requestHash:hash,actorId:actor,recordedAt:time,action:'receipt.draft.accept',value:structuredClone(snapshot)});rawRow.zk_payload=JSON.stringify({...snapshot,history:d.history});rawRow.zk_actor=actor;rawRow.zk_recordedat=time;
 const invoice={id:d.id,...d.header,status:'Erfasst',netCents:null,documentUrl:value.documents[0].ref.webUrl,lines:[],intake:{draftId:d.id,operationId}};invoice.sourceBaseline=structuredClone(invoice);value.state.invoices.push(invoice);
 const payload={eventId:d.eventId,expectedWorkspaceRevision:0,draftId:d.id,draftRowVersion:'1',documentVersion:d.pages,reviewedFields:fields,reviewDecisions:decisions,operationId};
 value.state.revision=1;value.state.operationIds=[operationId];value.state.operationRequests={[operationId]:JSON.stringify({type:'receipt.draft.accept',payload,targetEventId:d.eventId})};
 const r={id:crypto.randomUUID(),workspaceId:value.workspaceId,operationId,requestHash:hash,actorId:actor,appliedRevision:1,recordedAt:time,rowVersion:'1'};r.rawRow={zk_kitchenoperationid:r.id,_zk_workspace_value:r.workspaceId,zk_operationid:operationId,zk_requesthash:hash,zk_actor:actor,zk_appliedrevision:1,zk_recordedat:time};value.operationReceipts=[r];
 value.workspaceEvidence.rawState=JSON.stringify(value.state);value.workspaceEvidence.rawStateSha256=await bytesHash(new TextEncoder().encode(value.workspaceEvidence.rawState));value.workspaceEvidence.rawRow.zk_state=value.workspaceEvidence.rawState;value.workspaceEvidence.rawRow.zk_revision=1;
 return {source,value};
}
test('accepted draft original/review/raw/history/operation and baseline survive full isolated restore',async()=>{
 const {source}=await acceptedSource();const packet=await buildKitchenBackup(source);assert.equal(packet.complete,true);
 const {restoreLocalTest}=await import('../tools/backup-restore/restore.ts'),{mkdtemp,readFile}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const directory=join(await mkdtemp(join(tmpdir(),'kitchen-accept-restore-')),'target');await restoreLocalTest(packet,{kind:'isolated-local-test',directory,authorized:true});const restored=JSON.parse(await readFile(join(directory,'backup.json'),'utf8'));assert.equal(restored.drafts[0].acceptance.reviewedFields.raw.total,'12,34');assert.equal(restored.state.invoices.at(-1).sourceBaseline.intake.draftId,restored.drafts[0].id);assert.equal(restored.drafts[0].history.length,2);
});
for(const mutation of ['receipt-missing','hash','actor','review','raw','source','downgrade'])test(`accepted backup rejects rehashed ${mutation} contradiction`,async()=>{
 const {source,value}=await acceptedSource();
 if(mutation==='receipt-missing')value.state.invoices.pop();
 if(mutation==='hash')value.operationReceipts[0].requestHash='c'.repeat(64);
 if(mutation==='actor')value.drafts[0].acceptance.actorId=crypto.randomUUID();
 if(mutation==='review')value.drafts[0].acceptance.reviewDecisions.stock='book';
 if(mutation==='raw')value.drafts[0].acceptance.reviewedFields.raw.total='99,00';
 if(mutation==='source')value.drafts[0].acceptance.documentVersion[0].sha256='c'.repeat(64);
 if(mutation==='downgrade'){value.sourceContract={id:'kitchen-core-v1',documents:'not_in_contract',drafts:'not_in_contract'};value.documents=null;value.drafts=null;}
 if(value.drafts){const d=value.drafts[0],{rowVersion,rawRow,history,...snapshot}=d;d.history.at(-1).value=structuredClone(snapshot);rawRow.zk_payload=JSON.stringify({...snapshot,history});}
 value.workspaceEvidence.rawState=JSON.stringify(value.state);value.workspaceEvidence.rawStateSha256=await bytesHash(new TextEncoder().encode(value.workspaceEvidence.rawState));value.workspaceEvidence.rawRow.zk_state=value.workspaceEvidence.rawState;
 await assert.rejects(()=>buildKitchenBackup(source));
});
