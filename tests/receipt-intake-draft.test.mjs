import test from 'node:test';
import assert from 'node:assert/strict';
import {DraftGuard,DraftNavigation} from '../src/ui/draft-guard.ts';
import {createReceiptEdit,receiptEditDirty,parseReceiptEdit} from '../src/ui/receipt-intake-draft.ts';
function blank(){return {schemaVersion:1,id:'draft',eventId:'event',source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,reviewStatus:'editing',pages:[],header:{supplierId:'',number:'',date:'',scope:'',grossCents:null},lines:[]};}
function guarded(edit,baseline) {
 const guard=new DraftGuard(),navigation=new DraftNavigation();let closed=false,discarded=false;
 navigation.add({element:()=>null,request:action=>guard.requestClose(receiptEditDirty(edit,baseline,0),()=>{discarded=true;action();})});
 navigation.request(()=>closed=true);assert.equal(closed,false);assert.equal(guard.confirming,true);
 guard.keepEditing();assert.equal(closed,false);assert.equal(discarded,false);
 navigation.request(()=>closed=true);guard.confirmDiscard();assert.equal(closed,true);assert.equal(discarded,true);
}
test('header-first and line-first manual edits without pages use the existing navigation guard',()=>{
 const initial=createReceiptEdit(blank()),baseline=JSON.stringify(initial);
 assert.equal(receiptEditDirty(initial,baseline,0),false);
 const header=structuredClone(initial);header.draft.header.number='UI-ENTWURF-NICHT-VERLIEREN';guarded(header,baseline);
 const line=structuredClone(initial);line.draft.lines.push({id:'line',description:'Kartoffeln',articleId:'',quantity:null,unit:'',grossCents:null});guarded(line,baseline);
});
test('removing the last original stays dirty against the saved draft baseline',()=>{
 const saved=blank();saved.pages=[{documentId:'document',documentRowVersion:'1',version:'etag',sha256:'hash',originalReviewed:false}];
 const edit=createReceiptEdit(saved),baseline=JSON.stringify(edit);edit.draft.pages=[];guarded(edit,baseline);
});
test('focused invalid raw money and quantity stay intact on keep-editing and failed save',()=>{
 const draft=blank();draft.lines=[{id:'line',description:'',articleId:'',quantity:null,unit:'',grossCents:null}];
 for(const field of ['total','quantity','grossCents']) {
  const edit=createReceiptEdit(draft),baseline=JSON.stringify(edit);
  if(field==='total')edit.raw.total='12,xx';else edit.raw.lines.line[field]='12,xx';
  guarded(edit,baseline);const before=JSON.stringify(edit);
  assert.throws(()=>parseReceiptEdit(edit));assert.equal(JSON.stringify(edit),before);
 }
});
test('raw valid focused values parse only at save, unknown blanks stay null, queue is dirty',()=>{
 const edit=createReceiptEdit(blank()),baseline=JSON.stringify(edit);edit.raw.total='12,34';
 assert.equal(edit.draft.header.grossCents,null);assert.equal(parseReceiptEdit(edit).header.grossCents,1234);
 edit.raw.total='';assert.equal(parseReceiptEdit(edit).header.grossCents,null);
 assert.equal(receiptEditDirty(createReceiptEdit(blank()),baseline,1),true);
});
import {replaceReceiptDraft} from '../src/ui/receipt-intake-draft.ts';
test('adding a line after saved raw inputs initializes its fields and preserves prior raw values',()=>{const draft=blank();draft.rawInput={total:'0012,34',lines:{}};const edit=createReceiptEdit(draft);const next=replaceReceiptDraft(edit,{...draft,lines:[{id:'new',description:'',articleId:'',quantity:null,unit:'',grossCents:null}]});assert.deepEqual(next.raw.lines.new,{quantity:'',grossCents:''});assert.equal(next.raw.total,'0012,34');assert.equal(parseReceiptEdit(next).header.grossCents,1234);});
test('unparsed supplied text alone is dirty without originals and survives a failed review parse',()=>{
 const edit=createReceiptEdit(blank()),baseline=JSON.stringify(edit),text='Rechnungsnummer R-1\nGesamt brutto 12,34 EUR';
 const next=replaceReceiptDraft(edit,{...edit.draft,textAssist:{origin:'user-supplied',completeness:'unknown',parserVersion:'receipt-hints-v1',text,proposals:[]}});
 assert.equal(next.draft.pages.length,0);guarded(next,baseline);next.raw.total='12,xx';
 assert.throws(()=>parseReceiptEdit(next));assert.equal(next.draft.textAssist.text,text);assert.equal(next.raw.total,'12,xx');
});
