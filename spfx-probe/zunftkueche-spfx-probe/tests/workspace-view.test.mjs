import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {workspace,stored,inventory,inventoryLine,article,receipt} from './support/kitchen-data.mjs';
function setup(state=workspace(),extra={}){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;const root=document.getElementById('app');const store={testMode:false,load:async()=>structuredClone(state),...extra};return {view:new KitchenView(root,store,'TEST Person'),root,store,state,dom};}
test('the selected workspace exposes task navigation and real receiving work',async()=>{
 const {view,root}=setup();await view.start();assert.ok(root.querySelector('aside'));assert.match(root.textContent,/Bestellungen/);assert.match(root.textContent,/Lieferung annehmen/);assert.ok(root.querySelector('[data-action=receipt-new]'));assert.match(root.textContent,/Noch nicht gezählt/);
});
test('inventory starts without a hidden inherited search filter',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));const {view,root,dom}=setup(state);await view.start();await view.action('nav','stock');const search=root.querySelector('[name=workspaceSearch]');search.value='Salz';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await view.action('inventory-new','');assert.equal(root.querySelector('[name=workspaceSearch]').value,'');assert.equal(root.querySelector('[data-search="Mineralwasser"]').hidden,false);
});
test('articles without a distinct pack have one quantity field and accept decimal quantities',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));let saved;const {view,root}=setup(state,{saveInventory:async value=>{saved=structuredClone(value);state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-new','');const form=root.querySelector('form[data-form=inventory]');assert.equal(form.querySelector('[name=packs_salt]')?.type,'hidden');form.querySelector('[name=loose_salt]').value='0,25';await view.saveInventory(form,false);assert.equal(saved.lines.find(l=>l.articleId==='salt').loose,.25);
});
test('unchanged saved quantities retain their counter and timestamp when a draft is completed',async()=>{
 const state=workspace();state.inventories=[stored({...inventory,lines:[{...inventoryLine,countedAt:'2026-10-25T18:00:00Z',countedBy:'Original counter'}]})];let saved;const {view,root,dom}=setup(state,{saveInventory:async value=>{saved=structuredClone(value);state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-edit','inventory');await view.saveInventory(root.querySelector('form'),true,true);assert.equal(saved.lines[0].countedAt,'2026-10-25T18:00:00Z');assert.equal(saved.lines[0].countedBy,'Original counter');
 state.inventories=[stored({...inventory,lines:[{...inventoryLine,countedAt:'2026-10-25T18:00:00Z',countedBy:'Original counter'}]})];await view.action('reload','');await view.action('inventory-edit','inventory');const input=root.querySelector('[name=loose_water]');input.value='3';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await view.saveInventory(root.querySelector('form'),false);assert.equal(saved.lines[0].countedBy,'TEST Person');assert.notEqual(saved.lines[0].countedAt,'2026-10-25T18:00:00Z','an explicit recount also refreshes an unchanged quantity');
});
test('a counting draft resumes from stored values without affecting observed stock',async()=>{
 const state=workspace();state.inventories=[stored(inventory)];const {view,root}=setup(state);await view.start();assert.doesNotMatch(root.textContent,/27 Flasche/);await view.action('inventory-edit','inventory');assert.equal(root.querySelector('[name=packs_water]').value,'2');assert.equal(root.querySelector('[name=loose_water]').value,'3');
});
test('saving a counting draft preserves explicit zero and blank rows independently',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));let saved;const {view,root}=setup(state,{saveInventory:async value=>{saved=structuredClone(value);state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-new','');const form=root.querySelector('form[data-form=inventory]');form.querySelector('[name=packs_water]').value='0';await view.saveInventory(form,false);assert.equal(saved.lines[0].packs,0);assert.equal(saved.lines[1].packs,null);assert.equal(saved.status,'Entwurf');assert.equal(state.counts.length,0);
});
test('partial counting is reviewed explicitly before completion',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));let calls=0;const {view,root}=setup(state,{saveInventory:async value=>{calls++;state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-new','');const form=root.querySelector('form[data-form=inventory]');form.querySelector('[name=loose_water]').value='24';await view.saveInventory(form,true);assert.equal(calls,0);assert.match(root.textContent,/Teilzählung abschließen/);await view.saveInventory(form,true,true);assert.equal(calls,1);assert.equal(state.inventories[0].value.status,'Abgeschlossen');assert.ok(state.inventories[0].value.completedAt);
});
test('receiving retries freeze the entered quantity and original audit time',async()=>{
 const state=workspace(),attempts=[];const {view,root}=setup(state,{saveReceipt:async(previous,value)=>{attempts.push(structuredClone(value));if(attempts.length===1)throw new Error('Antwort verloren');state.orders[0].value.receipts=[value];return state.orders[0];}});await view.start();await view.action('receipt-new','order');const form=root.querySelector('form[data-form=receipt]');form.querySelector('[name=received_line]').value='3';await view.save(form);assert.ok(root.querySelector('[data-action=save-retry]'));await view.action('save-retry','');assert.deepEqual(attempts[0],attempts[1]);assert.equal(state.orders[0].value.receipts.length,1);assert.match(root.textContent,/Teilgeliefert/);
});
test('closing an order with missing quantities asks for explicit confirmation',async()=>{
 let writes=0;const {view,root}=setup(workspace(),{saveOrder:async()=>{writes++;}});await view.start();await view.action('order-open','order');await view.action('order-close','order');assert.equal(writes,0);assert.match(root.textContent,/offen|fehl|vollständig/i);assert.ok(root.querySelector('[data-action=order-close-confirm]'));
});
test('a follow-up order never includes earlier receiving records',async()=>{
 const state=workspace();state.orders[0].value.receipts=[receipt];const {view}=setup(state);await view.start();await view.action('order-follow','order');assert.equal(view.draft.receipts?.length||0,0);
});
