import {test} from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';
import {workspace,stored,order,line,inventory,inventoryLine} from './support/kitchen-data.mjs';
import { saveInventory } from '../src/kitchen/actions/count-actions.ts';
const scheduled=()=>({...structuredClone(order),status:'Entwurf',recordedBy:null,recordedAt:null,deliveries:[{id:'wed',date:'2027-02-03',time:'',place:'Küche'},{id:'fri',date:'2027-02-05',time:'',place:'Küche'}],deliveryDate:'2027-02-03',lines:[{...line,quantity:8,schedule:{wed:3,fri:5}}]});
function setup(state=workspace(),extra={}){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test/'});for(const name of ['document','Element','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;const root=document.getElementById('app');const store={testMode:false,load:async()=>structuredClone(state),...extra};return{view:new KitchenView(root,store,'TEST Person'),root,state,dom};}
test('supplier matrix edits two days and persists one order with matching aggregate',async()=>{
 const state=workspace();state.orders=[stored(scheduled())];let saved;const {view,root}=setup(state,{saveOrder:async value=>{saved=structuredClone(value);state.orders=[stored(value)];return stored(value);}});await view.start();await view.action('order-edit','order');
 const form=root.querySelector('form[data-form=order]');assert.ok(form.querySelector('table'));form.querySelector('[name=schedule_line_wed]').value='4';form.querySelector('[name=schedule_line_fri]').value='6';await view.save(form);assert.equal(saved.lines[0].quantity,10);assert.deepEqual(saved.lines[0].schedule,{wed:4,fri:6});assert.equal(state.orders.length,1);assert.ok(root.querySelector('[data-action=order-mail]'));assert.ok(root.querySelector('[data-action=order-mark].primary'),'Entwurf: Als bestellt markieren ist der Hauptknopf');
});
test('adding a delivery preserves entered cells and never creates another order',async()=>{
 const state=workspace();state.orders=[stored(scheduled())];const {view,root}=setup(state);await view.start();await view.action('order-edit','order');root.querySelector('[name=schedule_line_wed]').value='7';await view.action('delivery-add','');assert.equal(view.draft.lines[0].schedule.wed,7);assert.equal(view.draft.deliveries.length,3);assert.equal(state.orders.length,1);
});
test('PDF und E-Mail-Text: speichert den Entwurf zuerst, hält interne Hinweise zurück und lässt weiterarbeiten', async () => {
    const state = workspace();
    const source = { ...scheduled(), occasion: 'Fasnet & Küche', note: 'INTERN – keine Weitergabe', supplierNote: 'Bitte am Seiteneingang liefern.' };
    state.orders = [stored(source)];
    state.suppliers[0].value.email = 'bestellung+fasnet@example.invalid';
    let writes = 0;
    const { view, root } = setup(state, { saveOrder: async value => { writes++; state.orders = [stored(structuredClone(value))]; return stored(value); } });
    await view.start();
    await view.action('order-edit', source.id);
    root.querySelector('[name=schedule_line_wed]').value = '4';
    await view.action('order-review', '');
    await assert.rejects(view.action('order-preview-mail', ''), /Mengen und Gebinde geprüft/);
    assert.equal(writes, 0);
    root.querySelector('[name=reviewAll]').checked = true;
    await view.action('order-preview-mail', '');
    assert.equal(writes, 1, 'der Entwurf ist gespeichert, bevor die Versandseite erscheint');
    assert.equal(view.dirty, false, 'die Versandseite ist keine Sackgasse mit ungespeicherten Eingaben');
    assert.equal(state.orders[0].value.status, 'Entwurf');
    const message = root.querySelector('[data-order-mail] textarea').value;
    assert.match(message, /03\.02\.2027[\s\S]*– 4 [\s\S]*05\.02\.2027[\s\S]*– 5 /);
    assert.doesNotMatch(message, /Gebinde à/);
    assert.match(message, /Seiteneingang/);
    assert.doesNotMatch(message, /INTERN|Weitergabe/);
    const link = new URL(root.querySelector('[data-order-mail] a').getAttribute('href'));
    assert.equal(decodeURIComponent(link.pathname), 'bestellung+fasnet@example.invalid');
    assert.match(link.searchParams.get('subject'), /Fasnet & Küche/);
    assert.ok(root.querySelector('[data-action=order-dispatch-pdf]'));
    assert.ok(root.querySelector('[data-order-mail] [data-action=order-mark]'), 'von hier aus als bestellt markieren');
    await view.action('nav', 'heute');
    assert.doesNotMatch(root.querySelector('[data-status]').textContent, /Ungespeicherte/);
    await view.action('order-edit', source.id);
    assert.equal(root.querySelector('[name=schedule_line_wed]').value, '4');
});
test('Als bestellt markieren: fragt einmal nach und speichert dann den Status', async () => {
    const state = workspace();
    const source = scheduled();
    source.lines = source.lines.map(l => ({ ...l, reviewed: true }));
    state.orders = [stored(source)];
    let saved;
    const { view, root } = setup(state, { saveOrder: async value => { saved = structuredClone(value); state.orders = [stored(saved)]; return stored(value); } });
    await view.start();
    await view.action('order-open', source.id);
    await view.action('order-mark', source.id);
    assert.equal(saved, undefined, 'erst nach der Rückfrage');
    assert.match(root.querySelector('[data-order-confirm]').textContent, /beim Lieferanten aufgegeben/);
    await view.action('order-mark-confirm', source.id);
    assert.equal(saved.status, 'Bestellt');
    assert.ok(saved.recordedAt && saved.recordedBy);
});
test('a legacy telephone order exposes only the supplier-facing notes in its order text', async () => {
    const state = workspace();
    const legacy = { ...order, deliveryDate: '2027-02-05', note: 'INTERN', supplierNote: 'Hintereingang' };
    state.orders = [stored(legacy)];
    const { view, root } = setup(state);
    await view.start();
    await view.action('order-open', legacy.id);
    await view.action('order-text', legacy.id);
    const text = root.querySelector('[data-order-text]').textContent;
    assert.match(text, /05\.02\.2027/);
    assert.match(text, /Hintereingang/);
    assert.doesNotMatch(text, /INTERN/);
});
test('annual copy asks for new dates and keeps all delivery quantities in one draft',async()=>{
 const state=workspace();const source=scheduled();source.seasonId='s2026';state.seasons.push(stored({id:'s2026',year:2026,name:'2026',archived:true}));state.orders=[stored(source)];let saved;const {view,root}=setup(state,{saveOrder:async value=>{saved=value;state.orders.push(stored(value));return stored(value);}});await view.start();await view.action('copy-pick','order');const form=root.querySelector('form[data-form=copy]');assert.ok(form.querySelector('[name=copydate_wed]'));assert.equal(form.querySelector('[name=copydate_wed]').value,'');form.querySelector('[name=copydate_wed]').value='2027-02-03';form.querySelector('[name=copydate_fri]').value='2027-02-05';await view.save(form);assert.equal(saved.deliveries.length,2);assert.equal(saved.lines[0].quantity,8);assert.equal(saved.sourceYear,2026);
});
test('date-specific receiving shows remaining amounts and fills only selected delivery',async()=>{
 const state=workspace();const o={...scheduled(),status:'Bestellt',recordedBy:order.recordedBy,recordedAt:order.recordedAt};state.orders=[stored(o)];let saved;const{view,root}=setup(state,{saveReceipt:async(previous,value)=>{saved=value;state.orders[0].value.receipts=[value];return state.orders[0];}});await view.start();await view.action('receipt-new','order|fri');await view.action('receipt-all','');assert.equal(root.querySelector('[name=received_line]').value,'5');await view.save(root.querySelector('form'));assert.equal(saved.deliveryId,'fri');assert.equal(saved.lines[0].quantity,5);
});
test('shared stock count saves per-article evening notes',async()=>{
 const state=workspace();state.inventories=[stored({...inventory,lines:[inventoryLine]})];let saved;const{view,root}=setup(state,{saveInventory:async value=>{saved=value;state.inventories=[stored(value)];return stored(value);}});await view.start();await view.action('inventory-edit','inventory');root.querySelector('[name=countnote_water]').value='Für Samstag zurücklegen';await saveInventory(view, root.querySelector('form'),false);assert.equal(saved.lines[0].note,'Für Samstag zurücklegen');
});
test('filtering delivery days keeps hidden quantities when saving',async()=>{
 const state=workspace();state.orders=[stored(scheduled())];let saved;const {view,root,dom}=setup(state,{saveOrder:async value=>{saved=structuredClone(value);state.orders=[stored(value)];return stored(value);}});await view.start();await view.action('order-edit','order');const form=root.querySelector('form[data-form=order]');const filter=form.querySelector('[name=deliveryView][value=wed]');filter.checked=true;filter.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(form.querySelector('[data-delivery-column=fri]').hidden,true);form.querySelector('[name=schedule_line_wed]').value='4';await view.save(form);assert.deepEqual(saved.lines[0].schedule,{wed:4,fri:5});
});
test('reviewing a proposed price updates only the intended draft value and keeps edited quantities',async()=>{
 const s=workspace();s.orders=[stored(scheduled())];s.offers[0].value.priceNet=11;const {view,root}=setup(s);await view.start();await view.action('order-edit','order');let form=root.querySelector('form[data-form=order]');form.querySelector('[name=schedule_line_wed]').value='4';await view.action('order-review','');form=root.querySelector('form[data-form=order]');assert.ok(form.querySelector('[data-action=price-adopt]'));await view.action('price-adopt','line');form=root.querySelector('form[data-form=order]');assert.equal(form.querySelector('[name=price_line]').value,'11');await view.action('order-edit-sheet','');assert.equal(root.querySelector('[name=schedule_line_wed]').value,'4');assert.equal(s.orders[0].value.lines[0].priceNet,8.5);
});
test('evening count review names shortages and does not call unchecked items zero',async()=>{
 const s=workspace();s.inventories=[stored({...inventory,lines:[{...inventoryLine,packs:1,loose:3,assessment:'reorder'}]})];const {view,root}=setup(s);await view.start();await view.action('inventory-edit','inventory');await view.action('inventory-finish','');const review=root.querySelector('[data-inventory-review]').textContent;assert.match(review,/Nachbestellen/);assert.match(review,/Mineralwasser/);assert.match(review,/15/);
});
test('reorder uses latest assessment and adds missing article to chosen existing supplier draft',async()=>{
 const s=workspace();s.orders=[stored({...scheduled(),lines:[]})];s.counts=[stored({id:'old',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Mineralwasser',unit:'Flasche',quantity:12,countedAt:'2027-02-01T12:00:00Z',countedBy:'TEST',note:'alt',reorder:true}),stored({id:'latest',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Mineralwasser',unit:'Flasche',quantity:3,countedAt:'2027-02-02T12:00:00Z',countedBy:'TEST',note:'für Freitag',reorder:true})];const {view,root}=setup(s);await view.start();await view.action('reorder-list','');const add=root.querySelector('[data-action=reorder-existing]');assert.ok(add);await view.action('reorder-existing',add.dataset.id);assert.match(root.textContent,/Mineralwasser/);assert.equal(view.draft.lines.length,1);assert.equal(view.draft.lines[0].offerId,'offer');assert.deepEqual(Object.values(view.draft.lines[0].schedule),[null,null]);assert.equal(s.orders[0].value.lines.length,0);
});
test('old shortage does not reappear when the latest count no longer requests reorder',async()=>{
 const s=workspace();s.counts=[stored({id:'old',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Mineralwasser',unit:'Flasche',quantity:2,countedAt:'2027-02-01T12:00:00Z',countedBy:'TEST',note:'',reorder:true}),stored({id:'new',seasonId:'s2027',area:'Küche',articleId:'water',articleName:'Mineralwasser',unit:'Flasche',quantity:30,countedAt:'2027-02-02T12:00:00Z',countedBy:'TEST',note:'',reorder:false})];const {view,root}=setup(s);await view.start();await view.action('reorder-list','');assert.match(root.textContent,/kein Nachbestellbedarf/);assert.doesNotMatch(root.textContent,/Mineralwasser/);
});
test('order review reflects edits without waiting for save',async()=>{const s=workspace();s.orders=[stored(scheduled())];const{view,root,dom}=setup(s);await view.start();await view.action('order-edit','order');await view.action('order-review','');const field=root.querySelector('[name=price_line]');field.value='';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.match(root.querySelector('[data-order-total]').textContent,/Preise fehlen|Mengen oder Preise fehlen/);assert.match(root.querySelector('[data-price-review]').textContent,/Preis in diesem Entwurf:.*offen/i);});
