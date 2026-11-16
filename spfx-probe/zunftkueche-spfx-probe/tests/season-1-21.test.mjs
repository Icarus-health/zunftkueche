// 1.21.0: Marktplatz als dritter Bereich, Auswertung der ganzen Saison, Versand mit PDF, Papierliste, Übergaben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { AREAS, isArea } from '../src/kitchen/model.ts';
import { fasnetFigures, fasnetReport, exportFasnetRows } from '../src/kitchen/fasnet-report.ts';
import { billGrossForArea } from '../src/kitchen/ww/bill-accounting.ts';
import { validateBillCostAssignment } from '../src/kitchen/ww/domain.ts';
import { validateOrder } from '../src/kitchen/domain.ts';
import { countSheetPdf } from '../src/kitchen/count-sheet-pdf.ts';
import { preferredOffer } from '../src/kitchen/ww/plan-procurement.ts';
import { contextSwitch } from '../src/kitchen/workspace.ts';
import { KitchenView } from '../src/kitchen/view.ts';
import { season, order, line, stored, workspace, inventory, inventoryLine } from './support/kitchen-data.mjs';

const page = html => new JSDOM('<div id="app">' + html + '</div>').window.document.getElementById('app');
const common = { scope: season.id, at: '2027-02-05T10:00:00Z', by: 'TEST', confirmed: true };
const bill = (id, area, gross, extra = {}) => ({
  ...common, kind: 'bill', id, area, billType: 'invoice', name: 'Beleg ' + id, number: id, supplierId: 'sup', date: '2027-02-05',
  orderIds: [], net: gross, tax: 0, gross, note: '', fileHash: '', fileName: '', attachment: '', adjustmentNet: 0, lines: [], ...extra
});
const sales = (id, area, rows) => ({
  ...common, kind: 'system', id, area, purpose: 'sales', name: 'Kasse ' + area, basis: 'gross', currency: 'EUR', rows, recipes: [],
  from: '2027-02-05', to: '2027-02-05'
});

test('Marktplatz is a third area everywhere the app checks an area', () => {
  assert.deepEqual([...AREAS], ['Küche', 'Zunftscheuer', 'Marktplatz']);
  assert.equal(isArea('Marktplatz'), true);
  assert.equal(isArea('Bar'), false);
  const options = [...page(contextSwitch(workspace(), season, 'Marktplatz', season.id)).querySelectorAll('select[name=areaContext] option')];
  assert.deepEqual(options.map(o => o.value), ['Küche', 'Zunftscheuer', 'Marktplatz']);
  assert.equal(options.find(o => o.selected).value, 'Marktplatz');
  assert.doesNotThrow(() => validateOrder({ ...order, area: 'Marktplatz' }));
});

test('a split bill can carry a Marktplatz share; old splits without it still add up', () => {
  const split = { mode: 'split', kitchen: 50, scheuer: 30, market: 20, other: 0 };
  assert.doesNotThrow(() => validateBillCostAssignment(split, 100));
  assert.throws(() => validateBillCostAssignment({ ...split, market: 25 }, 100), /Bruttobetrag/);
  assert.doesNotThrow(() => validateBillCostAssignment({ mode: 'split', kitchen: 60, scheuer: 40, other: 0 }, 100));
  const b = bill('x', 'Küche', 100, { costAssignment: split });
  assert.equal(billGrossForArea(b, 'Marktplatz'), 20);
  assert.equal(billGrossForArea({ ...b, costAssignment: { mode: 'split', kitchen: 60, scheuer: 40, other: 0 } }, 'Marktplatz'), 0);
});

test('the season report adds up all areas and names what is not assigned', () => {
  const s = workspace();
  s.orders = [stored({ ...order, id: 'k', area: 'Küche' }), stored({ ...order, id: 'm', area: 'Marktplatz', lines: [{ ...line, priceNet: null }] })];
  s.inventories = [stored({ ...inventory, id: 'i1', status: 'Abgeschlossen', completedAt: '2027-02-05T23:00:00Z' })];
  s.ww = {
    ready: true,
    records: [
      bill('k1', 'Küche', 119),
      bill('s1', 'Zunftscheuer', 50, { costAssignment: { mode: 'split', kitchen: 10, scheuer: 20, market: 15, other: 5 } }),
      bill('o1', 'Küche', 30, { costAssignment: { mode: 'open' } }),
      sales('sk', 'Küche', [{ id: 'r1', date: '2027-02-05', productId: 'p', name: 'Wurst', quantity: 10, amount: 40, status: 'sold', paymentMethod: '' }]),
      sales('sm', 'Marktplatz', [{ id: 'r2', date: '2027-02-05', productId: 'p', name: 'Glühwein', quantity: 20, amount: 80, status: 'sold', paymentMethod: '' }])
    ].map(stored)
  };
  const f = fasnetFigures(s, season.id);
  const by = Object.fromEntries(f.areas.map(row => [row.area, row]));
  assert.equal(by['Küche'].purchase, 129, 'own invoice plus kitchen share');
  assert.equal(by['Zunftscheuer'].purchase, 20);
  assert.equal(by['Marktplatz'].purchase, 15);
  assert.equal(f.total.purchase, 199, 'every confirmed bill counts once in the total');
  assert.equal(f.purchaseUnassigned, 35, 'open cost centre 30 plus other areas 5');
  assert.equal(f.billsOpen, 1);
  assert.equal(by['Küche'].orders, 1);
  assert.equal(by['Marktplatz'].ordersWithoutPrice, 1);
  assert.equal(by['Küche'].closings, 1);
  assert.equal(f.total.sales, by['Küche'].sales + by['Marktplatz'].sales);
  const html = page(fasnetReport(s, season.id, season.name));
  assert.match(html.querySelector('#fasnet-total').textContent, /Fasnet 2027 gesamt/);
  assert.deepEqual([...html.querySelectorAll('.figure-areas h3')].map(x => x.textContent), ['Küche', 'Zunftscheuer', 'Marktplatz']);
  assert.match(html.textContent, /davon ohne Bereich: 35,00/);
  const csv = exportFasnetRows(s, season.id).replace(/^﻿/, '').split('\r\n');
  assert.match(csv[0], /^"Bereich";"Art"/);
  assert.ok(csv.slice(1).every(row => /^"(Küche|Zunftscheuer|Marktplatz)";/.test(row)));
});

test('the paper list is a PDF with one page per about 15 articles and names area and season', () => {
  const lines = Array.from({ length: 40 }, (_, i) => ({ ...inventoryLine, articleId: 'a' + i, articleName: 'Artikel ' + i }));
  const bytes = countSheetPdf({ ...inventory, lines }, { area: 'Marktplatz', seasonName: 'Fasnet 2027', generatedAt: '2027-02-05T20:00:00Z' });
  const text = new TextDecoder('latin1').decode(bytes);
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/MediaBox \[0 0 595 842\]/, 'portrait A4');
  assert.match(text, /Marktplatz \\267 Fasnet 2027|Marktplatz · Fasnet 2027/);
  assert.ok(Number(/\/Count (\d+)/.exec(text)[1]) >= 2);
  assert.match(text, /%%EOF\n$/);
});

test('with several pack sizes the one ordered last time is proposed', () => {
  const s = workspace();
  const offers = [{ id: 'small', articleId: 'water' }, { id: 'big', articleId: 'water' }];
  s.orders = [
    stored({ ...order, id: 'old', recordedAt: '2026-02-01T10:00:00Z', lines: [{ ...line, offerId: 'small' }] }),
    stored({ ...order, id: 'new', recordedAt: '2026-02-08T10:00:00Z', lines: [{ ...line, offerId: 'big' }] }),
    stored({ ...order, id: 'draft', status: 'Entwurf', recordedAt: null, lines: [{ ...line, offerId: 'small' }] })
  ];
  assert.equal(preferredOffer('water', offers, s)?.id, 'big');
  assert.equal(preferredOffer('juice', offers, s), undefined, 'no history, no guess');
});

test('without connection a failed save keeps the form open and the input on the device', async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.test/kueche' });
  for (const name of ['document', 'Element', 'HTMLFormElement', 'HTMLSelectElement', 'HTMLInputElement', 'FormData', 'Event'])
    globalThis[name] = dom.window[name] || dom.window.document;
  const s = workspace();
  s.orders = [];
  const store = { testMode: false, load: async () => s, saveInventory: async () => { throw new TypeError('Failed to fetch'); } };
  const root = document.getElementById('app');
  const view = new KitchenView(root, store, 'TEST Person');
  await view.start();
  await view.action('inventory-new', '');
  const input = root.querySelector('[name=packs_water]');
  input.value = '2';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await view.save(root.querySelector('form[data-form=inventory]'));
  assert.match(root.querySelector('[data-status]').textContent, /Keine Verbindung\. Noch nichts gespeichert/);
  assert.equal(root.querySelector('[data-recovery]'), null, 'no locked recovery box');
  assert.equal(root.querySelector('[name=packs_water]').disabled, false, 'counting goes on');
  assert.match(dom.window.localStorage.getItem([...Array(dom.window.localStorage.length).keys()].map(i => dom.window.localStorage.key(i)).find(k => /draft/.test(k))) || '', /packs_water/);
  dom.window.dispatchEvent(new dom.window.Event('online'));
  assert.match(root.querySelector('[data-status]').textContent, /Verbindung wieder da\. Bitte jetzt speichern/);
});

test('the order can be shared with the PDF attached where the device supports it', async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: 'https://example.test/kueche' });
  for (const name of ['document', 'Element', 'HTMLFormElement', 'HTMLSelectElement', 'HTMLInputElement', 'FormData', 'Event', 'File'])
    globalThis[name] = dom.window[name] || dom.window.document;
  const shared = [];
  Object.defineProperty(dom.window.navigator, 'canShare', { value: data => !!data.files?.length, configurable: true });
  Object.defineProperty(dom.window.navigator, 'share', { value: async data => { shared.push(data); }, configurable: true });
  const s = workspace();
  s.suppliers[0].value = { ...s.suppliers[0].value, email: 'bestellung@example.invalid' };
  s.orders = [stored({ ...order, status: 'Entwurf', recordedBy: null, recordedAt: null, deliveryDate: '2027-02-03', deliveries: [{ id: 'd', date: '2027-02-03', time: '', place: 'Küche' }], lines: [{ ...line, schedule: { d: 8 } }] })];
  const root = document.getElementById('app');
  const view = new KitchenView(root, { testMode: false, load: async () => s }, 'TEST Person');
  await view.start();
  await view.action('order-mail', 'order');
  assert.equal(root.querySelector('[data-action=order-share]').textContent, 'Mit PDF teilen');
  await view.action('order-share', '');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].type, 'application/pdf');
  assert.match(shared[0].files[0].name, /^Bestellung-Getränkemarkt-2027\.pdf$/);
  assert.match(shared[0].text, /Mineralwasser/);
});
