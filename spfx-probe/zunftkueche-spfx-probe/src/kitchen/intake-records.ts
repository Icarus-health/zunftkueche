/* eslint-disable @rushstack/no-new-null -- Leere Mengen bleiben ausdrücklich unbekannt, wie im Datenmodell. */
// Eingang: aus bestätigten Zeilen werden Datensätze. Hier steht keine KI mehr, nur Stammdaten und Rechenregeln.
// Gespeichert wird über die vorhandenen Wege: Bestandsmeldung und Bestellentwurf.
import type { Area, Count, Order, OrderLine, Supplier, Workspace } from './model';
import { articleAvailable, catalog } from './model.ts';
import { validateEntity, validateOrder } from './domain.ts';
import { countQuantity } from './operations.ts';
import { withSchedule } from './supplier-orders.ts';
import { documents } from './ww/model.ts';
import { effectiveOffer } from './ww/domain.ts';
import { dayLabel } from './ww/common.ts';
import { quantityUnit, unitName } from './units.ts';
import { n } from './markup.ts';
import type { IntakeContext } from './ai/intake';

/** Eine Zeile, wie ein Mensch sie auf der Karte bestätigt hat. */
export interface ConfirmedLine {
  kind: 'count' | 'reorder';
  spoken: string;
  articleId: string;
  /** Leer = Einzelmenge ohne Gebinde. */
  offerId: string;
  packs: number | null;
  loose: number | null;
  reorder: boolean;
  day: string;
}
export interface RecordScope {
  seasonId: string;
  area: Area;
  user: string;
  /** Zeitpunkt als ISO-Text. */
  now: string;
  /** Liefert je Aufruf eine neue Kennung. */
  id: () => string;
}

const sourceNote = (spoken: string): string => ('Eingang: „' + spoken.trim().slice(0, 300) + '“').slice(0, 400);

/** Was das Modell für die Zuordnung braucht: verfügbare Artikel mit ihren Gebinden und die aktiven Lieferanten. */
export function intakeContext(state: Workspace, seasonId: string, area: Area, today: string): IntakeContext {
  const suppliers = state.suppliers.map(s => s.value).filter(s => s.active && !s.mergedInto);
  const active = new Map(suppliers.map(s => [s.id, s]));
  return {
    area,
    today,
    suppliers: suppliers.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, 'de')),
    articles: state.articles
      .map(a => a.value)
      .filter(a => articleAvailable(a, seasonId))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(a => ({
        id: a.id,
        name: a.name,
        unit: a.unit,
        category: a.category,
        packs: state.offers
          .map(o => o.value)
          .filter(o => o.active && o.articleId === a.id && active.has(o.supplierId))
          .map(o => ({
            offerId: o.id,
            supplierId: o.supplierId,
            supplier: active.get(o.supplierId)!.name,
            packName: o.packName,
            packSize: o.packSize
          }))
      }))
  };
}

/** Bestandsmeldungen aus den bestätigten Zählzeilen. Wirft mit einem verständlichen Satz, wenn eine Zeile nicht gespeichert werden kann. */
export function buildCounts(lines: ConfirmedLine[], state: Workspace, scope: RecordScope): Count[] {
  const seen = new Set<string>();
  return lines
    .filter(l => l.kind === 'count')
    .map(line => {
      const article = state.articles.find(a => a.value.id === line.articleId)?.value;
      if (!article || !articleAvailable(article, scope.seasonId))
        throw new Error('Bei „' + line.spoken + '“ fehlt der Artikel. Bitte wählen.');
      if (seen.has(article.id)) throw new Error(article.name + ' kommt zweimal vor. Bitte eine Zeile entfernen.');
      seen.add(article.id);
      const offer = line.offerId
        ? state.offers.find(o => o.value.id === line.offerId && o.value.active && o.value.articleId === article.id)
            ?.value
        : undefined;
      if (line.offerId && !offer)
        throw new Error('Das Gebinde von ' + article.name + ' wurde geändert. Bitte neu wählen.');
      if (!offer && line.packs)
        throw new Error('Bei ' + article.name + ' ist kein Gebinde gewählt. Bitte die Einzelmenge eintragen.');
      const quantity = countQuantity(offer ? line.packs : null, line.loose, offer ? offer.packSize : 1);
      if (quantity === null) throw new Error('Bei ' + article.name + ' fehlt die Menge. Null ist eine gültige Menge.');
      const value: Count = {
        id: scope.id(),
        seasonId: scope.seasonId,
        area: scope.area,
        articleId: article.id,
        articleName: article.name,
        unit: article.unit,
        quantity,
        countedAt: scope.now,
        countedBy: scope.user,
        note: sourceNote(line.spoken),
        reorder: line.reorder
      };
      validateEntity('counts', value);
      return value;
    });
}

/** Bestellentwürfe aus den bestätigten Bestellzeilen: einer je Lieferant und Liefertag. */
export function buildOrders(lines: ConfirmedLine[], state: Workspace, scope: RecordScope): Order[] {
  const groups = new Map<string, { supplier: Supplier; day: string; lines: OrderLine[]; spoken: string[] }>();
  const prices = documents(state.ww, 'prices');
  for (const line of lines.filter(l => l.kind === 'reorder')) {
    const article = state.articles.find(a => a.value.id === line.articleId)?.value;
    if (!article || !articleAvailable(article, scope.seasonId))
      throw new Error('Bei „' + line.spoken + '“ fehlt der Artikel. Bitte wählen.');
    const offer = state.offers.find(
      o => o.value.id === line.offerId && o.value.active && o.value.articleId === article.id
    )?.value;
    if (!offer) throw new Error('Bei ' + article.name + ' fehlen Lieferant und Gebinde. Bitte wählen.');
    const supplier = state.suppliers.find(s => s.value.id === offer.supplierId && s.value.active)?.value;
    if (!supplier) throw new Error('Der Lieferant für ' + article.name + ' ist nicht mehr aktiv.');
    if (line.packs === null || !Number.isInteger(line.packs) || line.packs <= 0 || line.packs > 1000)
      throw new Error('Bei ' + article.name + ' bitte die Bestellmenge als ganze Zahl eintragen.');
    if (line.day && (!/^\d{4}-\d{2}-\d{2}$/.test(line.day) || line.day < scope.now.slice(0, 10)))
      throw new Error('Der Liefertag für ' + article.name + ' liegt in der Vergangenheit.');
    const key = supplier.id + '|' + line.day;
    const group = groups.get(key) || { supplier, day: line.day, lines: [], spoken: [] };
    groups.set(key, group);
    group.spoken.push(line.spoken);
    const same = group.lines.find(l => l.offerId === offer.id);
    if (same) same.quantity = (same.quantity || 0) + line.packs;
    else
      group.lines.push({
        id: scope.id(),
        articleId: article.id,
        offerId: offer.id,
        articleName: article.name,
        code: offer.code,
        unit: article.unit,
        packName: offer.packName,
        packSize: offer.packSize,
        quantity: line.packs,
        priceNet: effectiveOffer(offer, prices, line.day || scope.now.slice(0, 10)).priceNet,
        priorPriceNet: null,
        priceYear: null,
        reviewed: false
      });
  }
  return [...groups.values()].map(group => {
    const order = withSchedule({
      id: scope.id(),
      seasonId: scope.seasonId,
      area: scope.area,
      supplierId: group.supplier.id,
      supplierName: group.supplier.name,
      status: 'Entwurf',
      occasion: ('Nachbestellung' + (group.day ? ' ' + dayLabel(group.day) : '')).slice(0, 160),
      deliveryDate: group.day || null,
      method: group.supplier.method,
      note: sourceNote(group.spoken.join(' · ')),
      sourceId: null,
      sourceYear: null,
      recordedBy: null,
      recordedAt: null,
      lines: group.lines
    });
    validateOrder(order, catalog(state));
    return order;
  });
}

/** Kurzer Text für Anruf oder WhatsApp. Nennt nur, was im Entwurf steht. */
export function reorderMessage(order: Order, supplier: Supplier): string {
  const rows = order.lines
    .filter(l => l.quantity)
    .map(
      l =>
        '– ' +
        n(l.quantity) +
        ' ' +
        // „Kiste 20 × 0,33“ heißt im Satz „Kisten“: der Inhalt steht dahinter.
        quantityUnit(l.quantity, l.packName.split(' ')[0]) +
        ' ' +
        l.articleName +
        (l.code ? ' (' + l.code + ')' : '') +
        (l.packSize !== 1 ? ', je ' + n(l.packSize) + ' ' + unitName(l.unit, l.packSize) : '')
    );
  return [
    'Hallo, hier ist die Schelmenzunft Staufen, ' + order.area + '.',
    'Wir möchten nachbestellen' + (order.deliveryDate ? ' für ' + dayLabel(order.deliveryDate) : '') + ':',
    ...rows,
    ...(supplier.customerNumber ? ['Kundennummer ' + supplier.customerNumber] : []),
    'Bitte kurz bestätigen. Danke!'
  ].join('\n');
}
