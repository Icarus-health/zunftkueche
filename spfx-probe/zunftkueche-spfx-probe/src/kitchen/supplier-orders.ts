/* eslint-disable @rushstack/no-new-null -- Unknown dates and quantities are explicit business values. */
import type { Area, Delivery, Order, Season, Workspace } from './model';
import { catalog } from './model.ts';
import { copyOrder } from './domain.ts';
import { effectiveOffer } from './ww/domain.ts';
import { documents } from './ww/model.ts';

const round = (n: number): number => Math.round(n * 10000) / 10000;
const key = (v: unknown): boolean => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,240}$/.test(v);
function amount(v: unknown): asserts v is number | null {
 if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10000000 || Math.abs(v * 10000 - Math.round(v * 10000)) > .0001)) throw new Error('Menge in der Lieferaufteilung bitte prüfen.');
}
export function validDate(v: unknown): v is string {
 return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function scheduledOrder(order: Order): Order {
 const result = structuredClone(order);
 if (!result.deliveries) return result;
 result.deliveryDate = result.deliveries.map(d => d.date).filter((d): d is string => !!d).sort()[0] || null;
 for (const line of result.lines) {
  const values = result.deliveries.map(d => line.schedule?.[d.id] ?? null);
  line.quantity = values.some(q => q === null) ? null : round(values.reduce<number>((a, q) => a + (q || 0), 0));
 }
 return result;
}
export function validateSchedule(order: Order): void {
 if (!order.deliveries) {
  if (order.lines.some(l => l.schedule || l.sources) || order.contributions) throw new Error('Lieferaufteilung ohne Liefertermine.');
  return;
 }
 if (!Array.isArray(order.deliveries) || !order.deliveries.length || order.deliveries.length > 31) throw new Error('Bitte 1 bis 31 Liefertermine angeben.');
 const ids = new Set<string>(), dates = new Set<string>();
 for (const d of order.deliveries) {
  if (!d || !key(d.id) || ids.has(d.id)) throw new Error('Doppelter oder ungültiger Liefertermin.');
  ids.add(d.id);
  if (d.date !== null && (!validDate(d.date) || dates.has(d.date))) throw new Error('Datum bitte prüfen; je Datum einen Liefertermin verwenden.');
  if (order.status !== 'Entwurf' && order.status !== 'Storniert' && !d.date) throw new Error('Datum für jeden Liefertermin bestätigen.');
  if (d.date) dates.add(d.date);
  if (typeof d.time !== 'string' || d.time.length > 100 || typeof d.place !== 'string' || d.place.length > 200) throw new Error('Zeit und Lieferort bitte prüfen.');
 }
 if (order.supplierNote !== undefined && (typeof order.supplierNote !== 'string' || order.supplierNote.length > 1000)) throw new Error('Mitteilung an Lieferanten bitte kürzen.');
 for (const line of order.lines) {
  if (!line.schedule || typeof line.schedule !== 'object' || Array.isArray(line.schedule) || Object.keys(line.schedule).some(id => !ids.has(id))) throw new Error('Lieferaufteilung der Position passt nicht zu den Terminen.');
  for (const d of order.deliveries) { if (!Object.hasOwn(line.schedule, d.id)) throw new Error('Menge für jeden Liefertermin prüfen.'); amount(line.schedule[d.id]); }
  const expected = scheduledOrder({ ...order, lines: [line] }).lines[0].quantity;
  if (line.quantity !== expected) throw new Error('Gesamtmenge stimmt nicht mit der Lieferaufteilung überein.');
  if (line.sources !== undefined) {
   if (!Array.isArray(line.sources) || line.sources.length > 200) throw new Error('Rezeptherkunft bitte prüfen.');
   const seen = new Set<string>();
   for (const s of line.sources) { if (!key(s.planId) || !ids.has(s.deliveryId) || seen.has(s.planId + ':' + s.deliveryId)) throw new Error('Rezeptbedarf wurde mehrfach zugeordnet.'); amount(s.quantity); if (s.quantity === null) throw new Error('Rezeptmenge fehlt.'); seen.add(s.planId + ':' + s.deliveryId); }
   for (const d of order.deliveries) if (line.sources.filter(s => s.deliveryId === d.id).reduce((a, s) => a + s.quantity, 0) > (line.schedule[d.id] ?? 0) + .00001) throw new Error('Menge ist kleiner als der zugeordnete Rezeptbedarf. Bitte zuerst den Portionsplan aktualisieren.');
  }
 }
 if (order.deliveryDate !== scheduledOrder(order).deliveryDate) throw new Error('Erster Liefertermin passt nicht zur Aufteilung.');
 if (order.contributions !== undefined) {
  if (!Array.isArray(order.contributions) || order.contributions.length > 200) throw new Error('Bedarfsanrechnungen bitte prüfen.');
  const seen = new Set<string>();
  for (const c of order.contributions) { if (!key(c.planId) || !key(c.articleId) || seen.has(c.planId + ':' + c.articleId)) throw new Error('Doppelte Bedarfsanrechnung.'); seen.add(c.planId + ':' + c.articleId); amount(c.stockUse); amount(c.incomingUse); if (c.stockUse === null || c.incomingUse === null) throw new Error('Anrechnung fehlt.'); }
 }
}
export function deliveryRemaining(order: Order, lineId: string, deliveryId: string): number {
 const line = order.lines.find(l => l.id === lineId);
 const received = (order.receipts || []).filter(r => r.deliveryId === deliveryId).reduce((sum, r) => sum + r.lines.filter(l => l.lineId === lineId).reduce((a, l) => a + l.quantity, 0), 0);
 return Math.max(0, round((line?.schedule?.[deliveryId] || 0) - received));
}
export function withSchedule(order: Order, initial?: Delivery[]): Order {
 if (order.deliveries) return structuredClone(order);
 const deliveries = initial?.length ? structuredClone(initial) : [{ id: 'delivery-1', date: order.deliveryDate, time: '', place: order.area }];
 return scheduledOrder({ ...structuredClone(order), deliveries, lines: order.lines.map(l => ({ ...l, schedule: Object.fromEntries(deliveries.map((d, i) => [d.id, i ? 0 : l.quantity])) })) });
}
export function copyScheduledOrder(source: Order, target: Season, area: Area, state: Workspace, dates: Record<string, string>): Order {
 const old = withSchedule(source);
 if (old.deliveries!.some(d => !validDate(dates[d.id]))) throw new Error('Bitte für jeden Liefertermin das neue Datum bestätigen.');
 const quantities = Object.fromEntries(old.lines.map(l => [l.id, l.quantity ?? 0]));
 const { deliveries: _deliveries, contributions: _contributions, ...legacy } = source;
 legacy.lines = source.lines.map(l => { const { schedule: _schedule, sources: _sources, ...clean } = l; return clean; });
 const base = copyOrder(legacy, target, area, catalog(state), quantities);
 base.deliveries = old.deliveries!.map(d => ({ ...d, date: dates[d.id] }));
 base.lines = base.lines.map(l => {
  const offer = state.offers.find(o => o.value.id === l.offerId)!.value;
  const prior = old.lines.find(x => x.id === l.id)!;
  if (offer.packSize !== prior.packSize || offer.packName !== prior.packName || l.unit !== prior.unit) throw new Error('Gebinde oder Einheit wurde geändert. Bitte die Mengen neu planen: ' + l.articleName);
  const quoted = effectiveOffer(offer, documents(state.ww, 'prices'), base.deliveries![0].date!);
  const { sources: _sources, ...clean } = l;
  return { ...clean, schedule: structuredClone(prior.schedule!), quantity: prior.quantity, priceNet: quoted.priceNet };
 });
 delete base.contributions;
 delete base.receipts;
 base.note = '';
 base.supplierNote = source.supplierNote || '';
 const result = scheduledOrder(base);
 validateSchedule(result);
 return result;
}
