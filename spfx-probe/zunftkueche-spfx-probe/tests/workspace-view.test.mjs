import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {workspace,stored,inventory,inventoryLine,article,receipt} from './support/kitchen-data.mjs';
import { readInventory, saveInventory } from '../src/kitchen/actions/count-actions.ts';
function setup(state=workspace(),extra={}){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;const root=document.getElementById('app');const store={testMode:false,load:async()=>structuredClone(state),...extra};return {view:new KitchenView(root,store,'TEST Person'),root,store,state,dom};}
test('settings provide existing season, delivery configuration, safe backup and clearly labelled provider information',async()=>{
 const {view,root}=setup();await view.start();await view.action('nav','management');
 assert.match(root.textContent,/Saison und Einsatztage/);assert.ok(root.querySelector('[data-action=season-edit]'));assert.equal(root.querySelector('[data-action=ww-open][data-id=slots]'),null);
 assert.match(root.textContent,/Wiederherstellung.*nicht direkt in der App/);assert.match(root.textContent,/Datensicherung/);assert.ok(root.querySelector('[data-action=ww-backup]'));
 assert.match(root.textContent,/Impressum/);assert.equal(root.querySelector('a[href="https://schelmenzunft.de/impressum/"]')?.textContent,'Impressum');
 assert.match(root.textContent,/Datenschutzerklärung der Website/);assert.match(root.textContent,/Neue Kassen- und Menüimporte.*Originaldatei/);
});
test('article rows visibly communicate that they open details',async()=>{const {view,root}=setup();await view.start();await view.action('nav','articles');const summary=root.querySelector('.article-list-row summary');assert.match(summary.textContent,/Getränkemarkt\s*ansehen/,'Lieferant steht in der Zeile, „ansehen“ für Vorlesehilfen');const details=summary.closest('details');assert.ok(details.querySelector('[data-action=article-edit]'));assert.ok(details.querySelector('[data-action=offer-new]'));});
test('the selected workspace exposes task navigation and real receiving work',async()=>{
 const {view,root}=setup();await view.start();assert.ok(root.querySelector('aside'));assert.match(root.textContent,/Bestellungen/);assert.ok(root.querySelector('[data-action=delivery-list]'));assert.match(root.textContent,/0 von 1 Artikeln zuletzt gezählt/);await view.action('delivery-list','');assert.ok(root.querySelector('[data-action=receipt-new]'));
});
test('inventory starts without a hidden inherited search filter',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));const {view,root,dom}=setup(state);await view.start();await view.action('nav','stock');const search=root.querySelector('[name=workspaceSearch]');search.value='Salz';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await view.action('inventory-new','');assert.equal(root.querySelector('[name=workspaceSearch]').value,'');assert.equal(root.querySelector('[data-search="Mineralwasser"]').hidden,false);
});
test('articles without a distinct pack have one quantity field and accept decimal quantities',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));let saved;const {view,root}=setup(state,{saveInventory:async value=>{saved=structuredClone(value);state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-new','');const form=root.querySelector('form[data-form=inventory]');assert.equal(form.querySelector('[name=packs_salt]')?.type,'hidden');form.querySelector('[name=loose_salt]').value='0,25';await saveInventory(view, form,false);assert.equal(saved.lines.find(l=>l.articleId==='salt').loose,.25);
});
test('unchanged saved quantities retain their counter and timestamp when a draft is completed',async()=>{
 const state=workspace();state.inventories=[stored({...inventory,lines:[{...inventoryLine,countedAt:'2026-10-25T18:00:00Z',countedBy:'Original counter'}]})];let saved;const {view,root,dom}=setup(state,{saveInventory:async value=>{saved=structuredClone(value);state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-edit','inventory');await saveInventory(view, root.querySelector('form'),true,true);assert.equal(saved.lines[0].countedAt,'2026-10-25T18:00:00Z');assert.equal(saved.lines[0].countedBy,'Original counter');
 state.inventories=[stored({...inventory,lines:[{...inventoryLine,countedAt:'2026-10-25T18:00:00Z',countedBy:'Original counter'}]})];await view.action('reload','');await view.action('inventory-edit','inventory');const input=root.querySelector('[name=loose_water]');input.value='3';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await saveInventory(view, root.querySelector('form'),false);assert.equal(saved.lines[0].countedBy,'TEST Person');assert.notEqual(saved.lines[0].countedAt,'2026-10-25T18:00:00Z','an explicit recount also refreshes an unchanged quantity');
});
test('a counting draft resumes from stored values without affecting observed stock',async()=>{
 const state=workspace();state.inventories=[stored(inventory)];const {view,root}=setup(state);await view.start();assert.doesNotMatch(root.textContent,/27 Flasche/);await view.action('inventory-edit','inventory');assert.equal(root.querySelector('[name=packs_water]').value,'2');assert.equal(root.querySelector('[name=loose_water]').value,'3');
});
test('saving a counting draft preserves explicit zero and blank rows independently',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));let saved;const {view,root}=setup(state,{saveInventory:async value=>{saved=structuredClone(value);state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-new','');const form=root.querySelector('form[data-form=inventory]');form.querySelector('[name=packs_water]').value='0';await saveInventory(view, form,false);assert.equal(saved.lines[0].packs,0);assert.equal(saved.lines[1].packs,null);assert.equal(saved.status,'Entwurf');assert.equal(state.counts.length,0);
});
test('partial counting is reviewed explicitly before completion',async()=>{
 const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));let calls=0;const {view,root}=setup(state,{saveInventory:async value=>{calls++;state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-new','');const form=root.querySelector('form[data-form=inventory]');form.querySelector('[name=loose_water]').value='24';await saveInventory(view, form,true);assert.equal(calls,0);assert.match(root.textContent,/Trotzdem abschließen/);await saveInventory(view, form,true,true);assert.equal(calls,1);assert.equal(state.inventories[0].value.status,'Abgeschlossen');assert.ok(state.inventories[0].value.completedAt);
});
test('receiving retries freeze the entered quantity and original audit time',async()=>{
 const state=workspace(),attempts=[];const {view,root}=setup(state,{saveReceipt:async(previous,value)=>{attempts.push(structuredClone(value));if(attempts.length===1)throw new Error('Antwort verloren');state.orders[0].value.receipts=[value];return state.orders[0];}});await view.start();await view.action('receipt-new','order');const form=root.querySelector('form[data-form=receipt]');form.querySelector('[name=received_line]').value='3';await view.save(form);assert.ok(root.querySelector('[data-action=save-retry]'));await view.action('save-retry','');assert.deepEqual(attempts[0],attempts[1]);assert.equal(state.orders[0].value.receipts.length,1);assert.match(root.textContent,/Teilgeliefert/);
});
test('a missing delivery saves a note without creating a receipt and remains visible',async()=>{
 const state=workspace();const receiptCount=state.orders[0].value.receipts?.length||0;let saved;const {view,root}=setup(state,{saveDeliveryNote:async(previous,value)=>{saved=structuredClone(value);state.orders[0].value.deliveryNotes=[value];return state.orders[0];}});await view.start();await view.action('receipt-new','order');const form=root.querySelector('form[data-form=receipt]');assert.ok(form.querySelector('[data-action=receipt-missing]'));form.querySelector('[name=note]').value='Fahrer kommt morgen';await view.action('receipt-missing','');assert.equal(saved.note,'Fahrer kommt morgen');assert.equal(state.orders[0].value.receipts?.length||0,receiptCount);assert.match(root.textContent,/Keine Lieferung|Fahrer kommt morgen/);
});
test('closing an order with missing quantities asks for explicit confirmation',async()=>{
 let writes=0;const {view,root}=setup(workspace(),{saveOrder:async()=>{writes++;}});await view.start();await view.action('order-open','order');await view.action('order-close','order');assert.equal(writes,0);assert.match(root.textContent,/offen|fehl|vollständig/i);assert.ok(root.querySelector('[data-action=order-close-confirm]'));
});
test('a follow-up order never includes earlier receiving records',async()=>{
 const state=workspace();state.orders[0].value.receipts=[receipt];state.orders[0].value.deliveryNotes=[{id:'missing',recordedAt:'2026-10-25T10:00:00Z',recordedBy:'Test',note:'Nicht geliefert'}];const {view}=setup(state);await view.start();await view.action('order-follow','order');assert.equal(view.draft.receipts?.length||0,0);assert.equal(view.draft.deliveryNotes?.length||0,0);
});
test('Bestellungen: Lieferanten ohne Bestellung stehen zum Beginnen bereit, vorhandene nicht doppelt',async()=>{
 const withOrder=workspace();const first=setup(withOrder);await first.view.start();await first.view.action('order-round','');
 assert.ok(first.root.querySelector('[data-action=order-open]'),'vorhandene Bestellung steht in der Liste');assert.equal(first.root.querySelector('.order-pending [data-action=order-new][data-id=sup]'),null);
 const state=workspace();state.orders=[];const {view,root}=setup(state);await view.start();await view.action('order-round','');assert.match(root.textContent,/Noch ohne Bestellung/);assert.match(root.querySelector('.seg-tabs [aria-current=page]').textContent,/Nach Lieferant/);assert.ok(root.querySelector('[data-action=order-new][data-id=sup]'));await view.action('order-new','sup');assert.equal(view.draft.supplierId,'sup');assert.equal(view.draft.supplierName,'Getränkemarkt');assert.ok(root.querySelector('form[data-form=order]'));
});
test('count progress follows the visible seasonal selection while hidden articles stay unknown',async()=>{const state=workspace();state.articles.push(stored({...article,id:'salt',name:'Salz',unit:'kg'}));const {view,root,dom}=setup(state);await view.start();await view.action('inventory-new','');assert.match(root.querySelector('[data-count-progress]').textContent,/0 von 1 angezeigten Artikeln/);const input=root.querySelector('[name=packs_water]');input.value='0';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.match(root.querySelector('[data-count-progress]').textContent,/1 von 1 angezeigten Artikeln/);const value=readInventory(view, root.querySelector('form'));assert.equal(value.lines.find(l=>l.articleId==='salt').loose,null);assert.equal(value.lines.find(l=>l.articleId==='water').packs,0);});

test('order rows open by supplier name through a single native button', async () => {
 const {view,root}=setup();await view.start();await view.action('nav','orders');
 const row=root.querySelector('.order-table-row');
 const entry=row.querySelector('button[data-action=order-open]');
 assert.equal(row.querySelectorAll('button').length,1);
 assert.equal(entry.textContent,workspace().orders[0].value.supplierName);
 assert.equal(row.children.length,4);
 await view.action(entry.dataset.action,entry.dataset.id);
 assert.equal(root.querySelector('main h1').textContent,entry.textContent);
});

test('two offers of the same article retain their own supplier, pack and price in the comparison', async () => {
 const state=workspace();
 const first=state.offers[0].value;
 state.suppliers.push(stored({...state.suppliers[0].value,id:'vergleich',name:'Zweiter Anbieter'}));
 state.offers.push(stored({...first,id:'zweites-angebot',supplierId:'vergleich',packName:'Karton',packSize:6,priceNet:null,priceDate:null}));
 const {view,root}=setup(state);await view.start();await view.action('nav','articles');
 const table=root.querySelector('.article-offers');
 assert.deepEqual([...table.querySelectorAll('thead th')].slice(0,3).map(cell=>cell.textContent),['Lieferant','Gebinde','Preis je Gebinde']);
 const rows=[...table.tBodies[0].rows];
 assert.equal(rows.length,2);
 assert.match(rows[0].cells[2].textContent,/8,50.*netto/);
 assert.equal(rows[1].cells[0].textContent,'Zweiter Anbieter');
 assert.match(rows[1].cells[1].textContent,/Karton.*6/);
 assert.equal(rows[1].cells[2].textContent,'Preis offen');
 assert.equal(rows[1].querySelector('[data-action=offer-edit]').dataset.id,'zweites-angebot');
});
