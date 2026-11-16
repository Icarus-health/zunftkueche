/* eslint-disable @rushstack/no-new-null -- Null preserves unknown amounts/prices during JSON persistence. */
import type { Area, Catalog, MasterKind, Order, Season } from './model';
import { isArea } from './model.ts';
import { validateSchedule } from './supplier-orders.ts';
import { validateDeliveryNotes, validateStoredReceipts } from './operations.ts';

const methods = ['Telefon', 'E-Mail', 'Onlineshop', 'Abholung'];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Datensatz ist ungültig.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, optional = false, max = 1000): string {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
    throw new Error(`${label} bitte prüfen.`);
  return value.trim();
}
function id(value: unknown): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,240}$/.test(value))
    throw new Error('Datensatzkennung ist ungültig.');
}
function bool(value: unknown): void {
  if (typeof value !== 'boolean') throw new Error('Auswahlwert ist ungültig.');
}
function number(value: unknown, label: string, nullable = false): void {
  if (nullable && value === null) return;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10000000 ||
    Math.abs(value * 10000 - Math.round(value * 10000)) > 0.0001
  )
    throw new Error(`${label} bitte als positive Zahl mit höchstens vier Nachkommastellen eingeben.`);
}
function date(value: unknown): void {
  if (value === null) return;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Datum bitte prüfen.');
}
function area(value: unknown): void {
  if (!isArea(value)) throw new Error('Bereich bitte wählen.');
}
function method(value: unknown): void {
  if (!methods.includes(String(value))) throw new Error('Bestellweg bitte wählen.');
}
function timestamp(value: unknown): void {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('Zeitpunkt ist ungültig.');
}

// Same German decimal input and unknown-versus-zero rule as the inspected kitchen domain.
export function parseDecimal(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+(,\d{1,4})?$/.test(value))
    throw new Error('Menge oder Preis bitte als positive Zahl mit Dezimalkomma eingeben.');
  const result = Number(value.replace(',', '.'));
  number(result, 'Wert');
  return result;
}
export function validateEntity(kind: MasterKind, value: unknown): void {
  const v = object(value);
  id(v.id);
  if (kind === 'seasons') {
    text(v.name, 'Saisonname', false, 160);
    if (!Number.isInteger(v.year) || Number(v.year) < 2000 || Number(v.year) > 2200)
      throw new Error('Jahr bitte zwischen 2000 und 2200 angeben.');
    bool(v.archived);
    for (const field of ['operatingDays', 'deliveryPlaces', 'storagePlaces', 'units']) {
      if (v[field] !== undefined) {
        if (!Array.isArray(v[field]) || (v[field] as unknown[]).length > 200)
          throw new Error('Saisoneinstellungen bitte prüfen.');
        for (const entry of v[field] as unknown[]) {
          text(entry, field, false, 160);
          if (field === 'operatingDays') date(entry);
        }
      }
    }
    if (v.contact !== undefined) text(v.contact, 'Ansprechpartner', true, 400);
    if (v.copyDates !== undefined) {
      const map = object(v.copyDates);
      for (const [from, to] of Object.entries(map)) {
        date(from);
        date(to);
      }
    }
  }
  if (kind === 'articles') {
    text(v.name, 'Artikelname', false, 160);
    text(v.unit, 'Einheit', false, 40);
    text(v.category, 'Kategorie', true, 80);
    bool(v.active);
    if (v.storagePlace !== undefined) text(v.storagePlace, 'Hauptlagerort', true, 160);
    if (v.unavailableSeasons !== undefined) {
      if (
        !Array.isArray(v.unavailableSeasons) ||
        v.unavailableSeasons.length > 200 ||
        new Set(v.unavailableSeasons).size !== v.unavailableSeasons.length
      )
        throw new Error('Saisonauswahl bitte prüfen.');
      for (const seasonId of v.unavailableSeasons) id(seasonId);
    }
  }
  if (kind === 'suppliers') {
    if (v.reviewStatus !== undefined && !['offen', 'geprueft'].includes(String(v.reviewStatus)))
      throw new Error('Prüfstatus bitte auswählen.');
    if (v.reviewDate) date(v.reviewDate);
    if (v.reviewStatus === 'geprueft' && !v.reviewDate) throw new Error('Bitte das Prüfdatum angeben.');
    if (v.reviewReason !== undefined) text(v.reviewReason, 'Prüfvermerk', true, 1000);
    text(v.name, 'Lieferant', false, 160);
    text(v.phone, 'Telefon', true, 100);
    text(v.email, 'E-Mail', true, 200);
    if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v.email))) throw new Error('E-Mail-Adresse bitte prüfen.');
    method(v.method);
    text(v.customerNumber, 'Kundennummer', true, 100);
    text(v.note, 'Hinweis', true);
    if (v.contactPerson !== undefined) text(v.contactPerson, 'Ansprechpartner', true, 160);
    if (v.address !== undefined) text(v.address, 'Adresse', true, 400);
    bool(v.active);
  }
  if (kind === 'offers') {
    if (v.priceStatus !== undefined && !['offen', 'angefragt', 'erhalten', 'geprueft'].includes(String(v.priceStatus)))
      throw new Error('Angebotsstatus bitte prüfen.');
    id(v.articleId);
    id(v.supplierId);
    text(v.code, 'Bestellnummer', true, 100);
    text(v.packName, 'Gebinde', false, 40);
    number(v.packSize, 'Gebindegröße');
    if (Number(v.packSize) <= 0) throw new Error('Gebindegröße muss größer als null sein.');
    number(v.priceNet, 'Nettopreis', true);
    number(v.deposit, 'Pfand', true);
    date(v.priceDate);
    text(v.note, 'Hinweis', true);
    bool(v.active);
  }
  if (kind === 'counts') {
    id(v.seasonId);
    area(v.area);
    id(v.articleId);
    text(v.articleName, 'Artikel', false, 160);
    text(v.unit, 'Einheit', false, 40);
    number(v.quantity, 'Menge');
    timestamp(v.countedAt);
    text(v.countedBy, 'Erfassende Person', false, 200);
    text(v.note, 'Hinweis', true);
    bool(v.reorder);
    if (v.surplus !== undefined) bool(v.surplus);
  }
}
export function validateOrder(order: Order, state?: Catalog, forDispatch = false): void {
  const v = object(order);
  id(v.id);
  id(v.seasonId);
  id(v.supplierId);
  area(v.area);
  text(v.supplierName, 'Lieferant', false, 160);
  method(v.method);
  text(v.occasion, 'Anlass', true, 160);
  date(v.deliveryDate);
  text(v.note, 'Hinweis', true);
  if (!['Entwurf', 'Bestellt', 'Abgeschlossen', 'Storniert'].includes(String(v.status)))
    throw new Error('Bestellstatus ist ungültig.');
  if (v.sourceId !== null) id(v.sourceId);
  if (
    v.sourceYear !== null &&
    (!Number.isInteger(v.sourceYear) || Number(v.sourceYear) < 2000 || Number(v.sourceYear) > 2200)
  )
    throw new Error('Bezugsjahr ist ungültig.');
  if (v.recordedBy !== null) text(v.recordedBy, 'Bestellende Person', false, 200);
  if (v.recordedAt !== null) timestamp(v.recordedAt);
  if (!Array.isArray(v.lines) || v.lines.length < 1 || v.lines.length > 200)
    throw new Error(
      Array.isArray(v.lines) && !v.lines.length
        ? 'Noch keine Menge eingetragen. Bitte bei mindestens einem Artikel eine Menge eintragen.'
        : 'Bitte zwischen einer und 200 Bestellpositionen angeben.'
    );
  const ids = new Set<string>();
  for (const raw of v.lines) {
    const l = object(raw);
    id(l.id);
    if (ids.has(String(l.id))) throw new Error('Doppelte Bestellposition.');
    ids.add(String(l.id));
    id(l.articleId);
    id(l.offerId);
    text(l.articleName, 'Artikel', false, 160);
    text(l.code, 'Bestellnummer', true, 100);
    text(l.unit, 'Einheit', false, 40);
    text(l.packName, 'Gebinde', false, 40);
    number(l.packSize, 'Gebindegröße');
    if (Number(l.packSize) <= 0) throw new Error('Gebindegröße muss größer als null sein.');
    number(l.quantity, 'Menge', true);
    number(l.priceNet, 'Nettopreis', true);
    number(l.priorPriceNet, 'Vorjahrespreis', true);
    bool(l.reviewed);
    if (
      l.priceYear !== null &&
      (!Number.isInteger(l.priceYear) || Number(l.priceYear) < 2000 || Number(l.priceYear) > 2200)
    )
      throw new Error('Preisjahr bitte prüfen.');
    if (
      (forDispatch || (v.status !== 'Entwurf' && v.status !== 'Storniert')) &&
      (!l.reviewed || l.quantity === null || l.quantity === 0)
    )
      throw new Error(
        l.quantity === null
          ? 'Bei „' +
              String(l.articleName) +
              '“ fehlt eine Menge. Bitte für jeden Liefertag eine Zahl eintragen, auch 0.'
          : l.quantity === 0
            ? '„' + String(l.articleName) + '“ hat die Menge 0. Bitte Menge eintragen oder den Artikel entfernen.'
            : 'Das Häkchen „Mengen und Gebinde geprüft“ fehlt noch.'
      );
  }
  if ((v.status === 'Bestellt' || v.status === 'Abgeschlossen') && (!v.recordedBy || !v.recordedAt))
    throw new Error('Bestellende Person und Zeitpunkt fehlen.');
  if (forDispatch && (order.status === 'Storniert' || !order.deliveryDate))
    throw new Error(
      order.status === 'Storniert'
        ? 'Diese Bestellung ist storniert.'
        : 'Der Liefertag fehlt. Bitte unter „Mengen bearbeiten“ bei „Liefertage“ ein Datum eintragen.'
    );
  validateSchedule(order, forDispatch);
  validateStoredReceipts(order);
  validateDeliveryNotes(order);
  if (state) {
    const season = state.seasons.find(s => s.id === order.seasonId);
    if (!season || season.archived) throw new Error('Bitte eine aktive Saison wählen.');
    if (!state.suppliers.some(s => s.id === order.supplierId && s.active))
      throw new Error('Lieferant fehlt oder ist inaktiv.');
    for (const l of order.lines) {
      const article = state.articles.find(a => a.id === l.articleId && a.active);
      if (!article) throw new Error('Artikel fehlt oder ist inaktiv.');
      const offer = state.offers.find(
        o => o.id === l.offerId && o.articleId === l.articleId && o.supplierId === order.supplierId && o.active
      );
      if (!offer) throw new Error('Lieferangebot passt nicht zum Artikel oder Lieferanten.');
      if (
        article.unit !== l.unit ||
        offer.packSize !== l.packSize ||
        offer.packName !== l.packName ||
        offer.code !== l.code
      )
        throw new Error(
          'Gebinde oder Einheit wurde inzwischen geändert. Bitte neu laden und die Position im Entwurf entfernen und erneut hinzufügen.'
        );
    }
  }
}
export function orderTotal(order: Order): number | null {
  if (!order.lines.length || order.lines.some(l => l.quantity === null || l.priceNet === null)) return null;
  const sum = order.lines.reduce(
    (total, l) => total + BigInt(Math.round(l.quantity! * 10000)) * BigInt(Math.round(l.priceNet! * 10000)),
    0n
  );
  if (sum > BigInt(Number.MAX_SAFE_INTEGER) * 1000000n) return null;
  return Number((sum + 500000n) / 1000000n) / 100;
}
function copyId(source: string): string {
  let a = 2166136261,
    b = 2246822519,
    c = 3266489917,
    d = 668265263;
  for (let i = 0; i < source.length; i++) {
    const x = source.charCodeAt(i);
    a = Math.imul(a ^ x, 16777619);
    b = Math.imul(b ^ x, 3266489917);
    c = Math.imul(c ^ x, 668265263);
    d = Math.imul(d ^ x, 374761393);
  }
  return 'copy-' + [a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}
export function copyOrder(
  source: Order,
  target: Season,
  targetArea: Area,
  state: Catalog,
  quantities: Record<string, number | null>
): Order {
  if (source.seasonId === target.id) throw new Error('Bitte eine andere Saison als das Vorjahr wählen.');
  if (source.status === 'Storniert') throw new Error('Stornierte Bestellungen bitte nicht übernehmen.');
  validateEntity('seasons', target);
  const supplier = state.suppliers.find(s => s.id === source.supplierId && s.active);
  if (!supplier) throw new Error('Lieferant fehlt oder ist inaktiv.');
  const sourceYear = state.seasons.find(s => s.id === source.seasonId)?.year;
  if (!sourceYear) throw new Error('Vorjahressaison fehlt.');
  const lines = source.lines
    .filter(l => Object.hasOwn(quantities, l.id))
    .map(l => {
      const article = state.articles.find(a => a.id === l.articleId && a.active);
      const offer = state.offers.find(
        o => o.id === l.offerId && o.active && o.articleId === l.articleId && o.supplierId === source.supplierId
      );
      if (!article || !offer)
        throw new Error(`Artikel oder Lieferangebot für ${l.articleName} fehlt oder ist inaktiv.`);
      return {
        ...l,
        articleName: article.name,
        unit: article.unit,
        code: offer.code,
        packName: offer.packName,
        packSize: offer.packSize,
        quantity: quantities[l.id],
        priceNet: null,
        priorPriceNet: l.priceNet,
        priceYear: sourceYear,
        reviewed: false
      };
    });
  const result: Order = {
    ...structuredClone(source),
    id: copyId(`${source.id}|${target.id}|${targetArea}`),
    seasonId: target.id,
    area: targetArea,
    supplierName: supplier.name,
    status: 'Entwurf',
    deliveryDate: null,
    method: supplier.method,
    recordedAt: null,
    recordedBy: null,
    sourceId: source.id,
    sourceYear,
    lines
  };
  delete result.receipts;
  delete result.deliveryNotes;
  validateOrder(result, state);
  return result;
}
