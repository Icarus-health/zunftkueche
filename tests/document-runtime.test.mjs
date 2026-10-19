import test from 'node:test';
import assert from 'node:assert/strict';
import {connectDocumentRepository} from '../src/data/document-runtime.ts';
import {jpegFile,jpeg} from './document-files.mjs';
const identity={organizationId:'o',workspaceId:'w',userId:'u'};
test('unknown claim outcome is replayed with same request before resuming upload; no new create',async()=>{
 const storage=new Map();const calls=[];let row=null,timeout=true;
 const services={load:{zk_KitchenLoad:async()=>({success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,workspaceId:'w',identity,view:'documents',documents:row?[row]:[],drafts:[]})}})},commit:{zk_KitchenCommit:async raw=>{const q=JSON.parse(raw);calls.push(q);if(q.action==='upload.begin')row??={...q.value,id:q.value.uploadId,status:'selected',rowVersion:'1'};if(q.action==='upload.claim'){row={...row,status:'uploading',rowVersion:'2'};if(timeout){timeout=false;throw Error('lost response');}}return {success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,workspaceId:'w',identity,view:'documents',value:row})}};}}};
 const provider={identity:async()=> 'editor',find:async()=>null,create:async()=>{throw Error('must not recreate');},read:async()=>{throw Error('unused');}};
 const repo={identity,canEdit:true};connectDocumentRepository(repo,services,provider,{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
 const value={uploadId:'11111111-1111-4111-8111-111111111111',eventId:'e',file:jpegFile()};
 await assert.rejects(()=>repo.documents.upload(value),/lost response/);
 await assert.rejects(()=>repo.documents.upload(value),/Unklar/);
 const claims=calls.filter(c=>c.action==='upload.claim');assert.equal(claims.length,2);assert.equal(claims[0].requestId,claims[1].requestId);assert.equal(storage.size,0);
});
