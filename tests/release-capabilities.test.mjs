import test from 'node:test';
import assert from 'node:assert/strict';
import {createMicrosoftRepository} from '../src/data/microsoft-repository.ts';
import {connectDocumentRepository} from '../src/data/document-runtime.ts';
const workspaceId='11111111-1111-4111-8111-111111111111';
const identity={organizationId:'22222222-2222-4222-8222-222222222222',userId:'33333333-3333-4333-8333-333333333333',workspaceId};
const state={schemaVersion:2,revision:0,operationIds:[],operationRequests:{},event:{id:'e',name:'Synthetic',year:2099,dates:{}},sourceNotice:'synthetic',suppliers:[],articles:[],planLines:[],menu:[],invoices:[],sales:[],movements:[],orders:[],dishPlan:[],lessons:[]};
const off={documents:false,receiptIntake:false};
function fixture(features){let reply={protocolVersion:2,workspaceId,identity,canEdit:true,canConfigure:true,canClose:true,state,features},calls=0;const bytes=new Map();const store={getItem:k=>bytes.get(k)??null,setItem:(k,v)=>bytes.set(k,v),removeItem:k=>bytes.delete(k)};const repo=createMicrosoftRepository({load:async()=>({success:true,data:{ResultJson:JSON.stringify(reply)}}),commit:async()=>{calls++;throw Error('unexpected API');}},workspaceId,store);return {repo,bytes,store,get calls(){return calls;},set reply(value){reply=value;},get reply(){return reply;}};}
test('features default false and only exact trusted boolean flags publish defensive values',async()=>{
 for(const value of [undefined,null,[],true,{documents:'true',receiptIntake:1}]){const f=fixture(value);assert.deepEqual(f.repo.features,off);await f.repo.load();assert.deepEqual(f.repo.features,off);}
 const f=fixture({documents:true,receiptIntake:false});await f.repo.load();assert.deepEqual(f.repo.features,{documents:true,receiptIntake:false});const copy=f.repo.features;copy.documents=false;assert.equal(f.repo.features.documents,true);
});
test('reload clears features and attached documents before an invalid or foreign load',async()=>{
 for(const change of [{protocolVersion:1},{identity:{...identity,workspaceId:'foreign'}},{state:{}},{canEdit:'yes'}]){const f=fixture({documents:true,receiptIntake:true});await f.repo.load();f.repo.documents={};f.reply={...f.reply,...change};await assert.rejects(()=>f.repo.load());assert.deepEqual(f.repo.features,off);assert.equal(f.repo.documents,undefined);}
});
test('new financial accept needs both flags before API and pending bytes',async()=>{
 for(const features of [undefined,off,{documents:true,receiptIntake:false},{documents:false,receiptIntake:true}]){const f=fixture(features);await f.repo.load();await assert.rejects(()=>f.repo.commit({id:'accept',baseRevision:0,targetEventId:'e',type:'receipt.draft.accept',payload:{}}),/freigegeben/);assert.equal(f.calls,0);assert.equal(f.bytes.size,0);}
});
test('documents alone permits file/draft requests; retained references recheck current feature before every provider call',async()=>{
 let calls=0;const f=fixture({documents:true,receiptIntake:false});await f.repo.load();const services={load:{zk_KitchenLoad:async()=>{calls++;return {success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,workspaceId,identity,view:'documents',documents:[],drafts:[]})}};}},commit:{zk_KitchenCommit:async()=>{calls++;throw Error('synthetic draft reaches service');}}};const provider={identity:async()=>{calls++;return 'synthetic';},read:async()=>{calls++;throw Error('provider');},find:async()=>{calls++;return null;},create:async()=>{calls++;}};
 connectDocumentRepository(f.repo,services,provider,f.store);const retained=f.repo.documents;await retained.list();await assert.rejects(()=>retained.saveDraft({id:'draft',eventId:'e'}),/synthetic draft/);f.reply={...f.reply,features:off};await f.repo.load();const before=calls;await assert.rejects(()=>retained.list(),/freigegeben/);await assert.rejects(()=>retained.getOriginal({}));assert.equal(calls,before);
});

test('existing uncertain receipt bytes and v1 quarantine survive disabled features unchanged',async()=>{
 const f=fixture(off);const operation={id:'uncertain',type:'receipt.draft.accept',baseRevision:0,targetEventId:'e',payload:{}};
 const request=JSON.stringify({protocolVersion:2,workspaceId,identity,targetEventId:'e',operationId:operation.id});
 const bytes=JSON.stringify({operation,request});const key=`zunftkueche.pending.v2.${identity.organizationId}.${identity.userId}.${workspaceId}`;
 f.bytes.set(key,bytes);await assert.rejects(()=>f.repo.load(),/unexpected API/);assert.equal(f.bytes.get(key),bytes);assert.equal(f.calls,1);assert.deepEqual(f.repo.features,off);
 const legacy=fixture(off);const legacyKey=`zunftkueche.pending.v1.${workspaceId}`;legacy.bytes.set(legacyKey,' exact old bytes ');await legacy.repo.load();await assert.rejects(()=>legacy.repo.commit(operation));assert.equal(legacy.bytes.get(legacyKey),' exact old bytes ');assert.equal(legacy.calls,0);
});
test('a stale overlapping load cannot restore flags after a newer revocation',async()=>{
 let finish;let count=0;const reply=features=>({success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,workspaceId,identity,canEdit:true,canConfigure:false,canClose:false,state,features})}});
 const repo=createMicrosoftRepository({load:async()=>++count===1?await new Promise(resolve=>{finish=resolve;}):reply(off),commit:async()=>{throw Error('unused');}},workspaceId);
 const older=repo.load();await repo.load();finish(reply({documents:true,receiptIntake:true}));await assert.rejects(()=>older);assert.deepEqual(repo.features,off);assert.equal(repo.documents,undefined);
});
test('foreign commit identity invalidates confirmed features and detaches document references',async()=>{
 for(const foreign of [{workspaceId:'foreign'},{identity:{...identity,userId:'44444444-4444-4444-8444-444444444444'}}]){
  const answer=value=>({success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,workspaceId,identity,canEdit:true,canConfigure:true,canClose:true,state,features:{documents:true,receiptIntake:true},...value})}});
  const repo=createMicrosoftRepository({load:async()=>answer({}),commit:async()=>answer(foreign)},workspaceId);
  await repo.load();repo.documents={};await assert.rejects(()=>repo.commit({id:'dates',baseRevision:0,targetEventId:'e',type:'event.dates',payload:{dates:{}}}));assert.deepEqual(repo.features,off);assert.equal(repo.documents,undefined);
 }
});
test('a trusted document feature does not prevent a reader from loading core state',async()=>{
 const f=fixture({documents:true,receiptIntake:false});f.reply={...f.reply,canEdit:false,canConfigure:false,canClose:false};await f.repo.load();let calls=0;const provider={identity:async()=>{calls++;return 'reader';}};
 connectDocumentRepository(f.repo,{},provider,f.store);await assert.rejects(()=>f.repo.documents.list(),/Bearbeitungsrechte/);assert.equal(calls,0);
});
