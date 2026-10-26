import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergePlanOrders} from '../src/kitchen/ww/plan-procurement.ts';
import {withSchedule} from '../src/kitchen/supplier-orders.ts';
import {state,stored,base,recipe,slot} from './support/ww-data.mjs';
const plan={...base('plan','plan'),name:'Abend',area:'Küche',date:'2027-02-12',lines:[{recipeId:recipe.id,portions:100}],note:''};
function fixture(){const s=state();s.ww={ready:true,records:[stored(recipe),stored(slot)]};const draft=withSchedule({...s.orders[0].value,status:'Entwurf',deliveryDate:slot.date,recordedAt:null,recordedBy:null});draft.deliveries[0].id='existing-date';draft.lines[0].schedule={'existing-date':8};s.orders=[stored(draft)];return s;}
const allocations=[{articleId:'water',offerId:'offer',stockUse:0,incomingUse:0}];
test('recipe demand joins an explicitly selected supplier draft and is replaced on repeat',()=>{
 const s=fixture();const merged=mergePlanOrders(plan,slot,s,allocations,{sup:'order'});assert.equal(merged.length,1);assert.equal(merged[0].id,'order');assert.equal(merged[0].lines[0].quantity,10);assert.equal(merged[0].deliveries.length,1);assert.equal(merged[0].lines[0].sources[0].quantity,2);
 s.orders=[stored(merged[0])];const repeat=mergePlanOrders(plan,slot,s,allocations,{sup:'order'});assert.equal(repeat[0].lines[0].quantity,10,'same recipe demand is not added twice');
 const changed=mergePlanOrders({...plan,lines:[{recipeId:recipe.id,portions:180}]},slot,s,allocations,{sup:'order'});assert.equal(changed[0].lines[0].quantity,11,'8 manual plus 3 recipe crates');
});
test('removing recipe demand preserves manually planned quantities',()=>{
 const s=fixture();s.orders=[stored(mergePlanOrders(plan,slot,s,allocations,{sup:'order'})[0])];const zero=mergePlanOrders({...plan,lines:[{recipeId:recipe.id,portions:0}]},slot,s,allocations,{sup:'order'});assert.equal(zero[0].lines[0].quantity,8);
});
test('stock allocated to another plan is not available again and ordered records are immutable',()=>{
 const s=fixture();s.counts=[stored({id:'count',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Wasser',unit:'Flasche',quantity:10,countedAt:'2026-10-26T10:00:00Z',countedBy:'TEST',note:'',reorder:false})];s.orders[0].value.contributions=[{planId:'other-plan',articleId:'water',stockUse:8,incomingUse:0}];
 assert.throws(()=>mergePlanOrders(plan,slot,s,[{...allocations[0],stockUse:5}],{sup:'order'}),/Bestand|verplant|angerechnet/);
 s.orders[0].value.status='Bestellt';assert.throws(()=>mergePlanOrders(plan,slot,s,allocations,{sup:'order'}),/Entwurf/);
});
test('an additional delivery extends the same draft while ambiguous targets require a decision',()=>{
 const s=fixture();const later={...slot,id:'friday',date:'2027-02-10'};const merged=mergePlanOrders(plan,later,s,allocations,{sup:'order'});assert.equal(merged[0].id,'order');assert.equal(merged[0].deliveries.length,2);assert.equal(merged[0].lines[0].schedule.friday,2);assert.equal(merged[0].lines[0].schedule['existing-date'],8);
 assert.throws(()=>mergePlanOrders(plan,later,s,allocations,{}),/Bestellung|Entwurf|wählen/);
});
test('stock-only demand still records an allocation and combined availability prevents double use after incoming receipt',async()=>{
 const mod=await import('../src/kitchen/ww/plan-procurement.ts');assert.equal(typeof mod.procurementReservation,'function');const s=fixture();s.counts=[stored({id:'count',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Wasser',unit:'Flasche',quantity:20,countedAt:'2026-10-26T10:00:00Z',countedBy:'TEST',note:'',reorder:false})];const allocation=[{...allocations[0],stockUse:20}];const doc=mod.procurementReservation(plan,allocation,s);assert.equal(doc.entries[0].stockUse,20);s.ww.records.push(stored(doc));assert.throws(()=>mergePlanOrders({...plan,id:'second'},slot,s,[{...allocations[0],stockUse:1}],{sup:'order'}),/Bestand|verplant|angerechnet/);
});
