import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createMicrosoftRepository} from '../src/data/microsoft-repository.ts';
import {applyOperation} from '../src/domain/state.ts';
import {RejectedError} from '../src/data/repository.ts';
const workspaceId='11111111-2222-4333-8444-555555555555';
const seed=()=>({...JSON.parse(readFileSync(new URL('../import/2026.json',import.meta.url))),schemaVersion:2,revision:0,operationIds:[],operationRequests:{}});
const wrap=value=>({success:true,data:{ResultJson:JSON.stringify(value)}});
const load=state=>wrap({protocolVersion:1,workspaceId,canWrite:true,state});
const operation=(id='price')=>({id,baseRevision:0,type:'article.price',payload:{articleId:'a-1',priceCents:12.34}});
const hash=raw=>createHash('sha256').update(raw).digest('hex');
const rejected=(raw,state)=>{const q=JSON.parse(raw);return wrap({protocolVersion:1,workspaceId,operationId:q.operationId,status:'rejected',appliedRevision:null,rejectionCode:'candidate_validation',requestHash:hash(raw),state});};
const saved=raw=>{const q=JSON.parse(raw);return wrap({protocolVersion:1,workspaceId,operationId:q.operationId,status:'saved',appliedRevision:q.expectedRevision+1,state:q.candidateState});};
function storage(){const values=new Map();return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
function padded(bytes){const state=seed();state.suppliers[0].name='s'.repeat(200);state.padding=[];while(Buffer.byteLength(JSON.stringify(state))+10003<bytes)state.padding.push('x'.repeat(10000));state.padding.push('');const remaining=bytes-Buffer.byteLength(JSON.stringify(state));state.padding[state.padding.length-1]='x'.repeat(remaining);assert.equal(Buffer.byteLength(JSON.stringify(state)),bytes);return state;}

test('near-limit candidate growth is rejected before persistence and corrected save remains possible',async()=>{
 const state=padded(524200),store=storage();let calls=0;
 const api={load:async()=>load(state),commit:async raw=>{calls++;return saved(raw);}};
 const repo=createMicrosoftRepository(api,workspaceId,store);await repo.load();
 await assert.rejects(repo.commit({id:'valid-new-supplier',baseRevision:0,type:'supplier.save',payload:{name:'n'.repeat(200),email:null}}),RejectedError);
 assert.equal(calls,0);assert.equal(store.values.size,0);
 const reloaded=createMicrosoftRepository(api,workspaceId,store);assert.equal((await reloaded.load()).revision,0);
 assert.equal((await reloaded.commit({id:'correct',baseRevision:0,type:'supplier.save',payload:{id:state.suppliers[0].id,name:'A',email:null}})).status,'saved');
});
test('UTF-8 request cap is checked separately from candidate cap before persistence',async()=>{
 const state=padded(385500),store=storage();let calls=0;
 const repo=createMicrosoftRepository({load:async()=>load(state),commit:async raw=>{calls++;return saved(raw);}},workspaceId,store);await repo.load();
 // CJK metadata appears in both operation and server-owned request signature. Each is below the character limit.
 const op=operation();op.payload.extra='漢'.repeat(45000);
 const candidate=applyOperation(state,op).state;assert.ok(Buffer.byteLength(JSON.stringify(candidate))<524288);
 assert.ok(Buffer.byteLength(JSON.stringify({protocolVersion:1,workspaceId,operationId:op.id,expectedRevision:0,operation:{type:op.type,payload:op.payload},candidateState:candidate}))>655360);
 await assert.rejects(repo.commit(op),RejectedError);assert.equal(calls,0);assert.equal(store.values.size,0);
});
test('metadata collection bounds reject operation history growth before persistence',async()=>{
 const state=seed(),store=storage();state.operationIds=Array.from({length:10000},(_,i)=>String(i));let calls=0;
 const repo=createMicrosoftRepository({load:async()=>load(state),commit:async raw=>{calls++;return saved(raw);}},workspaceId,store);await repo.load();
 await assert.rejects(repo.commit(operation('overflow')),RejectedError);assert.equal(calls,0);assert.equal(store.values.size,0);
});
test('exact-hash definitive pre-write server rejection permits a corrected operation',async()=>{
 const state=seed(),store=storage();let calls=0;
 const repo=createMicrosoftRepository({load:async()=>load(state),commit:async raw=>++calls===1?rejected(raw,state):saved(raw)},workspaceId,store);await repo.load();
 await assert.rejects(repo.commit(operation()),RejectedError);assert.equal(store.values.size,0);
 assert.equal((await repo.commit(operation('corrected'))).status,'saved');
});
test('reload recovers valid state after the server definitively rejects a previously ambiguous request',async()=>{
 const state=seed(),store=storage();let bytes;
 const first=createMicrosoftRepository({load:async()=>load(state),commit:async raw=>{bytes=raw;throw Error('timeout');}},workspaceId,store);await first.load();await assert.rejects(first.commit(operation()));
 const second=createMicrosoftRepository({load:async()=>load(state),commit:async raw=>{assert.equal(raw,bytes);return rejected(raw,state);}},workspaceId,store);
 assert.equal((await second.load()).revision,0);assert.equal(store.values.size,0);
});
for(const kind of ['wrong hash','wrong operation','wrong workspace','wrong code','applied revision','malformed state','unknown SDK fault'])test(`${kind} never clears ambiguous pending bytes`,async()=>{
 const state=seed(),store=storage(),sent=[];
 const repo=createMicrosoftRepository({load:async()=>load(state),commit:async raw=>{sent.push(raw);if(sent.length===1)throw Error('timeout');if(kind==='unknown SDK fault')return {success:false,error:{message:'Kitchen validation: Aggregate exceeds 512 KiB.'}};const v=JSON.parse(rejected(raw,state).data.ResultJson);if(kind==='wrong hash')v.requestHash='0'.repeat(64);if(kind==='wrong operation')v.operationId='other';if(kind==='wrong workspace')v.workspaceId='other';if(kind==='wrong code')v.rejectionCode='receipt_mismatch';if(kind==='applied revision')v.appliedRevision=1;if(kind==='malformed state')v.state.articles='bad';return wrap(v);}},workspaceId,store);
 await repo.load();await assert.rejects(repo.commit(operation()));await assert.rejects(repo.commit(operation()),e=>!(e instanceof RejectedError));assert.equal(sent[0],sent[1]);assert.equal(store.values.size,1);
});
test('production runtime requires pending storage, and storage write failure sends nothing',async()=>{
 const {configureMicrosoftRuntime}=await import('../src/data/microsoft-runtime.ts');
 assert.throws(()=>configureMicrosoftRuntime(workspaceId,{load:{zk_KitchenLoad:async()=>load(seed())},commit:{zk_KitchenCommit:async raw=>saved(raw)}}),/Speicher/);
 let calls=0;const store={getItem:()=>null,setItem:()=>{throw Error('storage denied');},removeItem:()=>{}};
 const repo=createMicrosoftRepository({load:async()=>load(seed()),commit:async raw=>{calls++;return saved(raw);}},workspaceId,store);await repo.load();await assert.rejects(repo.commit(operation()),RejectedError);assert.equal(calls,0);
});
