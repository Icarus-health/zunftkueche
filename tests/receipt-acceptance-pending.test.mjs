import test from 'node:test';
import assert from 'node:assert/strict';
import {ReceiptAcceptanceSession} from '../src/ui/receipt-acceptance.ts';
import {createReceiptEdit} from '../src/ui/receipt-intake-draft.ts';
import {SaveController} from '../src/data/save-controller.ts';
import {DraftGuard} from '../src/ui/draft-guard.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const draft={schemaVersion:1,id:'draft',eventId:'event',rowVersion:'7',reviewStatus:'reviewed',pages:[{documentId:'doc',documentRowVersion:'3',version:'v1',sha256:'a'.repeat(64),originalReviewed:true}],header:{supplierId:'supplier',number:'R-1',date:'2026-10-19',scope:'Küche',grossCents:1234},lines:[{id:'line',description:'Kartoffeln',articleId:'',quantity:1.25,unit:'kg',grossCents:1234}],source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,textAssist:{origin:'user-supplied',completeness:'unknown',parserVersion:'receipt-hints-v1',text:'Rechnungsnummer R-1\nGesamt brutto 12,34 EUR',proposals:[]}};
 const row={id:'doc',eventId:'event',rowVersion:'3',status:'linked',sha256:'a'.repeat(64),ref:{version:'v1'}};
 let edit=createReceiptEdit(draft),acknowledged=0;
 const session=new ReceiptAcceptanceSession(),changes=[];
 const inventory={documents:[row],drafts:[draft]};
 const accepted={...structuredClone(draft),reviewStatus:'accepted',acceptance:{operationId:'same-id',receiptId:'draft'}};
 const options={edit,state:{event:{id:'event'},revision:0},documents:{list:async()=>structuredClone(inventory),getOriginal:async()=>new Blob(['synthetic'])},decisions:{receipt:true,fields:true,originals:true,prices:'separate',stock:'separate'},commit:async()=>true,refresh:async()=>({documents:[row],drafts:[accepted]}),currentEdit:()=>edit,onAccepted:value=>{edit=createReceiptEdit(value);acknowledged++;},onPending:value=>changes.push(value)};
 return {session,options,changes,get edit(){return edit;},set edit(value){edit=value;},get acknowledged(){return acknowledged;}};
}
test('owning editor locks before list through delayed original, commit and acknowledged refresh',async()=>{
 const f=fixture(),list=deferred(),original=deferred(),commit=deferred(),refresh=deferred(),before=structuredClone(f.edit);let reads=0,sends=0;
 f.options.documents.list=()=>list.promise;
 f.options.documents.getOriginal=()=>{reads++;return original.promise;};
 f.options.commit=payload=>{sends++;assert.equal(payload.reviewedFields.raw.total,'12,34');return commit.promise;};
 f.options.refresh=()=>refresh.promise;
 const pending=f.session.accept(f.options);
 function attempts(){
  assert.equal(f.session.pending,true);
  assert.equal(f.session.edit(()=>{f.edit.raw.total='99,00';f.edit.raw.lines.line.quantity='9,5';f.edit.draft.header.number='NEW';f.edit.draft.textAssist.text='changed text';}),false);
  assert.equal(f.session.edit(()=>{f.edit={...f.edit,draft:{...f.edit.draft,id:'other-draft'}};}),false);
  const navigation=new DraftGuard();let closed=false;
  navigation.requestClose(false,()=>closed=true,f.session.pending);navigation.confirmDiscard(f.session.pending);
  assert.equal(closed,false);assert.deepEqual(f.edit,before);
 }
 attempts();assert.equal(reads,0);assert.equal(sends,0);assert.equal(await f.session.accept(f.options),false);
 list.resolve(await fixture().options.documents.list());await tick();attempts();assert.equal(reads,1);
 original.resolve(new Blob());await tick();attempts();assert.equal(sends,1);
 commit.resolve(true);await tick();attempts();assert.equal(f.acknowledged,0);
 refresh.resolve(await fixture().options.refresh());assert.equal(await pending,true);
 assert.equal(f.acknowledged,1);assert.equal(f.session.pending,false);assert.deepEqual(f.changes,[true,false]);
});
test('source failure, definitive rejection and refresh failure retain raw values and release only after outcome',async()=>{
 for(const boundary of ['original','rejected','refresh']){
  const f=fixture(),hold=deferred(),before=structuredClone(f.edit);let sends=0;
  if(boundary==='original')f.options.documents.getOriginal=()=>hold.promise;
  f.options.commit=async()=>{sends++;return boundary==='rejected'?hold.promise:true;};
  if(boundary==='refresh')f.options.refresh=()=>hold.promise;
  const pending=f.session.accept(f.options);await tick();assert.equal(f.session.pending,true);
  assert.equal(f.session.edit(()=>{f.edit.raw.total='99,00';}),false);
  if(boundary==='rejected'){hold.resolve(false);assert.equal(await pending,false);}else {hold.reject(Error('synthetic failure'));await assert.rejects(pending,/synthetic failure/);}
  assert.deepEqual(f.edit,before);assert.equal(f.acknowledged,0);assert.equal(f.session.pending,false);assert.equal(sends,boundary==='original'?0:1);
 }
});
test('lost acknowledgement retains the exact SaveController request and editor lock until retry and refresh',async()=>{
 const f=fixture(),before=structuredClone(f.edit),sent=[],refresh=deferred();
 const controller=new SaveController(()=>({commit:async op=>{sent.push(structuredClone(op));if(sent.length===1)throw Error('lost acknowledgement');return {status:'saved',state:{revision:1}};}}),()=>{},()=>{});
 f.options.commit=payload=>controller.save({id:'same-id',type:'receipt.draft.accept',baseRevision:0,targetEventId:'event',payload:{...payload,operationId:'same-id'}});
 f.options.refresh=()=>refresh.promise;
 const pending=f.session.accept(f.options);await tick();
 assert.equal(controller.status.pending.id,'same-id');assert.equal(f.session.pending,true);
 assert.equal(f.session.edit(()=>{f.edit.raw.total='99,00';}),false);assert.deepEqual(f.edit,before);
 await controller.retry();await tick();assert.equal(f.session.pending,true);assert.deepEqual(sent[0],sent[1]);
 refresh.resolve(await fixture().options.refresh());assert.equal(await pending,true);assert.equal(f.session.pending,false);assert.equal(f.acknowledged,1);
});
test('an independently changed edit is never reset by a stale acknowledgement callback',async()=>{
 const f=fixture(),hold=deferred();f.options.refresh=()=>hold.promise;
 const pending=f.session.accept(f.options);await tick();
 // Defensive check for state replacement outside the owner gate, not an enabled UI edit.
 f.edit={...f.edit,raw:{...f.edit.raw,total:'99,00'}};
 hold.resolve(await fixture().options.refresh());await assert.rejects(pending,/Prüfentwurf.*geändert/);
 assert.equal(f.edit.raw.total,'99,00');assert.equal(f.acknowledged,0);
});
