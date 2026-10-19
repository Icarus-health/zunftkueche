import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMicrosoftRepository} from '../src/data/microsoft-repository.ts';
import {buildRepositoryBackup} from '../src/data/backup.ts';
import {completeFixture} from './task4-complete-fixture.mjs';
const identity={organizationId:'22222222-2222-4333-8444-555555555555',userId:'33333333-2222-4333-8444-555555555555',workspaceId:'11111111-2222-4333-8444-555555555555'};
const response=value=>({success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,...identity,identity,canEdit:true,canConfigure:true,canClose:true,...value})}});
function snapshot(state){
 const rawState=JSON.stringify(state,null,2),rawStateSha256=createHash('sha256').update(rawState).digest('hex');
 return {environment:identity.organizationId,workspaceId:identity.workspaceId,state,settings:{},sourceContract:{id:'kitchen-core-v1',documents:'not_in_contract',drafts:'not_in_contract'},documents:null,drafts:null,operationReceipts:[],documentManifest:[],schemaValidation:{policy:'kitchen-schema2-net-evidence-v1',rawStateSha256},workspaceEvidence:{rawState,rawStateSha256,rawRow:{zk_kitchenworkspaceid:identity.workspaceId,zk_state:rawState,zk_revision:state.revision},rowVersion:'actual-1',ownerId:identity.userId,ownerType:'systemuser',protocolVersion:2}};
}
test('owner App source reads existing Load snapshot twice and never replays a pending commit',async()=>{
 const state=completeFixture(),calls=[];let writes=0;const pending=new Map();
 const api={load:async raw=>{const request=JSON.parse(raw);calls.push(request);return response(request.view?{view:'backup',snapshot:snapshot(state)}:{state});},commit:async()=>{writes++;throw new Error('unknown network result');}};
 const repo=createMicrosoftRepository(api,identity.workspaceId,{getItem:key=>pending.get(key)??null,setItem:(key,value)=>pending.set(key,value),removeItem:key=>pending.delete(key)});
 await repo.load();
 await assert.rejects(()=>repo.commit({id:'pending-price',targetEventId:state.event.id,baseRevision:0,type:'article.price',payload:{articleId:state.articles[0].id,priceCents:123}}));
 const before=[...pending];const backup=await buildRepositoryBackup(repo,{});
 assert.equal(backup.complete,true);assert.equal(backup.sourceContract.id,'kitchen-core-v1');assert.equal(backup.documents,null);assert.deepEqual(backup.operationReceipts,[]);
 assert.equal(writes,1);assert.deepEqual([...pending],before);assert.equal(calls.length,3);
 for(const request of calls.slice(1)){assert.equal(request.view,'backup');assert.deepEqual(request.identity,identity);}
});
test('read-only snapshot rejects foreign identity, permission loss and invalid policy hash',async()=>{
 for(const fault of ['identity','rights','hash']){
  const state=completeFixture();let n=0;const value=snapshot(state);
  const api={load:async()=>{n++;if(n===1)return response({state});return response({view:'backup',snapshot:fault==='hash'?{...value,schemaValidation:{...value.schemaValidation,rawStateSha256:'f'.repeat(64)}}:value,...(fault==='identity'?{identity:{...identity,userId:'44444444-2222-4333-8444-555555555555'}}:{}),...(fault==='rights'?{canConfigure:false}: {})});},commit:async()=>{throw new Error('must not write');}};
  const repo=createMicrosoftRepository(api,identity.workspaceId);await repo.load();await assert.rejects(()=>buildRepositoryBackup(repo,{}));
 }
});
