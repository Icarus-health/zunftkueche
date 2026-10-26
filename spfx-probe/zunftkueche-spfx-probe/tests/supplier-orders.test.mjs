import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scheduledOrder,validateSchedule,copyScheduledOrder,deliveryRemaining} from '../src/kitchen/supplier-orders.ts';
import {validateOrder} from '../src/kitchen/domain.ts';
import {validateReceipt} from '../src/kitchen/operations.ts';
import {supplierPdf} from '../src/kitchen/supplier-pdf.ts';
import {workspace,order,line,receipt} from './support/kitchen-data.mjs';
export const scheduled=()=>({...structuredClone(order),status:'Entwurf',recordedBy:null,recordedAt:null,deliveryDate:'2027-02-03',deliveries:[{id:'wed',date:'2027-02-03',time:'09–11 Uhr',place:'Küche'},{id:'fri',date:'2027-02-05',time:'Vormittag',place:'Küche'}],lines:[{...line,quantity:8,schedule:{wed:3,fri:5}}]});
test('a scheduled supplier order keeps two deliveries in one order and derives its total',()=>{
 const value=scheduled();value.lines[0].quantity=999;const ready=scheduledOrder(value);assert.equal(ready.lines[0].quantity,8);assert.equal(ready.deliveries.length,2);assert.equal(value.lines[0].quantity,999);
 value.lines[0].schedule.fri=null;assert.equal(scheduledOrder(value).lines[0].quantity,null,'unknown does not mean zero');
});
test('schedule validation rejects mismatched totals, orphan cells and impossible or repeated dates',()=>{
 validateOrder(scheduled());
 for(const mutate of [v=>v.lines[0].quantity=9,v=>v.lines[0].schedule.other=2,v=>v.deliveries[1].date='2027-02-30',v=>v.deliveries[1].date='2027-02-03',v=>v.deliveries[1].id='wed',v=>v.lines[0].schedule.wed=-1]){
  const value=scheduled();mutate(value);assert.throws(()=>validateOrder(value));
 }
 const missing=scheduled();missing.deliveries[0].date=null;missing.deliveryDate='2027-02-05';validateSchedule(missing);missing.status='Bestellt';assert.throws(()=>validateSchedule(missing),/Datum|Termin/);
});
test('per-delivery receiving cannot consume another days allowance',()=>{
 const value={...scheduled(),status:'Bestellt',recordedAt:order.recordedAt,recordedBy:order.recordedBy};
 assert.throws(()=>validateReceipt(value,receipt),/Liefertermin/);
 validateReceipt(value,{...receipt,deliveryId:'wed'});
 assert.throws(()=>validateReceipt(value,{...receipt,deliveryId:'wed',lines:[{lineId:'line',quantity:4}]}),/Restmenge|Termin/);
 value.receipts=[{...receipt,deliveryId:'wed'}];assert.equal(deliveryRemaining(value,'line','wed'),0);assert.equal(deliveryRemaining(value,'line','fri'),5);
});
test('annual copy requires explicit new dates and refreshes prices without carrying deliveries or contributions',()=>{
 const state=workspace();state.seasons.push({value:{id:'s2028',name:'2028',year:2028,archived:false}});
 const source={...scheduled(),contributions:[{planId:'old',articleId:'water',stockUse:2,incomingUse:0}],receipts:[]};
 assert.throws(()=>copyScheduledOrder(source,state.seasons.at(-1).value,'Küche',state,{}),/Termin|Datum/);
 const copy=copyScheduledOrder(source,state.seasons.at(-1).value,'Küche',state,{wed:'2028-02-23',fri:'2028-02-25'});
 assert.equal(copy.lines[0].quantity,8);assert.deepEqual(copy.lines[0].schedule,{wed:3,fri:5});assert.equal(copy.lines[0].priceNet,8.5);assert.equal(copy.lines[0].reviewed,false);assert.equal(copy.status,'Entwurf');assert.equal(copy.receipts,undefined);assert.equal(copy.contributions,undefined);assert.equal(copy.recordedAt,null);assert.equal(copy.deliveries[1].date,'2028-02-25');assert.equal(copyScheduledOrder(source,state.seasons.at(-1).value,'Küche',state,{wed:'2028-02-23',fri:'2028-02-25'}).id,copy.id);
});
test('supplier PDF contains all delivery columns and total but excludes internal planning notes',()=>{
 const value=scheduled();value.note='INTERNAL example-plan';value.supplierNote='Bitte am Seiteneingang liefern.';
 const bytes=supplierPdf(value,workspace().suppliers[0].value,'2026-10-26T12:00:00Z');const pdf=new TextDecoder('latin1').decode(bytes);
 assert.ok(pdf.startsWith('%PDF-'));assert.match(pdf,/03\.02\.2027/);assert.match(pdf,/05\.02\.2027/);assert.match(pdf,/Mineralwasser/);assert.match(pdf,/W12/);assert.match(pdf,/Seiteneingang/);assert.doesNotMatch(pdf,/INTERNAL|example-plan/);assert.match(pdf,/xref/);assert.match(pdf,/%%EOF/);
 const entries=pdf.match(/\d{10} 00000 n/g);for(const entry of entries){const offset=Number(entry.slice(0,10));assert.match(pdf.slice(offset,offset+25),/^\d+ 0 obj/);}
});
