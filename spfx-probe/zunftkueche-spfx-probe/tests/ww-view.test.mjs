import {test} from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {KitchenView} from '../src/kitchen/view.ts';import {SharePointStore} from '../src/kitchen/sharepoint.ts';import {Server} from './support/fake-sharepoint.mjs';import {season,supplier,article,offer} from './support/kitchen-data.mjs';import {slot,template} from './support/ww-data.mjs';
async function setup(){const dom=new JSDOM('<div id="app"></div>',{url:'https://example.test'});for(const name of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData','DOMParser'])globalThis[name]=dom.window[name]||dom.window.document;const root=document.getElementById('app'),server=new Server(),store=new SharePointStore('https://example.sharepoint.com/sites/kitchen',server.request);for(const[k,v]of [['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);await store.ww.initialize();const view=new KitchenView(root,store,'TEST Person');await view.start();return{view,root,store,dom,server};}

test('evening count opens the next event and saves a linked replenishment draft ready to review', async () => {
    const { view, root, store } = await setup();
    const { base, recipe } = await import('./support/ww-data.mjs');
    const { mergePlanOrders } = await import('../src/kitchen/ww/plan-procurement.ts');
    await store.initialize();
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const delivery = { ...slot, date: tomorrow };
    const plan = { ...base('plan', 'kinderfest'), name: 'Kinderfest', date: tomorrow, area: 'Küche', lines: [{ recipeId: recipe.id, portions: 150 }], note: '' };
    for (const doc of [recipe, delivery, plan]) await store.ww.save(doc, undefined, 'flow-' + doc.id);
    const state = { ...await store.load(), ww: await store.ww.load(season.id) };
    const [draft] = mergePlanOrders(plan, delivery, state, [{ articleId: article.id, offerId: offer.id, stockUse: 0, incomingUse: 0 }], { sup: 'new' });
    const main = { ...draft, status: 'Bestellt', recordedBy: 'TEST', recordedAt: new Date(Date.now() - 86400000).toISOString(), lines: draft.lines.map(line => ({ ...line, reviewed: true })) };
    const saved = await store.saveOrder(main, undefined, 'flow-main-order');
    await store.saveReceipt(saved, {
        id: 'flow-receipt', deliveryId: delivery.id, receivedAt: new Date(Date.now() - 60000).toISOString(), receivedBy: 'TEST',
        note: '', lines: [{ lineId: main.lines[0].id, quantity: 2 }]
    }, 'flow-receipt');
    await view.action('reload', '');
    await view.action('inventory-new', '');
    root.querySelector('[name=loose_water]').value = '8';
    await view.action('inventory-finish', '');
    await view.action('inventory-confirm', '');
    assert.equal(root.querySelector('h1').textContent, 'Nächsten Einsatz prüfen');
    assert.ok(root.querySelector('[data-action=ww-next-plan][data-id=kinderfest]'));
    await view.action('ww-next-plan', plan.id);
    const form = root.querySelector('form[data-form=ww-procure]');
    assert.equal(form.querySelector('h1').textContent, 'Nachbestellung vorbereiten');
    assert.equal(form.querySelector('[name=stockUse]').value, '8');
    assert.equal(form.querySelector('[name=incomingUse]').value, '12');
    await view.save(form);
    const orders = (await store.load()).orders.map(row => row.value);
    assert.equal(orders.length, 2);
    const followUp = orders.find(order => order.sourceId === main.id);
    assert.equal(followUp.lines[0].quantity, 1);
    assert.equal(followUp.status, 'Entwurf');
    assert.equal(orders.find(order => order.id === main.id).receipts.length, 1);
    assert.ok(root.querySelector('[data-action=order-edit][data-id="' + followUp.id + '"]'));
});
test('delivery dates can be created for arbitrary weekdays directly in the existing app',async()=>{const {view,root,store}=await setup();await view.action('ww-open','slots');await view.action('ww-new','slot');const form=root.querySelector('form[data-form=ww-slot]');assert.ok(form);form.querySelector('[name=name]').value='Montag Zusatz';form.querySelector('[name=date]').value='2027-02-08';form.querySelector('[name=time]').value='09:00';form.querySelector('[name=place]').value='Halle Küche';await view.save(form);const docs=(await store.ww.load('s2027')).records;assert.equal(docs.find(r=>r.value.kind==='slot').value.date,'2027-02-08');assert.match(root.textContent,/Montag Zusatz/);});
test('supplier order templates create real dated order drafts and survive reload',async()=>{const {view,root,store}=await setup();await store.ww.save(slot,undefined,'slot');await store.ww.save(template,undefined,'template');await view.action('reload','');await view.action('ww-open','templates');await view.action('ww-use','tpl');const form=root.querySelector('form[data-form=ww-use]');assert.ok(form);form.querySelector('[name=slot]').checked=true;await view.save(form);const loaded=await store.load();assert.equal(loaded.orders.length,1);assert.equal(loaded.orders[0].value.deliveryDate,'2027-02-08');assert.equal(loaded.orders[0].value.lines[0].quantity,2);assert.equal(loaded.orders[0].value.status,'Entwurf');});
test('a reviewed price list changes new quote prices but not previous order snapshots',async()=>{const {view,root,store}=await setup();await view.action('ww-open','prices');await view.action('ww-new','prices');const form=root.querySelector('form[data-form=ww-prices]');assert.ok(form);form.querySelector('[name=name]').value='Preise 2027';form.querySelector('[name=validFrom]').value='2027-01-01';await view.action('ww-add','prices');form.querySelector('[name=priceNet]').value='9,50';await view.save(form);const records=(await store.ww.load('s2027')).records;assert.equal(records.find(r=>r.value.kind==='prices').value.lines[0].priceNet,9.5);assert.equal((await store.load()).offers[0].value.priceNet,8.5);});
test('unsaved business forms are protected when switching primary navigation',async()=>{const {view,root,dom}=await setup();await view.action('ww-open','slots');await view.action('ww-new','slot');const input=root.querySelector('[name=name]');assert.ok(input);input.value='Noch offen';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await view.action('nav','stock');assert.ok(root.querySelector('form[data-form=ww-slot]'));assert.match(root.textContent,/Ungespeicherte/);});
test('recipe confirmation stores base-unit ingredients and editing creates a version',async()=>{const {view,root,store}=await setup();await view.action('ww-open','recipes');await view.action('ww-new','recipe');let form=root.querySelector('form[data-form=ww-recipe]');assert.ok(form);form.querySelector('[name=name]').value='Wasser Glas';form.querySelector('[name=yield]').value='5';await view.action('ww-add','recipe');assert.equal(form.querySelector('[name=articleId]').value,'');form.querySelector('[name=articleId]').value=article.id;form.querySelector('[name=quantity]').value='1';form.querySelector('[name=confirmed]').checked=true;await view.save(form);let rows=(await store.ww.load('s2027')).records.filter(r=>r.value.kind==='recipe');assert.equal(rows.length,1);assert.equal(rows[0].value.ingredients[0].unit,article.unit);await view.action('ww-edit',rows[0].value.id);form=root.querySelector('form[data-form=ww-recipe]');form.querySelector('[name=name]').value='Wasser Glas neu';form.querySelector('[name=confirmed]').checked=true;await view.save(form);rows=(await store.ww.load('s2027')).records.filter(r=>r.value.kind==='recipe');assert.equal(rows.length,2);assert.equal(rows[0].value.familyId,rows[1].value.familyId);});
test('portion planning keeps its selected recipe version and shows ingredient demand',async()=>{const {view,root,store}=await setup();const {recipe}=await import('./support/ww-data.mjs');await store.ww.save(recipe,undefined,'recipe');await view.action('reload','');await view.action('ww-open','plans');await view.action('ww-new','plan');const form=root.querySelector('form[data-form=ww-plan]');assert.ok(form);form.querySelector('[name=name]').value='Freitag';form.querySelector('[name=date]').value='2027-02-12';await view.action('ww-add','plan');assert.equal(form.querySelector('[name=recipeId]').value,'');form.querySelector('[name=recipeId]').value=recipe.id;form.querySelector('[name=portions]').value='30';await view.save(form);const plan=(await store.ww.load('s2027')).records.find(r=>r.value.kind==='plan').value;assert.equal(plan.lines[0].recipeId,recipe.id);await view.action('ww-demand',plan.id);assert.match(root.textContent,/6.*Flasche/);});
test('confirmed stock movements survive reload and affect the calculated stock',async()=>{const {view,root,store}=await setup();await view.action('ww-open','journal');await view.action('ww-new','movement');let form=root.querySelector('form[data-form=ww-movement]');assert.ok(form);form.querySelector('[name=type]').value='opening';form.querySelector('[name=quantity]').value='20';await view.save(form);await view.action('ww-new','movement');form=root.querySelector('form[data-form=ww-movement]');form.querySelector('[name=type]').value='waste';form.querySelector('[name=quantity]').value='2';await view.save(form);const moves=(await store.ww.load('s2027')).records.filter(r=>r.value.kind==='movement');assert.equal(moves.length,2);assert.ok(moves.every(r=>r.value.confirmed));assert.match(root.textContent,/18/);});
test('cancelling an edited business form releases unsaved navigation protection',async()=>{const {view,root,dom}=await setup();await view.action('ww-open','slots');await view.action('ww-new','slot');root.querySelector('[name=name]').dispatchEvent(new dom.window.Event('input',{bubbles:true}));await view.action('ww-cancel','');await view.action('nav','stock');assert.match(root.querySelector('h1').textContent,/Bestand/);});
test('neutral sales import requires review, stores mappings and confirmed rows',async()=>{const{view,root,store}=await setup();const{recipe}=await import('./support/ww-data.mjs');await store.ww.save(recipe,undefined,'recipe');await view.action('reload','');await view.action('ww-open','systems');await view.action('ww-system-new','');let form=root.querySelector('form[data-wizard]');assert.ok(form);form.querySelector('[name=name]').value='Kasse Beispiel';form.querySelector('[name=from]').value='2027-02-12';form.querySelector('[name=to]').value='2027-02-12';Object.defineProperty(form.querySelector('[name=file]'),'files',{value:[new File(['Code;Menge;Umsatz\nW1;5;35,00'],'verkauf.csv')]});await view.action('ww-file-read','');form=root.querySelector('form[data-wizard]');form.querySelector('[name=col_productCode]').value='0';form.querySelector('[name=col_quantity]').value='1';form.querySelector('[name=col_amount]').value='2';await view.action('ww-columns','');root.querySelector('[name=productId]').value=recipe.id;await view.action('ww-products','');await assert.rejects(view.action('ww-table-confirm',''),/prüfen|bestätigen/);root.querySelector('[name=reviewed]').checked=true;await view.action('ww-table-confirm','');const docs=(await store.ww.load('s2027')).records;assert.equal(docs.find(r=>r.value.kind==='system').value.rows[0].quantity,5);assert.equal(docs.find(r=>r.value.kind==='profile').value.mappings[0].externalCode,'W1');});
test('supplier CSV prices use reviewed offer mappings and retain old master prices',async()=>{const{view,root,store}=await setup();await view.action('ww-open','prices');await view.action('ww-price-import','');let form=root.querySelector('form[data-wizard]');assert.ok(form);form.querySelector('[name=name]').value='Liste neu';form.querySelector('[name=validFrom]').value='2027-01-01';Object.defineProperty(form.querySelector('[name=file]'),'files',{value:[new File([`Code;Preis\n${offer.code};10,50`],'preise.csv')]});await view.action('ww-file-read','');root.querySelector('[name=col_code]').value='0';root.querySelector('[name=col_priceNet]').value='1';await view.action('ww-columns','');await view.action('ww-products','');root.querySelector('[name=reviewed]').checked=true;await view.action('ww-table-confirm','');const docs=(await store.ww.load('s2027')).records;assert.equal(docs.find(r=>r.value.kind==='prices').value.lines[0].priceNet,10.5);assert.equal((await store.load()).offers[0].value.priceNet,offer.priceNet);});
test('invoice draft can be completed and confirmed without booking stock twice',async()=>{const{view,root,store}=await setup();await view.action('ww-open','bills');await view.action('ww-new','bill');const form=root.querySelector('form[data-form=ww-bill]');assert.ok(form);form.querySelector('[name=name]').value='Beleg Test';form.querySelector('[name=supplierId]').value=supplier.id;form.querySelector('[name=number]').value='R-123';form.querySelector('[name=date]').value='2027-02-12';form.querySelector('[name=net]').value='10';form.querySelector('[name=tax]').value='1,9';form.querySelector('[name=gross]').value='11,9';await view.action('ww-add','bill');form.querySelector('[name=lineName]').value='Ware';form.querySelector('[name=quantity]').value='1';form.querySelector('[name=unitNet]').value='10';form.querySelector('[name=totalNet]').value='10';form.querySelector('[name=confirmed]').checked=true;await view.save(form);const docs=(await store.ww.load('s2027')).records;assert.equal(docs.filter(r=>r.value.kind==='bill').length,1);assert.equal(docs.filter(r=>r.value.kind==='movement').length,0);});
test('named storage places can be selected and show their actual balances',async()=>{const{view,root,store}=await setup();await store.ww.save({kind:'movement',id:'shelf-count',scope:'s2027',at:'2026-10-26T12:00:00Z',by:'TEST',confirmed:true,area:'Küche',articleId:'water',quantity:8,unit:article.unit,type:'opening',place:'Keller',toArea:null,toPlace:'',note:''},undefined,'shelf');await view.action('reload','');await view.action('ww-open','journal');await view.action('ww-place','Keller');assert.match(root.textContent,/8 Flasche/);assert.match(root.textContent,/Keller/);});
test('legacy article CSV import keeps existing recipe and journal access loaded',async()=>{const{view,root,store}=await setup();const{recipe}=await import('./support/ww-data.mjs');await store.ww.save(recipe,undefined,'recipe');await view.action('reload','');await view.action('import','articles');root.querySelector('[name=csvText]').value='Name;Einheit;Kategorie\nSalz;kg;Gewürz';await view.action('import-preview','');await view.action('import-apply','');await view.action('ww-open','recipes');assert.match(root.textContent,/Testgericht/);assert.doesNotMatch(root.textContent,/Neue Bereiche einrichten/);});
test('new invoice requires deliberate supplier choice and marks the season',async()=>{
 const{view,root}=await setup();await view.action('ww-open','bills');await view.action('ww-new','bill');const form=root.querySelector('form[data-form=ww-bill]');assert.equal(form.querySelector('[name=supplierId]').value,'');assert.match(form.textContent,/Lieferant auswählen/);assert.match(form.textContent,/Fasnet 2027/);
 form.querySelector('[name=name]').value='Test';await assert.rejects(view.save(form),/Lieferant/);
});
test('accepting invoice suggestions preserves existing edits and cannot add them twice',async()=>{
 const {WwController}=await import('../src/kitchen/ww/controller.ts');const {workspace}=await import('./support/kitchen-data.mjs');
 const dom=new JSDOM('<div id="app"></div>');for(const name of ['document','Element','HTMLInputElement','HTMLTextAreaElement','HTMLFormElement','HTMLSelectElement','FormData'])globalThis[name]=dom.window[name]||dom.window.document;
 const root=document.getElementById('app'),state=workspace();state.ww={ready:true,records:[]};let controller;
 const ports={root,state:()=>state,season:()=>season.id,area:()=> 'Küche',actor:'TEST',markDirty:()=>{},redraw:()=>{root.innerHTML=controller.render();}};
 controller=new WwController(ports);controller.screen='bills';controller.draft={kind:'bill',id:'b',scope:season.id,at:'2027-01-01T00:00:00Z',by:'TEST',confirmed:false,name:'',supplierId:'',number:'',date:'2027-02-01',area:'Küche',orderIds:[],fileHash:'',fileName:'',attachment:'',net:null,tax:null,gross:null,adjustmentNet:0,lines:[],note:''};
 controller.billProposals=[{id:'suggestion-1',articleId:null,name:'Test',quantity:2,unit:'Stk.',unitNet:3,totalNet:6,taxRate:19}];ports.redraw();root.querySelector('[name=name]').value='Manuell';root.querySelector('[name=supplierId]').value=supplier.id;
 await controller.action('ww-bill-accept-lines','');assert.equal(root.querySelector('[name=name]').value,'Manuell');assert.equal(root.querySelector('[name=supplierId]').value,supplier.id);assert.equal(root.querySelectorAll('[data-line]').length,1);assert.equal(root.querySelector('[name=lineName]').value,'Test');await controller.action('ww-bill-accept-lines','');assert.equal(root.querySelectorAll('[data-line]').length,1);
});
test('invoice invalid totals and line prices identify the exact field and clear after correction',async()=>{
 const{view,root,dom}=await setup();await view.action('ww-open','bills');await view.action('ww-new','bill');const form=root.querySelector('form[data-form=ww-bill]');form.querySelector('[name=name]').value='Test';form.querySelector('[name=supplierId]').value=supplier.id;const gross=form.querySelector('[name=gross]');gross.value='12.50';await assert.rejects(view.save(form));assert.equal(gross.getAttribute('aria-invalid'),'true');assert.ok(gross.ownerDocument.getElementById(gross.getAttribute('aria-describedby')));gross.value='12,50';gross.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(gross.hasAttribute('aria-invalid'),false);
 await view.action('ww-add','bill');await view.action('ww-add','bill');const lines=form.querySelectorAll('[data-line]');lines[0].querySelector('[name=lineName]').value='Erste';lines[1].querySelector('[name=lineName]').value='Zweite';const second=lines[1].querySelector('[name=unitNet]');second.value='-1';await assert.rejects(view.save(form));assert.equal(second.getAttribute('aria-invalid'),'true');assert.equal(lines[0].querySelector('[name=unitNet]').hasAttribute('aria-invalid'),false);
});

test('an incoming collection of invoices saves a review draft without assigning a supplier', async () => {
    const { view, root, store } = await setup();
    const controller = view.wwUI;
    const sourceFile = { id: '00000000-0000-0000-0000-000000000012', version: '"1"' };
    await view.action('ww-open', 'bills');
    await view.action('ww-new', 'bill');
    Object.assign(controller.draft, {
        name: 'Sammelmappe.pdf', fileName: 'Sammelmappe.pdf', sourceFile,
        needsSeparateFiles: true, fileHash: 'a'.repeat(64)
    });
    controller.inboxPage = { season, folders: {}, errors: {}, duplicates: new Map(), busy: false };
    controller.previewUrl = 'blob:https://example.test/sammelmappe';
    root.innerHTML = controller.render();
    const form = root.querySelector('form[data-form=ww-bill]');
    assert.equal(root.querySelector('h1').textContent, 'Einzelbelege ablegen');
    assert.ok(form.querySelector('a[href="blob:https://example.test/sammelmappe"]'));
    assert.equal(form.querySelector('[name=supplierId], [name=gross], [name=confirmed]'), null);
    await view.action('ww-bill-single', '');
    assert.equal(controller.draft.needsSeparateFiles, true);
    await view.save(form);
    const draft = (await store.ww.load(season.id)).records.find(row => row.value.kind === 'bill').value;
    assert.equal(draft.supplierId, '');
    assert.equal(draft.confirmed, false);
    assert.equal(draft.needsSeparateFiles, true);
    assert.deepEqual(draft.sourceFile, sourceFile);
});

test('an ambiguous scan remains pending through reload and can be reviewed with its original and an explanation', async () => {
    const { view, root, store } = await setup();
    const { sha256 } = await import('../src/kitchen/imports/identity.ts');
    const { base } = await import('./support/ww-data.mjs');
    const { readFile } = await import('node:fs/promises');
    const bytes = new Uint8Array(await readFile(new URL('./fixtures/acceptance/rechnung-beispiel.pdf', import.meta.url)));
    const fileHash = await sha256(bytes);
    const sourceFile = { id: '00000000-0000-0000-0000-000000000015', version: '"1"' };
    const pending = { ...base('bill', 'scan-ambiguity'), area: 'Küche', date: '2027-02-05', name: 'Scan.pdf',
        supplierId: '', number: '', lines: [], orderIds: [], note: '', adjustmentNet: 0,
        net: null, tax: null, gross: null, fileHash, fileName: 'Scan.pdf', attachment: '', sourceFile,
        needsSeparateFiles: true, scanNumberReview: { status: 'open' } };
    const staged = await store.ww.save(pending, undefined, 'scan-pending');
    const attachment = await store.ww.attachOriginal(staged, bytes, fileHash, 'pdf');
    await store.ww.save({ ...pending, attachment }, staged, 'scan-attach');
    await view.action('reload', '');
    await view.action('ww-open', 'bills');
    await view.action('ww-edit', pending.id);
    assert.match(root.textContent, /Belegnummern prüfen/);
    assert.ok(root.querySelector('[data-action=ww-bill-original]'));
    assert.equal(root.querySelector('[name=gross]'), null);
    await assert.rejects(view.wwUI.action('ww-bill-single', ''), /Begründung/);
    root.querySelector('[name=singleDocumentReason]').value = 'Dieselbe Nummer auf beiden Seiten im Original.';
    await view.action('ww-bill-single', '');
    const form = root.querySelector('form[data-form=ww-bill]');
    assert.equal(form.querySelector('[name=gross]').value, '');
    assert.equal(form.querySelector('[name=date]').value, '');
    form.querySelector('[name=number]').value = 'TEST-4550';
    form.querySelector('[name=date]').value = '2027-02-05';
    form.querySelector('[name=supplierId]').value = supplier.id;
    await view.save(form);
    const row = await store.ww.get(pending.id);
    assert.equal(row.value.confirmed, false);
    assert.equal(row.value.needsSeparateFiles, undefined);
    assert.equal(row.value.scanNumberReview.status, 'reviewed');
    assert.equal(row.value.scanNumberReview.by, 'TEST Person');
    assert.match(row.value.scanNumberReview.reason, /beiden Seiten/);
    assert.deepEqual(row.value.sourceFile, sourceFile);
    assert.deepEqual(await store.ww.readOriginal(row), bytes);
});

test('the inbox identifies a renamed invoice from an archived season before opening its editor', async () => {
    const { view, root, store, server } = await setup();
    const { sha256 } = await import('../src/kitchen/imports/identity.ts');
    const { base } = await import('./support/ww-data.mjs');
    const { readFile } = await import('node:fs/promises');
    const archive = { id: 's2026', name: 'Fasnet 2026', year: 2026, archived: false };
    const savedSeason = await store.saveMaster('seasons', archive, undefined, 'seed-archive');
    const bytes = new Uint8Array(await readFile(new URL('./fixtures/acceptance/rechnung-beispiel.pdf', import.meta.url)));
    const bill = { ...base('bill', 'old-invoice', archive.id), area: 'Zunftscheuer', date: '2026-02-05', name: 'Alte Rechnung',
        supplierId: supplier.id, number: 'TEST-OLD', lines: [{ id: 'l', name: 'Ware', unit: 'Stk', quantity: 2, unitNet: 5, totalNet: 10, taxRate: 19, articleId: null }],
        orderIds: [], note: '', adjustmentNet: 0, net: 10, tax: 1.9, gross: 11.9, fileHash: await sha256(bytes),
        fileName: 'Original-2026.pdf', attachment: '' };
    const pending = await store.ww.save(bill, undefined, 'old-stage');
    const attachment = await store.ww.attachOriginal(pending, bytes, bill.fileHash, 'pdf');
    await store.ww.save({ ...bill, confirmed: true, attachment }, pending, 'old-confirmed');
    await store.saveMaster('seasons', { ...archive, archived: true }, savedSeason, 'archive-season');
    await view.action('reload', '');

    const path = '/sites/kitchen/Shared Documents/03_Rechnungen/2027';
    const fileId = '00000000-0000-0000-0000-000000000013';
    const name = 'Neu benannt.pdf';
    server.inboxFolders.add(path);
    server.inboxFiles.set(path + '/' + name, {
        metadata: { UniqueId: fileId, ETag: '"1"', Name: name, Length: bytes.length, TimeLastModified: '2027-02-05T12:00:00Z' }, bytes
    });
    await view.action('ww-open', 'inbox');
    assert.ok(root.querySelector('[data-action=ww-inbox-file]'));
    await view.action('ww-inbox-file', 'bill|' + fileId);
    assert.equal(root.querySelector('h1').textContent, 'Rechnungen');
    assert.match(root.textContent, /Doppelte Datei · Original-2026\.pdf · Fasnet 2026/);
    assert.equal(root.querySelector('form[data-form=ww-bill], [data-action=ww-inbox-file]'), null);
    assert.deepEqual((await store.ww.load(season.id)).records, []);
    assert.deepEqual(await store.ww.readOriginal(await store.ww.get(bill.id)), bytes);
});
