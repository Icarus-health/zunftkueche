import {test} from 'node:test';import assert from 'node:assert/strict';
import {SharePointStore} from '../src/kitchen/sharepoint.ts';import {Server} from './support/fake-sharepoint.mjs';
import {season,supplier,article,offer,line,inventoryLine} from './support/kitchen-data.mjs';
import {copyScheduledOrder} from '../src/kitchen/supplier-orders.ts';import {supplierPdf} from '../src/kitchen/supplier-pdf.ts';import {latestCounts} from '../src/kitchen/operations.ts';
import {mergePlanOrders, procurementReservation, procurementSuggestions} from '../src/kitchen/ww/plan-procurement.ts';
import {base, recipe} from './support/ww-data.mjs';
import {readFile} from 'node:fs/promises';
import {supplierMail} from '../src/kitchen/order-mail.ts';
import {decodeCsv, readCsv} from '../src/kitchen/imports/csv-reader.ts';
import {canonicalImportKey, sha256} from '../src/kitchen/imports/identity.ts';
import {previewSystemImport} from '../src/kitchen/imports/preview.ts';
import {createBackup, verifyBackup} from '../src/kitchen/ww/backup.ts';
import {purchaseTotals} from '../src/kitchen/ww/bill-accounting.ts';
import {importEffects, stockProjection} from '../src/kitchen/ww/domain.ts';
import {wwReport} from '../src/kitchen/ww/reports.ts';

test('rehearsal: previous year to one supplier PDF, two receipts and an evening count persists separately',async()=>{
 const server=new Server(),store=new SharePointStore('https://example.sharepoint.com/sites/test',server.request,true);await store.initialize();
 const old={id:'s2026',name:'2026',year:2026,archived:false};for(const[k,v]of [['seasons',old],['seasons',season],['suppliers',supplier],['articles',article],['offers',offer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);
 const historic={id:'old-order',seasonId:old.id,area:'Küche',supplierId:supplier.id,supplierName:supplier.name,status:'Entwurf',occasion:'Historisch',deliveryDate:'2026-02-11',method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,deliveries:[{id:'w',date:'2026-02-11',time:'09:00',place:'Küche'},{id:'f',date:'2026-02-13',time:'10:00',place:'Küche'}],lines:[{...line,quantity:8,schedule:{w:3,f:5}}]};
 await store.saveOrder(historic,undefined,'old');const state=await store.load();const draft=copyScheduledOrder(historic,season,'Küche',state,{w:'2027-02-03',f:'2027-02-05'},['line']);let saved=await store.saveOrder(draft,undefined,'copy');
 assert.equal(saved.value.lines[0].quantity,8);const pdf=new TextDecoder('latin1').decode(supplierPdf(saved.value,supplier));assert.match(pdf,/03\.02\.2027/);assert.match(pdf,/05\.02\.2027/);assert.match(pdf,/Mineralwasser/);
 const submitted={...saved.value,status:'Bestellt',recordedBy:'TEST',recordedAt:'2027-02-01T12:00:00Z',lines:saved.value.lines.map(l=>({...l,reviewed:true}))};saved=await store.saveOrder(submitted,saved,'submitted');
 for(const [id,quantity] of [['w',3],['f',5]])saved=await store.saveReceipt(saved,{id:'receipt-'+id,deliveryId:id,receivedAt:'2027-02-06T10:00:00Z',receivedBy:'TEST',note:'',lines:[{lineId:'line',quantity}]},'recv-'+id);
 const count={id:'count',seasonId:season.id,area:'Küche',status:'Abgeschlossen',createdAt:'2027-02-06T20:00:00Z',completedAt:'2027-02-06T20:10:00Z',countedBy:'TEST',lines:[{...inventoryLine,packs:1,loose:3,assessment:'reorder'}]};await store.saveInventory(count,undefined,'count');
 const reloaded=await store.load(),actual=reloaded.orders.find(r=>r.value.id===draft.id).value;assert.equal(actual.receipts.length,2);assert.equal(actual.lines[0].quantity,8);assert.equal(latestCounts(reloaded,season.id,'Küche')[0].quantity,15);assert.equal(latestCounts(reloaded,season.id,'Küche')[0].reorder,true);assert.equal(reloaded.orders.find(r=>r.value.id===historic.id).value.status,'Entwurf');
});

test('three-day round remains one order; partial receipt, retry and partial count survive reload',async()=>{
 const server=new Server(),store=new SharePointStore('https://example.sharepoint.com/sites/test',server.request,true);await store.initialize();
 const old={id:'s2026b',name:'2026',year:2026,archived:false},other={...article,id:'second',name:'Saft'},secondOffer={...offer,id:'second-offer',articleId:'second',priceNet:null,priceDate:null};
 for(const[k,v]of [['seasons',old],['seasons',season],['suppliers',supplier],['articles',article],['articles',other],['offers',offer],['offers',secondOffer]])await store.saveMaster(k,v,undefined,'seed-'+v.id);
 const history={id:'history3',seasonId:old.id,area:'Küche',supplierId:supplier.id,supplierName:supplier.name,status:'Entwurf',occasion:'Historisch',deliveryDate:'2026-02-11',method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,deliveries:[{id:'w',date:'2026-02-11',time:'',place:'Küche'},{id:'f',date:'2026-02-13',time:'',place:'Küche'},{id:'s',date:'2026-02-14',time:'',place:'Küche'}],lines:[{...line,quantity:6,schedule:{w:1,f:2,s:3}}]};
 await store.saveOrder(history,undefined,'history3');let state=await store.load();const draft=copyScheduledOrder(history,season,'Küche',state,{w:'2027-02-03',f:'2027-02-05',s:'2027-02-06'},['line']);draft.lines.push({...line,id:'line2',articleId:other.id,articleName:other.name,offerId:secondOffer.id,quantity:3,priceNet:null,reviewed:false,schedule:{w:1,f:1,s:1}});let saved=await store.saveOrder(draft,undefined,'round3');
 const pdf=new TextDecoder('latin1').decode(supplierPdf(saved.value,supplier));for(const str of ['03.02.2027','05.02.2027','06.02.2027','Saft','Preis offen'])assert.ok(pdf.includes(str),str);
 const submitted={...saved.value,status:'Bestellt',recordedBy:'TEST',recordedAt:'2027-02-01T12:00:00Z',lines:saved.value.lines.map(l=>({...l,reviewed:true}))};saved=await store.saveOrder(submitted,saved,'submit3');const original=saved;
 const partial={id:'receipt3',deliveryId:'f',receivedAt:'2027-02-05T12:00:00Z',receivedBy:'TEST',note:'Rest offen',lines:[{lineId:'line',quantity:1}]};saved=await store.saveReceipt(saved,partial,'receipt3op');const retried=await store.saveReceipt(original,partial,'receipt3op');assert.equal(retried.value.receipts.length,1);assert.equal(retried.value.receipts[0].lines[0].quantity,1);
 await assert.rejects(()=>store.saveReceipt(original,{...partial,id:'another'},'otherop'),/geändert/);
 const c={id:'partial-count',seasonId:season.id,area:'Küche',status:'Abgeschlossen',createdAt:'2027-02-05T20:00:00Z',completedAt:'2027-02-05T20:10:00Z',countedBy:'TEST',lines:[{...inventoryLine,packs:0,loose:null,assessment:'reorder'},{...inventoryLine,articleId:'second',articleName:'Saft',packs:null,loose:null}]};await store.saveInventory(c,undefined,'count3');state=await store.load();
 assert.equal(state.orders.find(x=>x.value.id===history.id).value.status,'Entwurf');const read=state.orders.find(x=>x.value.id===draft.id).value;assert.equal(read.deliveries.length,3);assert.equal(read.receipts.length,1);assert.equal(read.lines[1].priceNet,null);const counts=latestCounts(state,season.id,'Küche');assert.equal(counts.find(x=>x.articleId===article.id).quantity,0);assert.equal(counts.some(x=>x.articleId===other.id),false);
});

test('Fasnet rehearsal: one workspace from three-day menu to purchasing, counted stock and confirmed season close', async () => {
    const server = new Server();
    const store = new SharePointStore('https://example.sharepoint.com/sites/test', server.request, true);
    await store.initialize();
    await store.ww.initialize();
    const salad = { ...article, id: 'salad', name: 'Kartoffelsalat', unit: 'kg', category: 'Speisen' };
    const bucket = { ...offer, id: 'bucket', articleId: salad.id, code: 'K5', packName: 'Eimer', packSize: 5, priceNet: 15 };
    for (const [kind, value] of [['seasons', season], ['suppliers', supplier], ['articles', article], ['articles', salad], ['offers', offer], ['offers', bucket]]) {
        await store.saveMaster(kind, value, undefined, 'fasnet-' + value.id);
    }
    const drink = { ...recipe, name: 'Mineralwasser 0,5 l', category: 'Getränke', yield: 1, salePriceGross: 3, ingredients: [{ articleId: article.id, quantity: 1, unit: article.unit }] };
    const dish = { ...recipe, id: 'dish', familyId: 'salad-menu', name: 'Kartoffelsalat', yield: 10, salePriceGross: 5, ingredients: [{ articleId: salad.id, quantity: 2, unit: salad.unit }] };
    const dates = ['2027-02-12', '2027-02-13', '2027-02-14'];
    const labels = ['Freitag', 'Samstag', 'Kinderfest'];
    const slots = dates.map((date, i) => ({ ...base('slot', 'delivery-' + i), name: labels[i], date, time: '10:00', place: 'Küche' }));
    const plans = dates.map((date, i) => ({
        ...base('plan', 'menu-' + i), name: labels[i], date, area: 'Küche', note: '',
        lines: [{ recipeId: drink.id, portions: [24, 36, 18][i] }, { recipeId: dish.id, portions: [40, 60, 20][i] }]
    }));
    for (const document of [drink, dish, ...slots, ...plans]) {
        await store.ww.save(document, undefined, 'fasnet-' + document.id);
    }
    const loadWorkspace = async () => ({ ...await store.load(), ww: await store.ww.load(season.id) });
    const allocations = [offer, bucket].map(item => ({ articleId: item.articleId, offerId: item.id, stockUse: 0, incomingUse: 0 }));
    const [friday] = mergePlanOrders(plans[0], slots[0], await loadWorkspace(), allocations, { sup: 'new' });
    let saved = await store.saveOrder(friday, undefined, 'fasnet-friday');
    const [saturday] = mergePlanOrders(plans[1], slots[1], await loadWorkspace(), allocations, { sup: saved.value.id });
    saved = await store.saveOrder(saturday, saved, 'fasnet-saturday');
    assert.equal((await store.load()).orders.length, 1);
    assert.deepEqual(saved.value.lines.find(l => l.articleId === article.id).schedule, { 'delivery-0': 2, 'delivery-1': 3 });
    assert.deepEqual(saved.value.lines.find(l => l.articleId === salad.id).schedule, { 'delivery-0': 2, 'delivery-1': 3 });
    assert.match(new TextDecoder('latin1').decode(supplierPdf(saved.value, supplier)), /12\.02\.2027[\s\S]*13\.02\.2027/);

    const mail = supplierMail({ ...saved.value, lines: saved.value.lines.map(l => ({ ...l, reviewed: true })) },
        { ...supplier, email: 'bestellung@example.invalid' });
    assert.equal(mail.to, 'bestellung@example.invalid');
    assert.match(mail.body, /12\.02\.2027[\s\S]*13\.02\.2027/);
    const recorded = { ...saved.value, status: 'Bestellt', recordedBy: 'TEST', recordedAt: '2027-02-10T10:00:00Z', lines: saved.value.lines.map(l => ({ ...l, reviewed: true })) };
    saved = await store.saveOrder(recorded, saved, 'fasnet-recorded');
    const pdf = new Uint8Array(await readFile(new URL('./fixtures/acceptance/rechnung-beispiel.pdf', import.meta.url)));
    const slip = await store.saveDeliverySlip(recorded.id, slots[0].id, { name: 'Abnahme-Lieferschein.pdf', bytes: pdf }, 'TEST');
    saved = await store.saveReceipt(saved, {
        id: 'receipt-friday', deliveryId: slots[0].id, receivedAt: '2027-02-12T09:00:00Z', receivedBy: 'TEST', note: 'Eine Kiste fehlt',
        lines: saved.value.lines.map(l => ({ lineId: l.id, quantity: l.articleId === article.id ? 1 : 2 }))
    }, 'fasnet-received-friday');
    saved = await store.saveReceipt(saved, {
        id: 'receipt-saturday', deliveryId: slots[1].id, receivedAt: '2027-02-13T09:00:00Z', receivedBy: 'TEST', note: '',
        lines: saved.value.lines.map(l => ({ lineId: l.id, quantity: 3 }))
    }, 'fasnet-received-saturday');
    const midnight = '2027-02-13T23:15:00Z';
    await store.saveInventory({
        id: 'before-kinderfest', seasonId: season.id, area: 'Küche', status: 'Abgeschlossen', createdAt: midnight, completedAt: midnight, countedBy: 'TEST',
        lines: [
            { ...inventoryLine, packs: 0, loose: 8 },
            { ...inventoryLine, articleId: salad.id, articleName: salad.name, unit: salad.unit, packName: bucket.packName, packSize: bucket.packSize, packs: 1, loose: 0 }
        ]
    }, undefined, 'fasnet-count');
    const current = await loadWorkspace();
    const rest = procurementSuggestions(plans[2], current, new Date('2027-02-13T23:20:00Z'));
    assert.deepEqual(rest.map(row => [row.articleId, row.stockUse, row.incomingUse, row.additional, row.packs]), [[article.id, 8, 0, 10, 1], [salad.id, 4, 0, 0, 0]]);
    const [replenishment] = mergePlanOrders(plans[2], slots[2], current, rest, { sup: 'new' });
    assert.equal(replenishment.lines.length, 1);
    assert.equal(replenishment.lines[0].quantity, 1);
    await store.ww.save(procurementReservation(plans[2], rest, current), undefined, 'fasnet-reserved');
    let refill = await store.saveOrder(replenishment, undefined, 'fasnet-replenishment');
    assert.equal((await store.load()).orders.find(o => o.value.id === refill.value.id).value.status, 'Entwurf');
    refill = await store.saveOrder({ ...refill.value, status: 'Bestellt', recordedBy: 'TEST', recordedAt: midnight,
        lines: refill.value.lines.map(l => ({ ...l, reviewed: true })) }, refill, 'fasnet-refill-recorded');
    await store.saveReceipt(refill, {
        id: 'receipt-kinderfest', deliveryId: slots[2].id, receivedAt: '2027-02-14T09:00:00Z', receivedBy: 'TEST',
        note: '', lines: [{ lineId: refill.value.lines[0].id, quantity: 1 }]
    }, 'fasnet-refill-received');

    const sunday = '2027-02-14T18:00:00Z';
    await store.saveInventory({
        id: 'after-kinderfest', seasonId: season.id, area: 'Küche', status: 'Abgeschlossen', createdAt: sunday, completedAt: sunday, countedBy: 'TEST',
        lines: [
            { ...inventoryLine, packs: 0, loose: 2 },
            { ...inventoryLine, articleId: salad.id, articleName: salad.name, unit: salad.unit, packName: bucket.packName, packSize: bucket.packSize, packs: 0, loose: 1 }
        ]
    }, undefined, 'fasnet-final-count');
    const returned = { ...base('movement', 'fasnet-return'), at: '2027-02-14T18:15:00Z', confirmed: true, area: 'Küche',
        articleId: article.id, quantity: 2, unit: article.unit, type: 'return', place: '', toArea: null, toPlace: '', note: 'Abholung dokumentiert' };
    await store.ww.save(returned, undefined, 'fasnet-return');

    const library = '/sites/test/Shared Documents';
    server.inboxFolders.add(library);
    await store.inbox.ensure('bill', 2027);
    await store.inbox.ensure('system', 2027);
    const seedFile = (path, id, name, bytes) => {
        const metadata = { UniqueId: '00000000-0000-0000-0000-00000000000' + id, ETag: '"1"', Name: name,
            Length: String(bytes.length), TimeLastModified: '2027-02-14T19:00:00Z' };
        server.inboxFiles.set(library + '/ZK_Abnahme_Eingang/' + path + '/' + name, { metadata, bytes });
    };
    seedFile('03_Rechnungen/2027', 1, 'Abnahme-Teilrechnung.pdf', pdf);
    const [billFile] = (await store.inbox.list('bill', 2027)).files;
    const invoiceBytes = await store.inbox.read('bill', 2027, billFile), hash = await sha256(invoiceBytes);
    const invoice = { ...base('bill', 'fasnet-invoice'), billType: 'invoice', supplierId: supplier.id, area: 'Küche',
        date: dates[1], name: 'Teilrechnung', number: 'TEST-130', orderIds: [recorded.id], fileName: billFile.name, fileHash: hash,
        sourceFile: { id: billFile.id, version: billFile.version }, attachment: '', note: '', adjustmentNet: 0, net: 17, tax: 3.23, gross: 20.23,
        lines: [{ id: 'bill-water', role: 'goods', articleId: article.id, name: article.name, unit: offer.packName,
            quantity: 2, unitNet: 8.5, totalNet: 17, taxRate: 19 }]
    };
    const stage = await store.ww.save(invoice, undefined, 'fasnet-invoice-stage');
    const attachment = await store.ww.attachOriginal(stage, invoiceBytes, hash, 'pdf');
    await store.ww.save({ ...invoice, confirmed: true, attachment }, stage, 'fasnet-invoice-confirm');
    await store.ww.save({ ...invoice, id: 'fasnet-credit', billType: 'credit', confirmed: true, name: 'Rückgabe', number: 'TEST-G-130',
        date: dates[2], sourceFile: undefined, fileName: '', fileHash: '', attachment: '', creditForId: invoice.id, returnIds: [returned.id],
        net: -1.42, tax: -.27, gross: -1.69,
        lines: [{ ...invoice.lines[0], role: 'return', unit: article.unit, unitNet: .71, totalNet: -1.42 }]
    }, undefined, 'fasnet-credit-confirm');

    const encode = text => new TextEncoder().encode(text);
    seedFile('01_Zunftjahr/2027/Kasse', 2, 'Absatz.csv', encode('Artikel;Menge;Umsatz;Datum\n'
        + dates.map((date, i) => ['W;' + [14,26,18][i] + ';' + [42,78,54][i] + ';' + date,
            'S;' + [40,60,20][i] + ';' + [200,300,100][i] + ';' + date].join('\n')).join('\n')));
    seedFile('01_Zunftjahr/2027/Kasse', 3, 'Zahlungen.csv', encode('Zahlart;Betrag;Status\nBar;460;bezahlt\nKarte;295;bezahlt\nKarte;10;erstattet'));
    for (const file of (await store.inbox.list('system', 2027)).files) {
        const payment = file.name === 'Zahlungen.csv';
        const bytes = await store.inbox.read('system', 2027, file);
        const profile = { id: payment ? 'payments' : 'sales', purpose: payment ? 'payments' : 'sales', basis: payment ? 'unknown' : 'gross',
            columnMap: payment ? { paymentMethod: 0, amount: 1, status: 2 } : { productCode: 0, quantity: 1, amount: 2, date: 3 },
            decimalSeparator: ',', dateFormat: 'iso', activeStatuses: ['bezahlt'], cancelledStatuses: [], refundStatuses: ['erstattet'] };
        const context = { seasonId: season.id, area: 'Küche', locationId: 'standard', sourceId: profile.id, periodStart: dates[0], periodEnd: dates[2], currency: 'EUR' };
        const mappings = [[drink,'W'],[dish,'S']].map(([product, externalCode]) => ({ sourceId: profile.id, externalCode, targetProductId: product.id, unit: '', factor: 1 }));
        const preview = previewSystemImport(readCsv(decodeCsv(bytes, 'utf-8'), ';'), 0, profile, context, mappings);
        assert.deepEqual(preview.errors, []);
        assert.equal(preview.amount, payment ? 745 : 774);
        await store.ww.saveSystemWithOriginal({ ...base('system', 'fasnet-' + profile.id), area: 'Küche', confirmed: true,
            purpose: profile.purpose, basis: profile.basis, sourceId: profile.id, currency: 'EUR', name: file.name, from: dates[0], to: dates[2],
            canonicalKey: await canonicalImportKey(profile, context, preview.rows), fileHash: await sha256(bytes), rows: preview.rows,
            recipes: payment ? [] : [drink,dish], sourceFile: { id: file.id, version: file.version }
        }, bytes, 'csv', 'fasnet-' + profile.id + '-confirm');
    }
    const reloaded = await loadWorkspace(), journal = reloaded.ww.records.map(row => row.value);
    assert.equal(reloaded.orders.length, 2);
    assert.equal(reloaded.orders.find(o => o.value.id === recorded.id).value.receipts.length, 2);
    assert.equal(reloaded.orders.find(o => o.value.id === refill.value.id).value.receipts.length, 1);
    const physical = stockProjection(reloaded, journal.filter(row => row.kind !== 'system'), season.id, 'Küche', '')
        .find(row => row.articleId === article.id);
    assert.equal(physical.observed, 2);
    assert.equal(physical.quantity, 0);
    const withDailySales = stockProjection(reloaded, journal, season.id, 'Küche', '').find(row => row.articleId === article.id);
    assert.equal(withDailySales.quantity, null);
    assert.ok(withDailySales.issues.some(issue => issue.includes('zeitliche Zuordnung prüfen')));
    const effects = importEffects(journal.filter(row => row.kind === 'system'));
    assert.deepEqual(effects.sales.map(row => row.quantity), [58,120]);
    assert.equal(purchaseTotals(journal.filter(row => row.kind === 'bill')).gross, 18.54);
    const report = wwReport(reloaded, season.id, 'Küche');
    assert.match(report, /745,00/);
    assert.match(report, /774 EUR · brutto/);
    assert.match(report, /18,54/);
    const backup = await verifyBackup(await createBackup(reloaded, store.ww, loadWorkspace));
    assert.equal(backup.journal.filter(row => row.value.kind === 'movement').length, 1);
    assert.equal(Object.keys(backup.originals).length, 4);
    assert.deepEqual(backup.originals[slip.value.id], pdf);
    assert.deepEqual(backup.originals[invoice.id], pdf);
});

test('event preparation: materials follow the supplier order and equipment stays in the season checklist', async () => {
    const store = new SharePointStore('https://example.sharepoint.com/sites/test', new Server().request, true);
    await store.initialize();
    await store.ww.initialize();
    const napkins = { ...article, id: 'napkins', name: 'Servietten', unit: 'Stück' };
    const napkinPack = { ...offer, id: 'napkin-pack', articleId: napkins.id, packSize: 50, packName: 'Packung' };
    for (const [kind, value] of [['seasons', season], ['suppliers', supplier], ['articles', napkins], ['offers', napkinPack]]) {
        await store.saveMaster(kind, value, undefined, 'prep-' + value.id);
    }
    const menuItem = { ...recipe, yield: 1, ingredients: [{ articleId: napkins.id, quantity: 1, unit: napkins.unit }] };
    const date = '2027-02-12';
    const slot = { ...base('slot', 'prep-friday'), name: 'Freitag', date, time: '10:00', place: 'Küche' };
    const plan = { ...base('plan', 'prep-plan'), name: 'Freitag', area: 'Küche', date, note: '',
        lines: [{ recipeId: menuItem.id, portions: 48 }], materials: [{ articleId: napkins.id, unit: napkins.unit, quantity: 7 }] };
    const equipment = { ...base('equipment', 'prep-warmer'), area: 'Küche', name: 'Warmhaltebehälter',
        needed: 2, available: null, action: 'ausleihen', note: 'Beim Nachbarverein' };
    for (const document of [menuItem, slot, plan, equipment]) {
        await store.ww.save(document, undefined, 'prep-' + document.id);
    }
    const oldEquipment = await store.ww.get(equipment.id);
    assert.equal(oldEquipment.value.available, null);
    await store.ww.save({ ...equipment, available: 1 }, oldEquipment, 'prep-confirm-one');
    const ww = await store.ww.load(season.id);
    const workspace = { ...await store.load(), ww };
    const reloaded = ww.records.find(r => r.value.id === plan.id).value;
    const rows = procurementSuggestions(reloaded, workspace, new Date('2027-02-11T12:00:00Z'));
    assert.deepEqual(rows.map(r => [r.articleId, r.additional, r.packs]), [[napkins.id, 55, 2]]);
    const [order] = mergePlanOrders(reloaded, slot, workspace, rows, { [supplier.id]: 'new' });
    assert.deepEqual(order.lines.map(r => [r.articleName, r.quantity, r.schedule[slot.id]]), [['Servietten', 2, 2]]);
    assert.equal(ww.records.find(r => r.value.id === equipment.id).value.available, 1);
    assert.equal((await store.ww.load('other-season')).records.some(r => r.value.id === equipment.id), false);
    assert.throws(() => procurementSuggestions({
        ...reloaded, lines: [], materials: [{ ...plan.materials[0], unit: 'Packung' }]
    }, workspace), /Einheit des geplanten Materials prüfen/);
});

test('delivery slips stay with the selected delivery, survive retries and are included in a verified backup', async () => {
    const server = new Server();
    let interrupted = false;
    const request = async (url, options) => {
        const response = await server.request(url, options);
        if (response.ok && options.method === 'POST' && url.includes('/AttachmentFiles/add(') && !interrupted) {
            interrupted = true;
            const itemId = Number(url.match(/items\((\d+)\)/)[1]);
            server.lists.get('ZK_AbnahmeV2_Journal').find(row => row.Id === itemId).version++;
            throw new Error('Antwort nach Dateiupload verloren.');
        }
        return response;
    };
    const store = new SharePointStore('https://example.sharepoint.com/sites/test', request, true);
    await store.initialize();
    await store.ww.initialize();
    for (const [kind, value] of [['seasons', season], ['suppliers', supplier], ['articles', article], ['offers', offer]]) {
        await store.saveMaster(kind, value, undefined, 'slip-' + value.id);
    }
    const order = {
        id: 'slip-order', seasonId: season.id, area: 'Küche', supplierId: supplier.id, supplierName: supplier.name,
        status: 'Bestellt', occasion: 'Zunftabend', deliveryDate: '2027-02-12', method: 'Telefon', note: '',
        sourceId: null, sourceYear: null, recordedBy: 'TEST', recordedAt: '2027-02-11T09:00:00Z',
        deliveries: [{ id: 'fri', date: '2027-02-12', time: '', place: 'Küche' }, { id: 'sat', date: '2027-02-13', time: '', place: 'Küche' }],
        lines: [{ ...line, reviewed: true, quantity: 4, schedule: { fri: 2, sat: 2 } }]
    };
    const saved = await store.saveOrder(order, undefined, 'slip-order');
    const data = new TextEncoder().encode('%PDF-1.7\nTEST lieferschein\n%%EOF');
    const source = { name: 'Lieferschein 107.pdf', bytes: data };
    await assert.rejects(() => store.saveDeliverySlip(order.id, 'unknown', source, 'TEST'), /Liefertermin/);
    await assert.rejects(() => store.saveDeliverySlip(order.id, 'fri', { ...source, bytes: new TextEncoder().encode('<html>') }, 'TEST'), /PDF.*JPEG.*PNG/);
    await assert.rejects(() => store.saveDeliverySlip(order.id, 'fri', source, 'TEST'), /Antwort nach Dateiupload verloren/);
    const staged = (await store.ww.load(season.id)).records.filter(r => r.value.kind === 'deliverySlip');
    assert.equal(staged.length, 1);
    assert.equal(staged[0].value.confirmed, false);
    const original = await store.saveDeliverySlip(order.id, 'fri', source, 'TEST');
    const duplicate = await store.saveDeliverySlip(order.id, 'fri', { ...source, name: 'anderer Dateiname.pdf' }, 'TEST');
    assert.equal(duplicate.value.id, original.value.id);
    const accepted = await store.saveReceipt(saved, {
        id: 'first-part', deliveryId: 'fri', receivedAt: '2027-02-12T12:00:00Z', receivedBy: 'TEST',
        note: 'Rest fehlt', lines: [{ lineId: line.id, quantity: 1 }]
    }, 'slip-receipt');
    assert.equal(accepted.value.receipts[0].lines[0].quantity, 1);
    const ww = await store.ww.load(season.id);
    const slips = ww.records.filter(r => r.value.kind === 'deliverySlip');
    assert.equal(slips.length, 1);
    assert.equal(slips[0].value.deliveryId, 'fri');
    assert.deepEqual(await store.ww.readOriginal(slips[0]), data);
    const { createBackup, verifyBackup } = await import('../src/kitchen/ww/backup.ts');
    const backup = await verifyBackup(await createBackup(await store.load(), store.ww));
    assert.deepEqual(backup.originals[original.value.id], data);
});
