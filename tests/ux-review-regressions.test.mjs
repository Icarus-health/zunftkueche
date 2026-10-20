import test from 'node:test';
import assert from 'node:assert/strict';
import { professionalFixture } from './fixtures/professional-state.ts';
import { applyEventOperation } from '../src/domain/event-context.ts';
import { orderCsv } from '../src/data/exports.ts';
import { orderPreviewHeader } from '../src/ui/facts.ts';
import { historicalMappingNames } from '../src/ui/settings-mappings.ts';

function apply(state, type, payload) {
  return applyEventOperation(state, state.event.id, {
    id: `review-${state.revision}`, baseRevision: state.revision, type, payload,
  }).state;
}
function changeCurrentContext(state) {
  state = apply(state, 'supplier.save', { id: 'supplier-a', name: 'Neuer Lieferantenname', email: null });
  return apply(state, 'event.settings', { ...state.event, name: 'Neues Fest', year: 2027,
    dates: { ...state.event.dates, Freitag: '2027-10-22' },
    deliveryAddress: 'Neue Adresse', contact: 'Neuer Kontakt' });
}
function mark(state, orderId, status) {
  if (status === 'Vorbereitet') return state;
  state = apply(state, 'order.mark', { orderId, status: 'bestellt', note: 'Synthetischer Bestellvermerk' });
  return status === 'bestaetigt'
    ? apply(state, 'order.mark', { orderId, status, note: 'Synthetischer Bestätigungsvermerk' })
    : state;
}

for (const status of ['Vorbereitet', 'bestellt', 'bestaetigt']) {
  test(`${status}: preview/print header retains all saved context after current masters change`, () => {
    let state = professionalFixture();
    const id = state.orders.find(order => order.supplierId === 'supplier-a' && order.day === 'Freitag' && order.status === 'Vorbereitet').id;
    state = mark(state, id, status);
    const original = structuredClone(state.orders.find(order => order.id === id));
    state = changeCurrentContext(state);
    const saved = state.orders.find(order => order.id === id);
    assert.deepEqual(orderPreviewHeader(state, saved), {
      supplierName: 'Testmarkt Nord', eventName: 'TEST · Küchenwochenende', eventYear: 2026,
      deliveryDate: '2026-10-23', deliveryAddress: 'Synthetische Testküche', contact: 'Testkontakt', notice: null,
    });
    const csv = orderCsv(saved, state.revision, '2026-10-20T12:00:00.000Z');
    for (const value of ['Testmarkt Nord', 'TEST · Küchenwochenende', '2026-10-23', 'Synthetische Testküche', 'Testkontakt']) assert.ok(csv.includes(value));
    assert.doesNotMatch(csv, /Neuer Lieferantenname|Neues Fest|Neue Adresse|Neuer Kontakt/);
    assert.deepEqual(saved, original);
  });
  test(`${status}: legacy saved preview discloses current fallback and leaves unsaved address/contact unknown`, () => {
    let state = professionalFixture();
    const order = state.orders.find(order => order.supplierId === 'supplier-a' && order.day === 'Freitag' && order.status === 'Vorbereitet');
    delete order.context;
    state = mark(state, order.id, status);
    const original = structuredClone(state.orders.find(saved => saved.id === order.id));
    state = changeCurrentContext(state);
    const saved = state.orders.find(saved => saved.id === order.id);
    const header = orderPreviewHeader(state, saved);
    assert.match(header.notice ?? '', /nicht gespeichert/);
    assert.match(header.notice, /aktuell/);
    assert.equal(header.supplierName, 'Neuer Lieferantenname');
    assert.equal(header.eventName, 'Neues Fest');
    assert.equal(header.eventYear, 2027);
    assert.equal(header.deliveryDate, '2027-10-22');
    assert.equal(header.deliveryAddress, undefined);
    assert.equal(header.contact, undefined);
    assert.deepEqual(saved, original);
    assert.match(orderCsv(saved, state.revision), /Historischer Kontext offen/);
  });
}

const expectedNames = ['Alte Küche', 'Früherer Außenstand', 'Historischer Teststand', 'Küche'];
function staleMappingFixture() {
  const state = professionalFixture();
  // Defensive legacy/inconsistent input: aliases no longer have a source transaction.
  // Valid production settings require transaction-backed aliases.
  state.planLines = state.planLines.filter(line => !line.id.includes('-historic-'));
  return state;
}
test('defensive stale mapping-only name remains available for reassignment within a draft', () => {
  const state = staleMappingFixture(), before = structuredClone(state);
  const locations = structuredClone(state.event.locations);
  locations[0].historicalNames = locations[0].historicalNames.filter(name => name !== 'Historischer Teststand');
  assert.deepEqual(historicalMappingNames(state, locations), expectedNames);
  locations[1].historicalNames.push('Historischer Teststand');
  assert.deepEqual(locations, [
    { name: 'Küche', historicalNames: ['Alte Küche'] },
    { name: 'Außenstand', historicalNames: ['Früherer Außenstand', 'Historischer Teststand'] },
  ]);
  assert.deepEqual(historicalMappingNames(state, locations), expectedNames);
  assert.deepEqual(state, before);
});
test('defensive stale mappings survive draft deactivation and are restored on discard', () => {
  const state = staleMappingFixture(), before = structuredClone(state);
  let draft = structuredClone(state.event.locations).filter(location => location.name !== 'Küche');
  assert.deepEqual(historicalMappingNames(state, draft), expectedNames);
  assert.deepEqual(historicalMappingNames(state, []), expectedNames);
  draft = structuredClone(state.event.locations);
  assert.deepEqual(historicalMappingNames(state, draft), expectedNames);
  assert.deepEqual(draft[0].historicalNames, ['Alte Küche', 'Historischer Teststand']);
  assert.deepEqual(state, before);
});
test('draft mappings augment persisted and transaction names without duplicate choices', () => {
  const state = professionalFixture(), draft = structuredClone(state.event.locations);
  draft[0].historicalNames.push('Zusätzlicher Altname', 'Küche');
  assert.deepEqual(historicalMappingNames(state, draft), [...expectedNames, 'Zusätzlicher Altname']);
});
test('full-App fixture settings save real historical mappings and ordinary fields in one operation', () => {
  const state = professionalFixture(), before = structuredClone(state);
  assert.doesNotThrow(() => apply(state, 'event.settings', state.event));
  const locations = structuredClone(state.event.locations);
  locations[0].historicalNames = locations[0].historicalNames.filter(name => name !== 'Historischer Teststand');
  assert.deepEqual(historicalMappingNames(state, locations), expectedNames);
  locations[1].historicalNames.push('Historischer Teststand');
  const saved = apply(state, 'event.settings', {
    ...state.event, name: 'Synthetischer neuer Festname', contact: 'Synthetischer neuer Kontakt', locations,
  });
  assert.equal(saved.revision, state.revision + 1);
  assert.equal(saved.event.name, 'Synthetischer neuer Festname');
  assert.equal(saved.event.contact, 'Synthetischer neuer Kontakt');
  assert.deepEqual(saved.event.locations, [
    { name: 'Küche', historicalNames: ['Alte Küche'] },
    { name: 'Außenstand', historicalNames: ['Früherer Außenstand', 'Historischer Teststand'] },
  ]);
  for (const key of ['planLines', 'orders', 'invoices', 'movements', 'sales']) assert.deepEqual(saved[key], state[key]);
  assert.deepEqual(state, before);
});
