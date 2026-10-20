// Real runtime adapter with a provider boundary and server-compatible replay semantics.
import {connectDocumentRepository} from '../src/data/document-runtime.ts';
export function runtimeFixture({lostClaim=false, concurrentAbsence=false, lostCreate=false, lostLink=false, failBeforeClaim=false}={}) {
  const identity={organizationId:'o',workspaceId:'w',userId:'u'};
  const values=new Map(), calls=[], acknowledgments=new Map();
  let row=null, stored=null, creates=0, arrivals=0, release;
  const absence=new Promise(resolve=>{release=resolve;});
  const envelope=value=>({success:true,data:{ResultJson:JSON.stringify({protocolVersion:2,workspaceId:'w',identity,view:'documents',...value})}});
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const services={load:{zk_KitchenLoad:async()=>envelope({documents:row?[row]:[],drafts:[]})},commit:{zk_KitchenCommit:async raw=>{
    const q=JSON.parse(raw); calls.push(q);
    if(q.action==='upload.claim'&&failBeforeClaim){failBeforeClaim=false;throw Error('claim not delivered');}
    if(acknowledgments.has(q.requestId))return envelope({outcome:'replayed',acknowledgment:acknowledgments.get(q.requestId),value:row});
    if(q.action==='upload.begin'&&row)return envelope({outcome:'existing',acknowledgment:null,value:row});
    if(q.action==='upload.begin')row={...q.value,id:q.value.uploadId,status:'selected',rowVersion:'1'};
    else if(q.action==='upload.claim') {
      if(row.status!=='selected'||row.rowVersion!==q.value.rowVersion)throw Error('CAS conflict');
      row={...row,status:'uploading',rowVersion:'2'};
    } else if(q.action==='upload.link')row={...row,status:'linked',ref:q.value.ref,rowVersion:'3'};
    const acknowledgment={requestId:q.requestId,action:q.action,value:structuredClone(row)};
    acknowledgments.set(q.requestId,acknowledgment);
    if(q.action==='upload.claim'&&lostClaim){lostClaim=false;throw Error('lost response');}
    if(q.action==='upload.link'&&lostLink){lostLink=false;throw Error('lost link response');}
    // Let a second continuation observe the pending claim before the first response clears it.
    if(q.action==='upload.claim')await new Promise(resolve=>setImmediate(resolve));
    return envelope({outcome:'applied',acknowledgment,value:row});
  }}};
  const provider={identity:async()=> 'editor',find:async()=>{
    if(concurrentAbsence&&arrivals<2){arrivals++;if(arrivals===2)release();await absence;return null;}
    return stored;
  },create:async(_name,bytes)=>{creates++;stored={bytes,version:'etag-1',itemId:'1',connectorIdentifier:'encoded-id'};if(lostCreate){lostCreate=false;throw Error('lost provider response');}},read:async()=>stored};
  function repository(){const repo={identity,canEdit:true,features:{documents:true,receiptIntake:true}};connectDocumentRepository(repo,services,provider,storage);return repo.documents;}
  return {repository,provider,storage,calls,values,get creates(){return creates;},get row(){return row;}};
}
