import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {workspace,stored,order,line,inventory,inventoryLine} from './support/kitchen-data.mjs';
const scheduled=()=>({...structuredClone(order),status:'Entwurf',recordedBy:null,recordedAt:null,deliveries:[{id:'wed',date:'2027-02-03',time:'',place:'Küche'},{id:'fri',date:'2027-02-05',time:'',place:'Küche'}],deliveryDate:'2027-02-03',lines:[{...line,quantity:8,schedule:{wed:3,fri:5}}]});
function setup(state=workspace(),extra={}){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;const root=document.getElementById('app');const store={testMode:false,load:async()=>structuredClone(state),...extra};return{view:new KitchenView(root,store,'TEST Person'),root,state,dom};}
test('supplier matrix edits two days and persists one order with matching aggregate',async()=>{
 const state=workspace();state.orders=[stored(scheduled())];let saved;const {view,root}=setup(state,{saveOrder:async value=>{saved=structuredClone(value);state.orders=[stored(value)];return stored(value);}});await view.start();await view.action('order-edit','order');
 const form=root.querySelector('form[data-form=order]');assert.ok(form.querySelector('table'));form.querySelector('[name=schedule_line_wed]').value='4';form.querySelector('[name=schedule_line_fri]').value='6';await view.save(form);assert.equal(saved.lines[0].quantity,10);assert.deepEqual(saved.lines[0].schedule,{wed:4,fri:6});assert.equal(state.orders.length,1);assert.ok(root.querySelector('[data-action=order-pdf]'));
});
test('adding a delivery preserves entered cells and never creates another order',async()=>{
 const state=workspace();state.orders=[stored(scheduled())];const {view,root}=setup(state);await view.start();await view.action('order-edit','order');root.querySelector('[name=schedule_line_wed]').value='7';await view.action('delivery-add','');assert.equal(view.draft.lines[0].schedule.wed,7);assert.equal(view.draft.deliveries.length,3);assert.equal(state.orders.length,1);
});
test('annual copy asks for new dates and keeps all delivery quantities in one draft',async()=>{
 const state=workspace();const source=scheduled();source.seasonId='s2026';state.seasons.push(stored({id:'s2026',year:2026,name:'2026',archived:true}));state.orders=[stored(source)];let saved;const {view,root}=setup(state,{saveOrder:async value=>{saved=value;state.orders.push(stored(value));return stored(value);}});await view.start();await view.action('copy-pick','order');const form=root.querySelector('form[data-form=copy]');assert.ok(form.querySelector('[name=copydate_wed]'));assert.equal(form.querySelector('[name=copydate_wed]').value,'');form.querySelector('[name=copydate_wed]').value='2027-02-03';form.querySelector('[name=copydate_fri]').value='2027-02-05';await view.save(form);assert.equal(saved.deliveries.length,2);assert.equal(saved.lines[0].quantity,8);assert.equal(saved.sourceYear,2026);
});
test('date-specific receiving shows remaining amounts and fills only selected delivery',async()=>{
 const state=workspace();const o={...scheduled(),status:'Bestellt',recordedBy:order.recordedBy,recordedAt:order.recordedAt};state.orders=[stored(o)];let saved;const{view,root}=setup(state,{saveReceipt:async(previous,value)=>{saved=value;state.orders[0].value.receipts=[value];return state.orders[0];}});await view.start();await view.action('receipt-new','order|fri');await view.action('receipt-all','');assert.equal(root.querySelector('[name=received_line]').value,'5');await view.save(root.querySelector('form'));assert.equal(saved.deliveryId,'fri');assert.equal(saved.lines[0].quantity,5);
});
test('shared stock count saves per-article evening notes',async()=>{
 const state=workspace();state.inventories=[stored({...inventory,lines:[inventoryLine]})];let saved;const{view,root}=setup(state,{saveInventory:async value=>{saved=value;state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-edit','inventory');root.querySelector('[name=countnote_water]').value='Für Samstag zurücklegen';await view.saveInventory(root.querySelector('form'),false);assert.equal(saved.lines[0].note,'Für Samstag zurücklegen');
});
