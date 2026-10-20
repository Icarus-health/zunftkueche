import {applyOperation} from '../../src/domain/state.ts';
import type {KitchenState} from '../../src/domain/state.ts';
import {eventSnapshot} from '../../src/domain/event-context.ts';

/** Entirely synthetic daily work. No imports of private records, browser storage or network. */
export function professionalFixture(): KitchenState {
  function event(id: string, name: string) {
    let state: KitchenState = {schemaVersion: 2, revision: 0, operationIds: [], operationRequests: {},
      event: {id, name, year: 2026, status: 'Offen', dates: {Freitag: '2026-10-23', Samstag: '2026-10-24'}, deliveryAddress: 'Synthetische Testküche', contact: 'Testkontakt', purchasingLocation: 'Küche', locations: [{name: 'Küche', historicalNames: ['Alte Küche', 'Historischer Teststand']}, {name: 'Außenstand', historicalNames: ['Früherer Außenstand']}]},
      suppliers: [{id: 'supplier-a', name: 'Testmarkt Nord', email: null}, {id: 'supplier-b', name: 'Testbäckerei Süd', email: null}],
      articles: [{id: 'article-a', supplierId: 'supplier-a', name: 'Kartoffeln', unit: 'kg', category: 'Lebensmittel', unitPriceCents: 200}, {id: 'article-b', supplierId: 'supplier-b', name: 'Brötchen', unit: 'Stück', category: 'Lebensmittel', unitPriceCents: 40}],
      menu: [{id: 'dish-a', name: 'Kartoffelsuppe', priceCents: 500, category: 'Speise', recipeStatus: 'Bestätigt', recipe: [{articleId: 'article-a', quantity: 0.2}]}, {id: 'dish-b', name: 'Belegtes Brötchen', priceCents: 350, category: 'Speise', recipeStatus: 'Bestätigt', recipe: [{articleId: 'article-b', quantity: 1}]}],
      planLines: [], orders: [], dishPlan: [{id: `${id}-plan-f`, menuId: 'dish-a', day: 'Freitag', quantity: 20}, {id: `${id}-plan-s`, menuId: 'dish-a', day: 'Samstag', quantity: 30}],
      invoices: [], sales: [], movements: [], lessons: [], sourceNotice: 'Synthetische Prüfdaten · ausschließlich im Arbeitsspeicher.'};
    // Persisted aliases require an actual historic source in both domain and server policy.
    // Zero quantities on Allgemein keep Friday/Saturday orders and all economic totals intact.
    for (const [index, location] of ['Alte Küche', 'Historischer Teststand', 'Früherer Außenstand'].entries()) {
      state.planLines.push({id: `${id}-historic-${index}`, supplierId: 'supplier-a', articleId: 'article-a', name: 'Synthetische historische Ortsangabe', quantity: 0, unit: 'kg', day: 'Allgemein', time: null, unitPriceCents: 200, location, note: 'Synthetischer historischer Beleg der Ortsbezeichnung · Nullmenge'});
    }
    let serial = 0;
    const apply = (type: string, payload: unknown) => { state = applyOperation(state, {id: `${id}-op-${++serial}`, type, payload, baseRevision: state.revision}).state; };
    for (const supplier of state.suppliers) for (const day of ['Freitag', 'Samstag'] as const) {
      const article = state.articles.find(item => item.supplierId === supplier.id)!;
      const lineId = `${id}-${supplier.id}-${day}`;
      state.planLines.push({id: lineId, supplierId: supplier.id, articleId: article.id, name: article.name, quantity: 120, unit: article.unit, day, time: '10:00', unitPriceCents: article.unitPriceCents, location: 'Küche'});
      for (let version = 1; version <= 2; version++) {
        apply('order.prepare', {supplierId: supplier.id, day});
        state.orders.at(-1).createdAt = `2026-10-${17 + version}T10:00:00.000Z`;
        if (supplier.id === 'supplier-a' && day === 'Freitag' && version === 1) {
          const orderId = state.orders.at(-1).id;
          apply('delivery.accept', {orderId, day, location: 'Küche', note: 'Synthetische Teilannahme 110 von 120', lines: [{lineId, articleId: article.id, quantity: 110, substitutionConfirmed: false}]});
          apply('order.mark', {orderId, status: 'bestellt', note: 'Synthetisch manuell als bestellt markiert'});
          apply('order.mark', {orderId, status: 'bestaetigt', note: 'Synthetische Bestätigung'});
        }
      }
    }
    // Older context without a supplier snapshot must use the explicit current-name fallback.
    delete state.orders.find(order => order.supplierId === 'supplier-b' && order.day === 'Samstag').context;
    apply('sales.quantity', {menuId: 'dish-a', day: 'Freitag', quantity: 12});
    for (let i = 0; i < 10; i++) apply('sales.correctPrice', {saleId: state.sales[0].id, priceCents: 501 + i, reason: `Synthetischer Preisgrund ${i + 1}`});
    for (let i = 0; i < 10; i++) apply('lesson.add', {eventId: id, text: `Synthetische Erfahrung ${i + 1}`});
    return {get state() { return state; }, apply};
  }
  const current = event('fixture-open', 'TEST · Küchenwochenende');
  const closed = event('fixture-closed', 'TEST · Abgeschlossener Abend');
  for (let i = 0; i < 4; i++) {
    closed.apply('event.close', {eventId: closed.state.event.id, revision: closed.state.revision, confirmedScope: 'Küche', note: `Synthetische Abschlussprüfung ${i + 1}`});
    closed.apply('event.reopen', {eventId: closed.state.event.id, reason: `Synthetischer Wiederöffnungsgrund ${i + 1}`});
  }
  closed.apply('event.close', {eventId: closed.state.event.id, revision: closed.state.revision, confirmedScope: 'Küche', note: 'Synthetischer Schlussstand'});
  return {...current.state, archivedEvents: [eventSnapshot(closed.state)]};
}
