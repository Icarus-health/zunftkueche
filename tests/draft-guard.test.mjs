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
