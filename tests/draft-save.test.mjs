import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveController } from '../src/data/save-controller.ts';
const operation = (id,quantity) => ({id,baseRevision:7,type:'plan.quantity',payload:{id:'line',quantity}});
test('rapid field switches never report a second unsent edit as saved or auto-rebase it', async () => {
 let acknowledge; const sent = [], states = [], statuses = [];
 const controller = new SaveController(() => ({commit:op => {
   sent.push(structuredClone(op)); return new Promise(resolve => acknowledge = resolve);
 }}),state => states.push(state),status => statuses.push(status));
 const first = controller.save(operation('first',12));
 assert.equal(controller.status.busy,true); assert.equal(states.length,0);
 assert.notEqual(controller.status.message,'Lokal gespeichert');
 assert.equal(await controller.save(operation('second',18)),false);
 assert.equal(sent.length,1); assert.equal(sent[0].payload.quantity,12);
 acknowledge({status:'saved',state:{revision:8}});
 assert.equal(await first,true); assert.equal(controller.status.pending,null);
 assert.deepEqual(states,[{revision:8}]);
});
test('transport failure keeps the exact pending operation and acknowledgement resolves it once', async () => {
 let attempt = 0; const sent = [];
 const controller = new SaveController(() => ({commit:async op => {
   sent.push(structuredClone(op)); if (++attempt === 1) throw new Error('Offline');
   return {status:'saved',state:{revision:8}};
 }}),()=>{},()=>{});
 let resolved = false;
 const pending = controller.save(operation('same-id',21)).then(ok => {resolved=true;return ok;});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(resolved,false); assert.equal(controller.status.pending.id,'same-id');
 assert.match(controller.status.error,/nicht bestätigt/);
 await controller.retry(); assert.equal(await pending,true); assert.deepEqual(sent[0],sent[1]);
});
test('a conflict publishes failure and current data without retrying or overwriting', async () => {
 let commits = 0; const states = [];
 const controller = new SaveController(() => ({commit:async()=>{
   commits++; return {status:'conflict',state:{revision:9}};
 }}),state=>states.push(state),()=>{});
 assert.equal(await controller.save(operation('conflict',33)),false);
 await controller.retry(); assert.equal(commits,1);
 assert.deepEqual(states,[{revision:9}]); assert.match(controller.status.error,/prüfe deine Eingabe/);
 assert.notEqual(controller.status.message,'Lokal gespeichert');
});
