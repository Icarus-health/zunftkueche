import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftGuard, draftFingerprint } from '../src/ui/draft-guard.ts';
test('receipt text survives Escape and close until discard is confirmed', () => {
  let closed = 0; const guard = new DraftGuard();
  guard.requestClose(true, () => closed++);
  assert.equal(closed, 0); assert.equal(guard.confirming, true);
  guard.keepEditing(); assert.equal(closed, 0); assert.equal(guard.confirming, false);
  guard.requestClose(true, () => closed++); guard.confirmDiscard();
  assert.equal(closed, 1); assert.equal(guard.confirming, false);
});
test('unchanged dialogs close immediately; cancellation also cancels pending navigation', () => {
  const guard = new DraftGuard(); let destination = '';
  guard.requestClose(false, () => destination = 'closed'); assert.equal(destination, 'closed');
  guard.requestClose(true, () => destination = 'orders'); guard.keepEditing(); guard.confirmDiscard();
  assert.equal(destination, 'closed');
});
test('form comparison detects text, dates, recipe removal and reversions without treating defaults as edits', () => {
  const original = [{type:'text',value:''},{type:'checkbox',value:'on',checked:false}];
  const baseline = draftFingerprint(original);
  assert.equal(draftFingerprint(structuredClone(original)), baseline);
  assert.notEqual(draftFingerprint([{...original[0],value:'Belegtext'},original[1]]), baseline);
  assert.notEqual(draftFingerprint([original[0],{...original[1],checked:true}]), baseline);
  assert.notEqual(draftFingerprint(original.slice(0,1)), baseline);
  assert.equal(draftFingerprint(original), baseline);
});
test('closing a modal consults its dirty standalone descendants without discarding other screen fields', async () => {
  const { DraftNavigation } = await import('../src/ui/draft-guard.ts');
  const navigation = new DraftNavigation();
  const modal = {}, price = {}, outside = {};
  const inModal = {contains: node => node === modal || node === price};
  let priceDiscarded = 0, outsideDiscarded = 0, closed = 0;
  const priceGuard = new DraftGuard();
  navigation.add({element:()=>outside,request:()=>outsideDiscarded++});
  navigation.add({element:()=>price,request:action => priceGuard.requestClose(true,()=>{priceDiscarded++;action();})});
  navigation.request(()=>closed++,inModal);
  assert.equal(closed,0); assert.equal(priceGuard.confirming,true);
  priceGuard.keepEditing(); assert.equal(priceDiscarded,0);
  navigation.request(()=>closed++,inModal); priceGuard.confirmDiscard();
  assert.equal(priceDiscarded,1); assert.equal(closed,1); assert.equal(outsideDiscarded,0);
});
test('local tab and filter requests wait for dirty fields and cancellation leaves their destination unchanged', async () => {
  const { DraftNavigation } = await import('../src/ui/draft-guard.ts');
  const navigation = new DraftNavigation(), field = new DraftGuard();
  let tab = 'planning', text = 'invalid';
  const remove = navigation.add({element:()=>null,request:action=>field.requestClose(true,()=>{text='';action();})});
  navigation.request(()=>tab='needs'); assert.equal(tab,'planning'); assert.equal(text,'invalid');
  field.keepEditing(); assert.equal(tab,'planning'); assert.equal(text,'invalid');
  navigation.request(()=>tab='needs'); field.confirmDiscard(); assert.equal(tab,'needs');
  remove(); navigation.request(()=>tab='orders'); assert.equal(tab,'orders');
});
test('modal closure can exclude its own registry entry and invoke its own form guard exactly once', async () => {
 const {DraftNavigation} = await import('../src/ui/draft-guard.ts');
 const navigation = new DraftNavigation(); const modal = {}, field = {}, guard = new DraftGuard();
 let modalRequests=0, fieldRequests=0, closed=0;
 navigation.add({element:()=>modal,request:()=>modalRequests++});
 navigation.add({element:()=>field,request:action=>{fieldRequests++;guard.requestClose(true,action);}});
 navigation.request(()=>closed++,{contains:node=>node===modal||node===field},modal);
 assert.equal(fieldRequests,1); assert.equal(modalRequests,0); assert.equal(closed,0);
 guard.confirmDiscard(); assert.equal(closed,1);
});
test('pending operation refuses clean navigation and cancels a previously queued discard',()=>{
 const guard=new DraftGuard();let discarded=0;
 guard.requestClose(true,()=>discarded++);assert.equal(guard.confirming,true);
 guard.confirmDiscard(true);assert.equal(discarded,0);assert.equal(guard.confirming,false);
 guard.requestClose(false,()=>discarded++,true);assert.equal(discarded,0);assert.equal(guard.confirming,false);
 guard.confirmDiscard();assert.equal(discarded,0);
 guard.requestClose(false,()=>discarded++);assert.equal(discarded,1);
});
