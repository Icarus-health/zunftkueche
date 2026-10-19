import {validateStateOffline} from '../tools/backup-restore/validator.ts';
import{createHash}from'node:crypto';import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync,mkdtempSync,existsSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
const state=()=>({...JSON.parse(readFileSync('import/2026.json')),schemaVersion:2,revision:0,operationIds:[]});
const source=(value,cap=true)=>({authorize:async()=>cap,validateState:validateStateOffline,read:async()=>{const v=structuredClone(value),rawState=JSON.stringify(v.state);v.workspaceEvidence={rawState,rawStateSha256:createHash('sha256').update(rawState).digest('hex'),rawRow:{zk_kitchenworkspaceid:v.workspaceId,zk_revision:v.state.revision,zk_state:rawState},rowVersion:'synthetic-1',ownerId:'synthetic-owner',ownerType:'systemuser',protocolVersion:2};return v;}});
test('unknown tables and missing originals cannot become complete; permission and revision drift rejected',async()=>{const{buildKitchenBackup}=await import('../src/data/backup.ts');const v={environment:'local-test',workspaceId:'local-workspace',state:state(),settings:{},documents:null,drafts:null,operationReceipts:null,documentManifest:[]};const b=await buildKitchenBackup(source(v));assert.equal(b.complete,false);assert.equal(b.documents,null);assert.ok(b.missing.some(s=>s.includes('Original')));await assert.rejects(()=>buildKitchenBackup(source(v,false)));let n=0;await assert.rejects(()=>buildKitchenBackup({authorize:async()=>true,read:async()=>({...v,state:{...v.state,revision:n++}})}),/geändert/);});
test('complete synthetic backup restores exclusively into new isolated directory with bytes and receipt proof',async()=>{const{buildKitchenBackup,validateKitchenBackup}=await import('../src/data/backup.ts');const{restoreLocalTest}=await import('../tools/backup-restore/restore.ts');const s=state();s.invoices=[];s.planLines=[];s.menu=[];s.sales=[];s.dishPlan=[];s.lessons=[];const b=await buildKitchenBackup(source({environment:'local-test',workspaceId:'local-workspace',state:s,settings:{},documents:[],drafts:[],operationReceipts:[],documentManifest:[]}));assert.equal(b.complete,true);const dir=join(mkdtempSync(join(tmpdir(),'kitchen-restore-')),'isolated');await restoreLocalTest(b,{kind:'isolated-local-test',directory:dir,authorized:true});assert.ok(existsSync(join(dir,'backup.json')));await assert.rejects(()=>restoreLocalTest(b,{kind:'isolated-local-test',directory:dir,authorized:true}));const changed=structuredClone(b);changed.state.event.name='tamper';await assert.rejects(()=>validateKitchenBackup(changed),/Hash/);});
test('actual receipt identity and original bytes survive; tamper, orphan and link-only manifest fail',async()=>{
 const{createHash}=await import('node:crypto');const{buildKitchenBackup,validateKitchenBackup}=await import('../src/data/backup.ts');const s=state();s.invoices=[];s.planLines=[];s.menu=[];s.sales=[];s.dishPlan=[];s.lessons=[];s.revision=1;s.operationIds=['confirmed-op'];s.operationRequests={'confirmed-op':'preserved signature'};const bytes=Buffer.from('synthetic original');const sha256=createHash('sha256').update(bytes).digest('hex');const v={environment:'local-test',workspaceId:'local-workspace',state:s,settings:{},documents:[],drafts:[],operationReceipts:[{id:'receipt-1',workspaceId:'local-workspace',operationId:'confirmed-op',requestHash:'a'.repeat(64),actorId:'77777777-8888-4999-aaaa-bbbbbbbbbbbb',appliedRevision:1,recordedAt:'2026-10-19T12:00:00Z',rowVersion:'1',rawRow:{zk_kitchenoperationid:'receipt-1',_zk_workspace_value:'local-workspace',zk_operationid:'confirmed-op',zk_requesthash:'a'.repeat(64),zk_actor:'77777777-8888-4999-aaaa-bbbbbbbbbbbb',zk_appliedrevision:1,zk_recordedat:'2026-10-19T12:00:00Z'}}],documentManifest:[{id:'original',sha256,version:'1',itemId:'synthetic',bytesBase64:bytes.toString('base64')}]};const b=await buildKitchenBackup(source(v));assert.equal(b.complete,true);assert.deepEqual(b.operationReceipts,v.operationReceipts);assert.equal((await validateKitchenBackup(b,validateStateOffline)).complete,true);const{restoreLocalTest}=await import('../tools/backup-restore/restore.ts');const restoredDir=join(mkdtempSync(join(tmpdir(),'kitchen-original-restore-')),'isolated');await restoreLocalTest(b,{kind:'isolated-local-test',directory:restoredDir,authorized:true});assert.equal(createHash('sha256').update(readFileSync(join(restoredDir,'original-0.bin'))).digest('hex'),sha256);assert.deepEqual(JSON.parse(readFileSync(join(restoredDir,'backup.json'))).operationReceipts,v.operationReceipts);const missing=structuredClone(v);delete missing.documentManifest[0].bytesBase64;assert.equal((await buildKitchenBackup(source(missing))).complete,false);const corrupt=structuredClone(v);corrupt.documentManifest[0].bytesBase64=Buffer.from('wrong').toString('base64');await assert.rejects(()=>buildKitchenBackup(source(corrupt)),/Hash/);const orphan=structuredClone(v);orphan.operationReceipts[0].operationId='not-in-state';orphan.operationReceipts[0].rawRow.zk_operationid='not-in-state';await assert.rejects(()=>buildKitchenBackup(source(orphan)),/Vorgang/);
});
test('repository backup refuses readers before loading and requires the read-only snapshot source',async()=>{
 const {buildRepositoryBackup}=await import('../src/data/backup.ts');let reads=0;
 const repo={mode:'microsoft',canConfigure:false,canClose:false,identity:{organizationId:'org',userId:'user',workspaceId:'workspace'},load:async()=>{reads++;return state();}};
 await assert.rejects(()=>buildRepositoryBackup(repo,{}));assert.equal(reads,0);
 repo.canConfigure=true;repo.canClose=true;await assert.rejects(()=>buildRepositoryBackup(repo,{}),/Quelle|quelle/);assert.equal(reads,0);
});
test('a correctly rehashed malformed nested value never validates as complete',async()=>{
 const {buildKitchenBackup,validateKitchenBackup,backupHash}=await import('../src/data/backup.ts');
 const s=state();s.invoices=[];s.planLines=[];s.menu=[];s.sales=[];s.dishPlan=[];s.lessons=[];
 const b=await buildKitchenBackup(source({environment:'local-test',workspaceId:'local-workspace',state:s,settings:{},documents:[],drafts:[],operationReceipts:[],documentManifest:[]}));
 b.state.articles[0].unitPriceCents='invalid-money';b.workspaceEvidence.rawState=JSON.stringify(b.state);
 b.workspaceEvidence.rawStateSha256=createHash('sha256').update(b.workspaceEvidence.rawState).digest('hex');b.workspaceEvidence.rawRow.zk_state=b.workspaceEvidence.rawState;
 const {payloadHash,...payload}=b;b.payloadHash=await backupHash(payload);
 assert.equal((await validateKitchenBackup(b)).complete,false);
 await assert.rejects(()=>validateKitchenBackup(b,validateStateOffline));
 for(const edit of [s=>s.menu[0]={id:'bad',recipe:[{articleId:'unknown',quantity:'bad'}]},s=>s.closureHistory=[{snapshot:{complete:true,resultCents:'bad'}}]]){
  const invalid=state();edit(invalid);await assert.rejects(()=>validateStateOffline(invalid));
 }
});
test('core contract preserves null excluded sources and supports actual restore; unknown contracts and downgrades fail',async()=>{
 const {buildKitchenBackup,validateKitchenBackup}=await import('../src/data/backup.ts');
 const {restoreLocalTest}=await import('../tools/backup-restore/restore.ts');
 const s=state();s.invoices=[];s.planLines=[];s.menu=[];s.sales=[];s.dishPlan=[];s.lessons=[];
 const value={environment:'local-test',workspaceId:'local-workspace',sourceContract:{id:'kitchen-core-v1',documents:'not_in_contract',drafts:'not_in_contract'},state:s,settings:{},documents:null,drafts:null,operationReceipts:[],documentManifest:[]};
 const backup=await buildKitchenBackup(source(value));assert.equal(backup.complete,true);assert.equal(backup.documents,null);
 assert.equal((await validateKitchenBackup(backup)).complete,false);assert.equal((await validateKitchenBackup(backup,validateStateOffline)).complete,true);
 await restoreLocalTest(backup,{kind:'isolated-local-test',directory:join(mkdtempSync(join(tmpdir(),'kitchen-core-')),'target'),authorized:true});
 await assert.rejects(()=>buildKitchenBackup(source({...value,documents:[{id:'future-document'}]})),/herabgestuft/);
 await assert.rejects(()=>buildKitchenBackup(source({...value,sourceContract:{...value.sourceContract,id:'unknown'}})),/Sicherungsumfang/);
 assert.equal((await buildKitchenBackup(source({...value,operationReceipts:null}))).complete,false);
});
test('selected local originals match exact hashes, retain bytes and reject unrelated files and bounds',async()=>{
 const {selectOriginalFiles}=await import('../src/data/backup.ts');const bytes=Buffer.from('original');const hash=createHash('sha256').update(bytes).digest('hex');
 const s=state();s.planLines[0].source.hash=hash;const selected=await selectOriginalFiles(s,[new File([bytes],'renamed.bin')]);
 assert.equal(selected[0].sha256,hash);assert.deepEqual(Buffer.from(selected[0].bytesBase64,'base64'),bytes);
 await assert.rejects(()=>selectOriginalFiles(s,[new File(['different'],'same-name.pdf')]),/Hash/);
 await assert.rejects(()=>selectOriginalFiles(s,[{name:'oversize',size:21*1024*1024}]),/20 MiB/);
});
