import './react-loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {professionalFixture} from './fixtures/professional-state.ts';
import {projectEvent, applyEventOperation} from '../src/domain/event-context.ts';
import {receivingSelection, ordersForContext, savedSupplierLabel, receivingSuppliers} from '../src/ui/order-selection.ts';
import {buildReceivingList} from '../src/domain/receiving.ts';
import {kitchenEditingDisabled} from '../src/ui/kitchen-editing.ts';
import {receiptProposalLabel} from '../src/ui/receipt-display.ts';
import {receiptReadyForReview, createReceiptEdit} from '../src/ui/receipt-intake-draft.ts';
import {suppliedText} from '../src/ocr/receipt-parser.ts';
import {defaultPreferences} from '../src/data/preferences.ts';
const state = professionalFixture();
const closed = projectEvent(state, 'fixture-closed');
const props = {state, busy:false, readOnly:false, canClose:true, mode:'local', saveError:'', commit:async()=>true, go:()=>{}};
const html = (Component, extra={}) => renderToStaticMarkup(React.createElement(Component, {...props, ...extra}));

test('supplier/day context always owns its version; stale and disappeared IDs cannot select a foreign order',()=>{
 const before=JSON.stringify(state);
 for(const supplierId of ['supplier-a','supplier-b']) for(const day of ['Freitag','Samstag']) {
  const selected=receivingSelection(state,{supplierId,day,orderId:state.orders[0].id});
  assert.equal(selected.orders.length,2);
  assert.ok(selected.orders.every(order=>order.supplierId===supplierId&&order.day===day));
  assert.ok(selected.orders.some(order=>order.id===selected.orderId));
  for(const order of selected.orders) assert.equal(receivingSelection(state,{supplierId,day,orderId:order.id}).orderId,order.id);
 }
 const missing=receivingSelection(state,{supplierId:'deleted',day:'removed',orderId:'stale'});
 assert.ok(missing.orders.some(order=>order.id===missing.orderId));
 assert.equal(JSON.stringify(state),before);
});
test('all historical Friday/Saturday versions and 120/110/10 receiving evidence survive context switching',()=>{
 const first=ordersForContext(state,'supplier-a','Freitag')[0];
 assert.deepEqual(buildReceivingList(state,first.id).map(row=>[row.ordered,row.received,row.remaining]),[[120,110,10]]);
 const saturday=receivingSelection(state,{supplierId:'supplier-a',day:'Samstag',orderId:first.id});
 assert.notEqual(saturday.orderId,first.id);
 assert.equal(ordersForContext(state,'supplier-a','Samstag').length,2);
 const returned=receivingSelection(state,{supplierId:'supplier-a',day:'Freitag',orderId:first.id});
 assert.equal(returned.orderId,first.id);
 assert.deepEqual(buildReceivingList(state,returned.orderId).map(row=>[row.ordered,row.received,row.remaining]),[[120,110,10]]);
});
test('saved supplier names never silently become current names or raw IDs, even when current supplier is absent',()=>{
 const copy=structuredClone(state),order=copy.orders[0];
 copy.suppliers[0].name='Neuer Name';
 assert.match(savedSupplierLabel(copy,order),/Testmarkt Nord · gespeicherter Name/);
 delete order.context;
 assert.match(savedSupplierLabel(copy,order),/Neuer Name · heutiger Name, historisch nicht gespeichert/);
 copy.suppliers=copy.suppliers.filter(supplier=>supplier.id!==order.supplierId);
 assert.equal(savedSupplierLabel(copy,order),'Historischer Lieferant · Name nicht gespeichert');
 assert.ok(receivingSuppliers(copy).some(supplier=>supplier.id===order.supplierId));
});
test('closed culinary controls are disabled without globally locking reopen, export or preferences',async()=>{
 const {default:Planning}=await import('../src/screens/Planning.tsx');
 const {default:Masters}=await import('../src/screens/Masters.tsx');
 const {default:Orders}=await import('../src/screens/Orders.tsx');
 const {default:Deliveries}=await import('../src/screens/Deliveries.tsx');
 const {default:Receipts}=await import('../src/screens/Receipts.tsx');
 const {default:Analysis}=await import('../src/screens/Analysis.tsx');
 const {default:Settings}=await import('../src/screens/Settings.tsx');
 const planning=html(Planning,{state:closed});
 const quantityInputs=planning.match(/<input[^>]*aria-label="Geplante Portionen[^>]*>/g);
 assert.equal(quantityInputs.length,closed.menu.length*2);
 assert.ok(quantityInputs.every(input=>input.includes('disabled=""')));
 assert.match(html(Masters,{state:closed}),/<button[^>]*disabled=""[^>]*>[\s\S]*?Lieferant ergänzen/);
 assert.match(html(Orders,{state:closed,initialSupplier:'supplier-a'}),/<input[^>]*aria-label="Kartoffeln Freitag"[^>]*disabled=""/);
 assert.match(html(Deliveries,{state:closed}),/<button[^>]*disabled=""[^>]*>Tatsächliche Menge annehmen/);
 const receipts=html(Receipts,{state:closed,documents:{}});
 assert.match(receipts,/<button[^>]*disabled=""[^>]*>[\s\S]*?Beleg erfassen/);
 assert.match(receipts,/<button class="button secondary">Originale und Prüfentwürfe ansehen/);
 const analysis=html(Analysis,{state:closed});
 assert.match(analysis,/<button class="button secondary">Mit Grund wieder öffnen/);
 assert.match(analysis,/<button class="button secondary">CSV/);
 const settings=html(Settings,{state:closed,preferences:defaultPreferences,onPreferences:()=>{},canConfigure:true,canClose:true,storageBytes:100,onBackup:async()=>[]});
 assert.match(settings,/<fieldset disabled="">/);
 assert.match(settings,/<label>Startansicht<select>/);
 const reopened=applyEventOperation(state,'fixture-closed',{id:'reopen-for-ui',type:'event.reopen',baseRevision:state.revision,payload:{eventId:'fixture-closed',reason:'Synthetische Nachprüfung'}}).state;
 const openState=projectEvent(reopened,'fixture-closed');
 assert.equal(kitchenEditingDisabled({...props,state:openState}),false);
 assert.ok((html(Planning,{state:openState}).match(/<input[^>]*aria-label="Geplante Portionen[^>]*>/g)).every(input=>!input.includes('disabled=""')));
});
test('permissions and active saves still lock culinary fields in an open event',()=>{
 assert.equal(kitchenEditingDisabled(props),false);
 assert.equal(kitchenEditingDisabled({...props,readOnly:true}),true);
 assert.equal(kitchenEditingDisabled({...props,busy:true}),true);
 assert.equal(kitchenEditingDisabled({...props,state:closed}),true);
});
test('review step requires an acknowledged unchanged reviewed draft; dirty raw inputs and queued originals stay in editing',()=>{
 const draft={schemaVersion:1,id:'draft',eventId:state.event.id,source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,reviewStatus:'editing',pages:[],lines:[],header:{supplierId:'supplier-a',number:'TEST',date:'2026-10-19',scope:'Küche',grossCents:1234}};
 let edit=createReceiptEdit(draft),baseline=JSON.stringify(edit);
 assert.equal(receiptReadyForReview(edit,baseline,0),false);
 edit=createReceiptEdit({...draft,rowVersion:'2',reviewStatus:'reviewed'});baseline=JSON.stringify(edit);
 assert.equal(receiptReadyForReview(edit,baseline,0),true);
 assert.equal(receiptReadyForReview(edit,baseline,1),false);
 edit.raw.total='99,00';
 assert.equal(receiptReadyForReview(edit,baseline,0),false);
 assert.equal(edit.raw.total,'99,00');
});
test('proposal display localizes meaning without changing integer values or raw quotations',()=>{
 const assist=suppliedText('Testmarkt Nord\nRechnungsnummer TEST-7A\nRechnungsdatum 19.10.2026\nGesamt brutto 12,34 EUR',state.suppliers);
 const before=JSON.stringify(assist);
 const values=Object.fromEntries(assist.proposals.map(p=>[p.field,receiptProposalLabel(p,state.suppliers)]));
 assert.equal(values.supplierId,'Testmarkt Nord');assert.equal(values.date,'19.10.2026');assert.match(values.grossCents,/12,34\s€$/);
 assert.equal(JSON.stringify(assist),before);
 assert.equal(assist.proposals.find(p=>p.field==='grossCents').value,'1234');
});
test('fresh intake has no empty final acceptance section; closed intake still permits reading saved drafts',async()=>{
 const {default:ReceiptIntake}=await import('../src/screens/ReceiptIntake.tsx');
 const markup=html(ReceiptIntake,{state:closed,documents:{list:async()=>({documents:[],drafts:[]})},onClose:()=>{}});
 assert.doesNotMatch(markup,/Geprüften Beleg übernehmen/);
 assert.match(markup,/<button class="button secondary" disabled="">Neuen Prüfentwurf beginnen/);
 assert.match(markup,/<button class="button secondary">Zurück zu Belegen/);
});
