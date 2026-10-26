import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as ops from '../src/kitchen/operations.ts';
import {copyOrder} from '../src/kitchen/domain.ts';
import {season,supplier,article,offer,order,receipt,inventory,inventoryLine,workspace,stored} from './support/kitchen-data.mjs';
const fn=name=>{assert.equal(typeof ops[name],'function',name+' must be implemented');return ops[name];};
test('partial receipts expose remaining quantities without changing ordered amounts',()=>{
 const quantity=fn('receivedQuantity'),status=fn('deliveryState');const value={...order,receipts:[receipt]};
 assert.equal(quantity(value,'line'),3);assert.equal(status(value),'Teilgeliefert');assert.equal(order.lines[0].quantity,8);
 assert.equal(status({...order,receipts:[{...receipt,lines:[{lineId:'line',quantity:8}]}]}),'Vollständig geliefert');
});
test('receipt validation rejects excess, empty, duplicate and foreign position entries',()=>{
 const validate=fn('validateReceipt');validate(order,receipt);
 assert.throws(()=>validate({...order,receipts:[receipt]},{...receipt,id:'second',lines:[{lineId:'line',quantity:6}]}),/Rest|mehr|überschreitet/);
 assert.throws(()=>validate(order,{...receipt,lines:[{lineId:'missing',quantity:1}]}),/position/i);
 assert.throws(()=>validate(order,{...receipt,lines:[{lineId:'line',quantity:1},{lineId:'line',quantity:1}]}),/Doppel/);
 assert.throws(()=>validate(order,{...receipt,lines:[{lineId:'line',quantity:0}]}),/Menge/);
 assert.throws(()=>validate({...order,status:'Entwurf'},receipt),/bestellt|aufgegeben/);
});
test('prior-year copies never inherit receipts from the original order',()=>{
 const source={...order,receipts:[receipt]};const copied=copyOrder(source,{...season,id:'next',year:2028},'Küche',{seasons:[season,{...season,id:'next',year:2028}],suppliers:[supplier],articles:[article],offers:[offer]},{line:9});
 assert.equal(copied.receipts?.length||0,0);assert.equal(source.receipts.length,1);
});
test('counting distinguishes blank from zero and converts packs plus loose units',()=>{
 const quantity=fn('countQuantity');assert.equal(quantity(null,null,12),null);assert.equal(quantity(0,null,12),0);assert.equal(quantity(2,3,12),27);assert.equal(quantity(null,.25,1),.25);
 assert.throws(()=>quantity(.5,0,12),/ganze|Gebinde/);assert.throws(()=>quantity(1,-1,12),/Menge/);
});
test('draft inventories are not observations and unfinished rows never become zero counts',()=>{
 const observed=fn('observedCounts');const state=workspace();state.inventories=[stored(inventory)];assert.equal(observed(state).length,0);
 state.inventories=[stored({...inventory,status:'Abgeschlossen',completedAt:'2026-10-26T14:00:00Z',lines:[inventoryLine,{...inventoryLine,articleId:'salt',articleName:'Salz',packs:null,loose:null}]})];
 const counts=observed(state);assert.equal(counts.length,1);assert.equal(counts[0].quantity,27);assert.equal(counts[0].countedAt,inventory.createdAt);
});
test('completing an old draft preserves observation time and cannot replace a newer count',()=>{
 const state=workspace();state.counts=[stored({id:'fresh',seasonId:inventory.seasonId,area:inventory.area,articleId:'water',articleName:'Mineralwasser',unit:'Flasche',quantity:5,countedAt:'2026-10-26T14:00:00Z',countedBy:'Fresh counter',note:'',reorder:false})];
 state.inventories=[stored({...inventory,status:'Abgeschlossen',completedAt:'2026-10-27T18:00:00Z',countedBy:'Finisher',lines:[{...inventoryLine,countedAt:'2026-10-26T13:00:00Z',countedBy:'Original counter'}]})];
 assert.equal(ops.latestCounts(state,inventory.seasonId,inventory.area)[0].quantity,5);
 const historical=ops.observedCounts(state).find(c=>c.id==='inventory:water');assert.equal(historical.countedBy,'Original counter');assert.equal(historical.countedAt,'2026-10-26T13:00:00Z');
 delete state.inventories[0].value.lines[0].countedAt;delete state.inventories[0].value.lines[0].countedBy;
 assert.equal(ops.latestCounts(state,inventory.seasonId,inventory.area)[0].quantity,5,'legacy drafts conservatively retain their start time');
});
test('inventory validation rejects duplicate articles and empty completion',()=>{
 const validate=fn('validateInventory');validate(inventory);
 assert.throws(()=>validate({...inventory,lines:[inventoryLine,inventoryLine]}),/Doppel/);
 assert.throws(()=>validate({...inventory,status:'Abgeschlossen',completedAt:'2026-10-26T14:00:00Z',lines:[{...inventoryLine,packs:null,loose:null}]}),/Menge|gezählt/);
});
