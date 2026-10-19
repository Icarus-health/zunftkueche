import assert from 'node:assert/strict';
const mod=await import('../src/data/documents.ts');
export function fixture({timeout=false,linkFailure=false}={}) {
 let row=null, stored=null, creates=0, principal='user-a', current=true;
 const api={identity:async()=>principal, find:async()=>stored, create:async(_name,bytes)=>{creates++;stored={bytes,version:'etag-1',itemId:'1',connectorIdentifier:'encoded-id'};if(timeout)throw Error('timeout');}, read:async()=>{if(!current)throw Error('denied');return stored;}};
 const store={list:async()=>({documents:row?[structuredClone(row)]:[],drafts:[]}),begin:async(value)=>{row??={...value,status:'selected',rowVersion:'1',id:value.uploadId};return structuredClone(row);},claim:async(value)=>{assert.equal(row.rowVersion,value.rowVersion);assert.equal(row.status,'selected');row={...row,status:'uploading',rowVersion:'2'};return structuredClone(row);},link:async(value)=>{if(linkFailure){linkFailure=false;throw Error('link failed');}row={...row,status:'linked',ref:value.ref,rowVersion:'3'};return structuredClone(row);},saveDraft:async x=>x};
 return {repo:()=>mod.createDocumentRepository({api,store}),api,store,get creates(){return creates},get row(){return row},setPrincipal:v=>principal=v,revoke:()=>current=false};
}
