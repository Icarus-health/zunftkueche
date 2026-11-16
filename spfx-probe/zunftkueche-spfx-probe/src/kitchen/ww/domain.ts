/* eslint-disable @rushstack/no-new-null -- Explicit unknown values survive persistence. */
import type { Area, Offer, Order, Workspace } from '../model';
import type {
  Bill,
  BillCostAssignment,
  BillRelations,
  Movement,
  Plan,
  PriceList,
  Recipe,
  Slot,
  SystemImport,
  Template,
  WwDocument
} from './model';
import { articleAvailable } from '../model.ts';
import { validInboxSource } from './inbox.ts';
import { documents, importPurposes, billLineRoles } from './model.ts';
import { latestCounts } from '../operations.ts';
export const round = (n: number): number => Math.round((n + Number.EPSILON) * 10000) / 10000;
export const cents = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export function validDate(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Datum bitte prüfen.');
}
export function amount(value: unknown, nullable = false, signed = false): void {
  if (nullable && value === null) return;
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > 10000000 ||
    (!signed && value < 0) ||
    Math.abs(value * 10000 - Math.round(value * 10000)) > 0.0001
  )
    throw new Error('Menge oder Betrag bitte prüfen (höchstens vier Nachkommastellen).');
}
export function key(value: unknown): void {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-]{1,240}$/.test(value)) throw new Error('Kennung bitte prüfen.');
}
export function text(value: unknown, label: string, max = 1000, optional = false): void {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()))
    throw new Error(label + ' bitte prüfen.');
}
const area = (v: unknown): void => {
  if (v !== 'Küche' && v !== 'Zunftscheuer') throw new Error('Bereich bitte prüfen.');
};
function list(value: unknown, max = 200): void {
  if (!Array.isArray(value) || value.length > max)
    throw new Error('Positionsliste bitte prüfen (höchstens ' + max + ').');
}
function unique(values: string[]): void {
  if (new Set(values).size !== values.length) throw new Error('Doppelte Position.');
}
export function validateDocument(v: WwDocument): void {
  if (!v || typeof v !== 'object') throw new Error('Vorgang fehlt.');
  key(v.id);
  key(v.scope);
  text(v.by, 'Person', 200);
  if (!Number.isFinite(Date.parse(v.at))) throw new Error('Zeitpunkt bitte prüfen.');
  if (typeof v.confirmed !== 'boolean') throw new Error('Bestätigung bitte prüfen.');
  if ((v.kind === 'bill' || v.kind === 'system') && v.sourceFile !== undefined && !validInboxSource(v.sourceFile))
    throw new Error('Dateiverweis aus dem Eingang ist ungültig.');
  if (v.kind === 'allocation') {
    area(v.area);
    list(v.entries, 500);
    unique(v.entries.map(e => e.planId + ':' + e.articleId));
    for (const e of v.entries) {
      key(e.planId);
      key(e.articleId);
      validDate(e.date);
      amount(e.stockUse);
      amount(e.incomingUse);
    }
  } else if (v.kind === 'billLink') {
    validateBillRelations(v);
    key(v.billId);
    area(v.area);
    list(v.orderIds);
    unique(v.orderIds);
    v.orderIds.forEach(key);
    text(v.reason, 'Grund der Zuordnung');
    if (!v.confirmed) throw new Error('Bestellzuordnung bitte bestätigen.');
  } else if (v.kind === 'slot') {
    text(v.name, 'Terminname', 160);
    validDate(v.date);
    text(v.time, 'Zeitfenster', 80, true);
    text(v.place, 'Ort', 160, true);
  } else if (v.kind === 'rule') {
    if (v.cutoffTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v.cutoffTime)))
      throw new Error('Bestellschluss bitte als Uhrzeit HH:MM angeben.');
    if (v.deadlineOverrides !== undefined) {
      for (const [day, time] of Object.entries(v.deadlineOverrides as Record<string, string>)) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
          !Number.isFinite(Date.parse(time)) ||
          time.slice(0, 10) > day
        )
          throw new Error('Abweichenden Bestellschluss und Lieferdatum bitte prüfen.');
      }
    }
    key(v.supplierId);
    list(v.weekdays, 7);
    unique(v.weekdays.map(String));
    if (v.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('Wochentage bitte prüfen.');
    if (!Number.isInteger(v.leadDays) || v.leadDays < 0 || v.leadDays > 365) throw new Error('Vorlauf bitte prüfen.');
    text(v.cutoff, 'Bestellschluss', 80, true);
    amount(v.minNet, true);
    amount(v.feeNet, true);
    text(v.note, 'Hinweis', 1000, true);
  } else if (v.kind === 'template') {
    key(v.supplierId);
    area(v.area);
    text(v.name, 'Vorlagenname', 160);
    list(v.lines);
    if (!v.lines.length) throw new Error('Bitte mindestens eine Position aufnehmen.');
    unique(v.lines.map(l => l.offerId));
    for (const l of v.lines) {
      key(l.offerId);
      amount(l.quantity, true);
    }
    text(v.note, 'Hinweis', 1000, true);
  } else if (v.kind === 'prices') {
    key(v.supplierId);
    text(v.name, 'Preislistenname', 160);
    validDate(v.validFrom);
    list(v.lines);
    if (!v.lines.length) throw new Error('Preispositionen fehlen.');
    unique(v.lines.map(l => l.offerId));
    for (const l of v.lines) {
      key(l.offerId);
      amount(l.priceNet, true);
      amount(l.deposit, true);
    }
  } else if (v.kind === 'recipe') {
    key(v.familyId);
    text(v.name, 'Rezeptname', 160);
    text(v.category, 'Kategorie', 80, true);
    amount(v.yield);
    if (v.yield <= 0) throw new Error('Ausbeute muss größer als null sein.');
    amount(v.salePriceGross, true);
    list(v.ingredients);
    if (v.confirmed && !v.ingredients.length) throw new Error('Bestätigte Zutaten fehlen.');
    unique(v.ingredients.map(l => l.articleId));
    for (const l of v.ingredients) {
      key(l.articleId);
      amount(l.quantity);
      if (l.quantity <= 0) throw new Error('Zutatenmenge muss größer als null sein.');
      text(l.unit, 'Einheit', 40);
    }
  } else if (v.kind === 'plan') {
    text(v.name, 'Planname', 160);
    area(v.area);
    validDate(v.date);
    list(v.lines);
    unique(v.lines.map(l => l.recipeId));
    for (const l of v.lines) {
      key(l.recipeId);
      amount(l.portions);
    }
    const materials = v.materials === undefined ? [] : v.materials;
    list(materials);
    unique(materials.map(l => l.articleId));
    for (const l of materials) {
      key(l.articleId);
      amount(l.quantity);
      if (l.quantity === 0) throw new Error('Materialmenge muss größer als null sein.');
      text(l.unit, 'Einheit', 40);
    }
    text(v.note, 'Hinweis', 1000, true);
  } else if (v.kind === 'equipment') {
    area(v.area);
    text(v.name, 'Arbeitsmittel', 160);
    amount(v.needed);
    amount(v.available, true);
    if (!Number.isInteger(v.needed) || (v.available !== null && !Number.isInteger(v.available)))
      throw new Error('Für Arbeitsmittel bitte ganze Stückzahlen eingeben.');
    if (!['prüfen', 'besorgen', 'ausleihen'].includes(v.action))
      throw new Error('Bitte auswählen, was noch zu tun ist.');
    text(v.note, 'Hinweis', 1000, true);
  } else if (v.kind === 'deliverySlip') {
    area(v.area);
    key(v.orderId);
    if (v.deliveryId !== undefined) key(v.deliveryId);
    text(v.name, 'Dateiname', 160);
    if (!/^[a-f0-9]{64}$/.test(v.fileHash) || !['pdf', 'jpg', 'png'].includes(v.extension))
      throw new Error('Lieferscheinformat oder Prüfsumme bitte prüfen.');
    if (v.confirmed && v.attachment !== 'original-' + v.fileHash + '.' + v.extension)
      throw new Error('Gespeichertes Lieferscheinoriginal fehlt.');
  } else if (v.kind === 'movement') {
    area(v.area);
    key(v.articleId);
    amount(v.quantity);
    if (v.quantity === 0 && !['opening', 'count'].includes(v.type)) throw new Error('Menge muss größer als null sein.');
    text(v.unit, 'Einheit', 40);
    if (!['incoming', 'return', 'waste', 'internal', 'transfer', 'opening', 'count'].includes(v.type))
      throw new Error('Bewegungsart bitte prüfen.');
    text(v.place, 'Lagerort', 160, true);
    text(v.toPlace, 'Zielort', 160, true);
    if (v.type === 'transfer') {
      area(v.toArea);
      if (v.area === v.toArea && v.place === v.toPlace)
        throw new Error('Ziel und Ausgangsort müssen verschieden sein.');
    } else if (v.toArea !== null) throw new Error('Nur Umlagerungen haben einen Zielbereich.');
    text(v.note, 'Hinweis', 1000, true);
  } else if (v.kind === 'bill') validateBill(v);
  else if (v.kind === 'profile') {
    text(v.name, 'Profilname', 160);
    if (!importPurposes.includes(v.purpose)) throw new Error('Importzweck bitte prüfen.');
    if (
      ![';', ',', '\t'].includes(v.separator) ||
      ![',', '.'].includes(v.decimalSeparator) ||
      !['iso', 'de', 'excel'].includes(v.dateFormat) ||
      !['net', 'gross', 'unknown'].includes(v.basis)
    )
      throw new Error('Importformat bitte prüfen.');
    if (!v.columnMap || typeof v.columnMap !== 'object') throw new Error('Spaltenzuordnung fehlt.');
    const allowed = [
      'externalId',
      'productCode',
      'productName',
      'quantity',
      'unit',
      'date',
      'status',
      'amount',
      'currency',
      'paymentMethod'
    ];
    for (const [k, n] of Object.entries(v.columnMap)) {
      if (!allowed.includes(k) || !Number.isInteger(n) || n! < 0 || n! > 500)
        throw new Error('Spaltenzuordnung bitte prüfen.');
    }
    list(v.mappings, 500);
    unique(v.mappings.map(m => m.externalCode));
    for (const m of v.mappings) {
      text(m.externalCode, 'Externer Artikel', 200);
      key(m.productId);
      amount(m.factor);
      if (m.factor <= 0) throw new Error('Umrechnung bitte prüfen.');
    }
    for (const statuses of [v.activeStatuses, v.cancelledStatuses, v.refundStatuses]) {
      list(statuses, 30);
      for (const s of statuses) text(s, 'Status', 80);
    }
    unique([...v.activeStatuses, ...v.cancelledStatuses, ...v.refundStatuses].map(s => s.trim().toLocaleLowerCase()));
  } else if (v.kind === 'system') {
    if (v.originalExtension !== undefined && !['csv', 'xlsx'].includes(v.originalExtension))
      throw new Error('Format des Importoriginals bitte prüfen.');
    if (v.attachment !== undefined && !/^original-[a-f0-9]{64}\.(csv|xlsx)$/.test(String(v.attachment)))
      throw new Error('Importoriginal-Verweis bitte prüfen.');
    if (v.replacesId) {
      key(v.replacesId);
      if (v.replacesId === v.id) throw new Error('Import kann sich nicht selbst ersetzen.');
    }
    area(v.area);
    key(v.sourceId);
    text(v.name, 'Importname', 160);
    if (!importPurposes.includes(v.purpose) || !['net', 'gross', 'unknown'].includes(v.basis))
      throw new Error('Importzweck oder Preisart bitte prüfen.');
    validDate(v.from);
    validDate(v.to);
    if (v.from > v.to) throw new Error('Zeitraum bitte prüfen.');
    if (!/^[a-f0-9]{64}$/.test(v.fileHash) || !/^[a-f0-9]{64}$/.test(v.canonicalKey))
      throw new Error('Dateiprüfsumme bitte prüfen.');
    text(v.currency, 'Währung', 3);
    if (!/^[A-Z]{3}$/.test(v.currency)) throw new Error('Währung bitte prüfen.');
    list(v.rows, 500);
    if (!v.rows.length) throw new Error('Importzeilen fehlen.');
    for (const r of v.rows) {
      text(r.externalId, 'Externe Kennung', 200, true);
      if (r.date !== null) {
        validDate(r.date);
        if (r.date < v.from || r.date > v.to) throw new Error('Zeilendatum liegt außerhalb des Zeitraums.');
      }
      if (!['active', 'cancelled', 'refund'].includes(r.status)) throw new Error('Importstatus bitte prüfen.');
    }
    if (v.purpose === 'payments') {
      if (v.basis !== 'unknown' || !Array.isArray(v.recipes) || v.recipes.length)
        throw new Error('Zahlungen haben keine Rezeptur oder Umsatz-Preisart.');
      for (const r of v.rows) {
        if ('productId' in r || 'quantity' in r) throw new Error('Zahlungszeilen enthalten nur Beträge.');
        text(r.paymentMethod, 'Zahlart', 100, true);
        amount(r.amount, false, true);
        if ((r.status === 'active' && r.amount < 0) || (r.status === 'refund' && r.amount > 0))
          throw new Error('Vorzeichen und Zahlungsstatus passen nicht zusammen.');
      }
    } else {
      list(v.recipes);
      unique(v.recipes.map(r => r.id));
      for (const r of v.recipes) {
        validateDocument(r);
        if (!r.confirmed) throw new Error('Rezepturversion bitte bestätigen.');
      }
      for (const r of v.rows) {
        validDate(r.date);
        key(r.productId);
        text(r.name, 'Produkt', 160);
        amount(r.quantity);
        amount(r.amount, true, true);
        if (!v.recipes.some(p => p.id === r.productId)) throw new Error('Produktzuordnung oder Rezepturversion fehlt.');
      }
    }
  } else throw new Error('Unbekannte Vorgangsart.');
  if (JSON.stringify(v).length > 56000)
    throw new Error('Der Vorgang ist zu groß. Bitte weniger Positionen gemeinsam übernehmen; es wird nichts gekürzt.');
}
function validateBillRelations(v: BillRelations): void {
  validateBillCostAssignment(v.costAssignment);
  if (v.creditForId) key(v.creditForId);
  if (v.returnIds !== undefined) {
    list(v.returnIds, 100);
    unique(v.returnIds);
    v.returnIds.forEach(key);
  }
}
export function validateBillCostAssignment(value: BillCostAssignment | null | undefined, gross?: number | null): void {
  if (value === undefined || value === null || value.mode === 'open') return;
  if (value.mode !== 'split') throw new Error('Kostenstelle bitte prüfen.');
  const shares = [value.kitchen, value.scheuer, value.other];
  for (const share of shares) {
    amount(share, false, true);
    if (cents(share) !== share) throw new Error('Kostenanteile bitte centgenau eintragen.');
  }
  if (gross === undefined) return;
  if (
    gross === null ||
    cents(shares.reduce((sum, share) => sum + share, 0)) !== gross ||
    shares.some(share => share !== 0 && Math.sign(share) !== Math.sign(gross))
  )
    throw new Error('Die Kostenanteile müssen mit Vorzeichen zusammen dem Bruttobetrag entsprechen.');
}
export function validateBill(v: Bill): void {
  validateBillRelations(v);
  if (v.needsSeparateFiles !== undefined && v.needsSeparateFiles !== true)
    throw new Error('PDF-Prüfstatus ist ungültig.');
  const review = v.scanNumberReview;
  if (review !== undefined) {
    if (
      !review ||
      !v.fileHash ||
      (review.status !== 'open' && review.status !== 'reviewed') ||
      (review.status === 'open') !== !!v.needsSeparateFiles
    )
      throw new Error('Prüfung der Belegnummern ist ungültig.');
    if (review.status === 'reviewed') {
      text(review.reason, 'Begründung der Belegprüfung', 300);
      text(review.by, 'Geprüft von', 160);
      if (!Number.isFinite(Date.parse(review.at))) throw new Error('Zeitpunkt der Belegprüfung fehlt.');
    }
  }
  if (v.confirmed && v.needsSeparateFiles) throw new Error('Mehrere Belege erkannt. Bitte Einzelbelege verwenden.');
  if (v.confirmed) validateBillCostAssignment(v.costAssignment, v.gross);
  if (v.billType !== undefined && !['invoice', 'credit'].includes(v.billType))
    throw new Error('Belegart bitte prüfen.');
  if (v.creditForId && (v.billType !== 'credit' || v.creditForId === v.id))
    throw new Error('Bitte eine passende Originalrechnung für die Gutschrift wählen.');
  if (v.supplierId || !v.needsSeparateFiles || !(v.sourceFile || review?.status === 'open') || !v.fileHash)
    key(v.supplierId);
  text(v.name, 'Belegname', 160);
  text(v.number, 'Rechnungsnummer', 160, !v.confirmed);
  validDate(v.date);
  area(v.area);
  list(v.orderIds);
  unique(v.orderIds);
  v.orderIds.forEach(key);
  text(v.fileName, 'Dateiname', 240, true);
  text(v.attachment, 'Originalverweis', 240, true);
  if (v.fileHash && !/^[a-f0-9]{64}$/.test(v.fileHash)) throw new Error('Dateiprüfsumme bitte prüfen.');
  amount(v.net, true, true);
  amount(v.tax, true, true);
  amount(v.gross, true, true);
  amount(v.adjustmentNet, false, true);
  text(v.note, 'Hinweis', 1000, true);
  list(v.lines);
  unique(v.lines.map(l => l.id));
  for (const l of v.lines) {
    key(l.id);
    if (l.articleId !== null) key(l.articleId);
    text(l.name, 'Positionsname', 240);
    text(l.unit, 'Einheit', 40, true);
    if (l.role !== undefined && !billLineRoles.includes(l.role)) throw new Error('Positionsart bitte prüfen.');
    amount(l.quantity, true, l.role === 'return' || l.role === 'deposit' || l.role === 'open');
    amount(l.unitNet, true, l.role !== 'goods');
    amount(l.totalNet, true, l.role !== 'goods');
    if (l.role === 'return' && l.totalNet !== null && l.totalNet > 0)
      throw new Error('Bitte den Nettobetrag der Warenrückgabe negativ erfassen.');
    amount(l.taxRate, true);
    if (l.taxRate !== null && l.taxRate > 100) throw new Error('Steuersatz bitte prüfen.');
    if (l.quantity !== null && l.unitNet !== null && l.totalNet !== null) {
      const value = cents(l.quantity * l.unitNet);
      const expected = l.role === 'return' ? -Math.abs(value) : value;
      if (Math.abs(expected - l.totalNet) > 0.02)
        throw new Error('Positionsbetrag stimmt nicht mit Menge und Einzelpreis überein.');
    }
  }
  if (
    v.net !== null &&
    v.lines.length &&
    v.lines.every(l => l.totalNet !== null) &&
    Math.abs(cents(v.lines.reduce((n, l) => n + l.totalNet!, 0) + v.adjustmentNet) - v.net) > 0.02
  )
    throw new Error('Nettosumme der Positionen stimmt nicht.');
  if (v.net !== null && v.tax !== null && v.gross !== null && Math.abs(cents(v.net + v.tax) - v.gross) > 0.02)
    throw new Error('Bruttosumme stimmt nicht mit Netto und Steuer überein.');
  if (
    v.confirmed &&
    (v.gross === null || !v.lines.length || v.lines.some(l => (!l.role || l.role === 'goods') && l.quantity === null))
  )
    throw new Error('Vor Bestätigung Positionen, Warenmengen und Gesamtbetrag prüfen.');
  if (v.confirmed && v.billType === 'credit' && v.gross !== null && v.gross >= 0)
    throw new Error('Bitte den Bruttobetrag der Gutschrift negativ erfassen.');
  if (v.confirmed && v.billType === 'invoice' && v.gross !== null && v.gross < 0)
    throw new Error('Bitte Belegart prüfen. Eine Gutschrift erhält einen negativen Bruttobetrag.');
}
export function offerIdentity(offer: Offer): string {
  return stableId(JSON.stringify([offer.articleId, offer.supplierId, offer.code, offer.packName, offer.packSize]));
}
export function effectiveOffer(offer: Offer, lists: PriceList[], date: string): Offer {
  const source = lists
    .filter(
      p =>
        p.confirmed &&
        p.supplierId === offer.supplierId &&
        p.validFrom <= date &&
        p.lines.some(l => l.offerId === offer.id)
    )
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .at(-1);
  const line = source?.lines.find(l => l.offerId === offer.id);
  if (line && line.offerSignature !== offerIdentity(offer))
    throw new Error(
      'Gebinde oder Lieferartikel wurde seit dem bestätigten Preisstand geändert. Bitte einen neuen passenden Preisstand prüfen.'
    );
  return line
    ? { ...offer, priceNet: line.priceNet, deposit: line.deposit, priceDate: source!.validFrom }
    : offer.priceDate && offer.priceDate > date
      ? { ...offer, priceNet: null, deposit: null, priceDate: null }
      : { ...offer };
}
export function stableId(textValue: string): string {
  let a = 2166136261,
    b = 2246822519;
  for (const x of textValue) {
    a = Math.imul(a ^ x.charCodeAt(0), 16777619);
    b = Math.imul(b ^ x.charCodeAt(0), 3266489917);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function templateOrders(template: Template, slots: Slot[], state: Workspace, prices: PriceList[]): Order[] {
  validateDocument(template);
  return slots.map(slot => {
    validateDocument(slot);
    const season = state.seasons.find(s => s.value.id === slot.scope)?.value;
    if (!season || season.archived) throw new Error('Bitte eine aktive Saison wählen.');
    const supplier = state.suppliers.find(s => s.value.id === template.supplierId && s.value.active)?.value;
    if (!supplier) throw new Error('Lieferant fehlt oder ist inaktiv.');
    const lines = template.lines
      .filter(l => l.quantity !== 0)
      .map((l, i) => {
        const raw = state.offers.find(o => o.value.id === l.offerId && o.value.active)?.value;
        if (!raw || raw.supplierId !== supplier.id)
          throw new Error('Lieferangebot fehlt oder passt nicht zum Lieferanten.');
        const article = state.articles.find(a => a.value.id === raw.articleId && a.value.active)?.value;
        if (!article) throw new Error('Artikel fehlt.');
        const offer = effectiveOffer(raw, prices, slot.date);
        return {
          id: 'line-' + i,
          articleId: article.id,
          offerId: offer.id,
          articleName: article.name,
          code: offer.code,
          unit: article.unit,
          packName: offer.packName,
          packSize: offer.packSize,
          quantity: l.quantity,
          priceNet: offer.priceNet,
          priorPriceNet: null,
          priceYear: null,
          reviewed: false
        };
      });
    if (!lines.length) throw new Error('Bitte mindestens eine positive oder noch offene Menge aufnehmen.');
    return {
      id: 'template-' + stableId(template.id + '|' + slot.id + '|' + template.area),
      seasonId: season.id,
      area: template.area,
      supplierId: supplier.id,
      supplierName: supplier.name,
      status: 'Entwurf',
      occasion: template.name + ' · ' + slot.name,
      deliveryDate: slot.date,
      method: supplier.method,
      note: [slot.time, slot.place, template.note].filter(Boolean).join(' · '),
      sourceId: null,
      sourceYear: null,
      recordedAt: null,
      recordedBy: null,
      lines
    };
  });
}
export interface DemandRow {
  articleId: string;
  name: string;
  unit: string;
  quantity: number;
  costNet: number | null;
}
export function recipeDemand(
  recipe: Recipe,
  portions: number,
  state: Workspace,
  prices: PriceList[] = [],
  date = '9999-12-31'
): {
  rows: DemandRow[];
  issues: string[];
  costNet: number | null;
} {
  validateDocument(recipe);
  amount(portions);
  const issues: string[] = [];
  if (!recipe.confirmed) issues.push('Rezeptur ist noch nicht bestätigt.');
  const rows = recipe.ingredients.flatMap(l => {
    const article = state.articles.find(a => a.value.id === l.articleId && a.value.active)?.value;
    if (!article) {
      issues.push('Zutat fehlt: ' + l.articleId);
      return [];
    }
    if (article.unit !== l.unit) {
      issues.push(article.name + ': Einheit oder Umrechnung fehlt.');
      return [];
    }
    const offers = state.offers
      .filter(o => o.value.articleId === article.id && o.value.active)
      .map(o => effectiveOffer(o.value, prices, date))
      .filter(o => o.priceNet !== null);
    const quantity = round((l.quantity / recipe.yield) * portions);
    const cheapest = offers.sort((a, b) => a.priceNet! / a.packSize - b.priceNet! / b.packSize)[0];
    return [
      {
        articleId: article.id,
        name: article.name,
        unit: article.unit,
        quantity,
        costNet: cheapest ? cents((quantity * cheapest.priceNet!) / cheapest.packSize) : null
      }
    ];
  });
  return {
    rows,
    issues,
    costNet:
      issues.length || !rows.length || rows.some(r => r.costNet === null)
        ? null
        : cents(rows.reduce((n, r) => n + r.costNet!, 0))
  };
}
export function planDemand(plan: Plan, state: Workspace): { rows: Omit<DemandRow, 'costNet'>[]; issues: string[] } {
  validateDocument(plan);
  const recipes = documents(state.ww, 'recipe');
  const prices = documents(state.ww, 'prices');
  const issues: string[] = [];
  const sum = new Map<string, Omit<DemandRow, 'costNet'>>();
  const add = ({ articleId, name, unit, quantity }: Omit<DemandRow, 'costNet'>): void => {
    sum.set(articleId, { articleId, name, unit, quantity: round((sum.get(articleId)?.quantity ?? 0) + quantity) });
  };
  for (const line of plan.lines) {
    const recipe = recipes.find(r => r.id === line.recipeId);
    if (!recipe?.confirmed) {
      issues.push('Bestätigte Rezeptversion fehlt.');
      continue;
    }
    const demand = recipeDemand(recipe, line.portions, state, prices, plan.date);
    issues.push(...demand.issues);
    demand.rows.forEach(add);
  }
  for (const line of plan.materials ?? []) {
    const article = state.articles.find(a => a.value.id === line.articleId)?.value;
    if (!article || !articleAvailable(article, plan.scope)) {
      issues.push('Verbrauchsmaterial ist für diese Saison nicht verfügbar: ' + (article?.name ?? line.articleId));
      continue;
    }
    if (article.unit !== line.unit) {
      issues.push(article.name + ': Einheit des geplanten Materials prüfen.');
      continue;
    }
    add({ ...line, name: article.name });
  }
  return { rows: [...sum.values()], issues };
}

export function activeImports(imports: SystemImport[]): SystemImport[] {
  const confirmed = imports.filter(d => d.confirmed),
    replaced = new Set(confirmed.map(d => d.replacesId).filter(Boolean));
  return confirmed.filter(d => !replaced.has(d.id));
}
export function importEffects(imports: SystemImport[]): {
  sales: Array<{
    productId: string;
    name: string;
    quantity: number;
    amount: number | null;
    basis: string;
    currency: string;
  }>;
  menuDemand: Array<{
    productId: string;
    date: string;
    area: Area;
    quantity: number;
  }>;
  consumption: Array<{
    articleId: string;
    unit: string;
    date: string;
    area: Area;
    quantity: number;
    sourceId: string;
  }>;
} {
  const sales = new Map<
      string,
      {
        productId: string;
        name: string;
        quantity: number;
        amount: number | null;
        basis: string;
        currency: string;
      }
    >(),
    menuDemand: Array<{
      productId: string;
      date: string;
      area: Area;
      quantity: number;
    }> = [],
    consumption: Array<{
      articleId: string;
      unit: string;
      date: string;
      area: Area;
      quantity: number;
      sourceId: string;
    }> = [];
  for (const doc of activeImports(imports)) {
    if (doc.purpose === 'payments') continue;
    for (const [rowIndex, row] of doc.rows.entries()) {
      if (row.status === 'cancelled') continue;
      if (doc.purpose === 'menuOrders') {
        if (row.status === 'active')
          menuDemand.push({ productId: row.productId, date: row.date, area: doc.area, quantity: row.quantity });
        continue;
      }
      const k = row.productId + '|' + doc.basis + '|' + doc.currency;
      const value = sales.get(k) || {
        productId: row.productId,
        name: row.name,
        quantity: 0,
        amount: 0,
        basis: doc.basis,
        currency: doc.currency
      };
      value.quantity = round(value.quantity + (row.status === 'refund' ? -row.quantity : row.quantity));
      value.amount = value.amount === null || row.amount === null ? null : cents(value.amount + row.amount);
      sales.set(k, value);
      if (row.status === 'refund') continue;
      const recipe = doc.recipes.find(r => r.id === row.productId);
      if (recipe?.confirmed)
        for (const l of recipe.ingredients)
          consumption.push({
            articleId: l.articleId,
            unit: l.unit,
            date: row.date,
            area: doc.area,
            quantity: round((l.quantity / recipe.yield) * row.quantity),
            sourceId: doc.id + ':row:' + rowIndex + ':' + l.articleId
          });
    }
  }
  return { sales: [...sales.values()], menuDemand, consumption };
}
export interface StockRow {
  articleId: string;
  name: string;
  unit: string;
  quantity: number | null;
  observed: number | null;
  countedAt: string | null;
  issues: string[];
}
export function berlinDay(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

export function stockProjection(
  state: Workspace,
  docs: WwDocument[],
  seasonId: string,
  selectedArea: Area,
  place: string
): StockRow[] {
  const current = docs.filter(d => d.scope === seasonId && d.confirmed),
    effects = importEffects(current.filter((d): d is SystemImport => d.kind === 'system'));
  return state.articles
    .filter(a => a.value.active)
    .map(({ value: a }) => {
      const issues: string[] = [],
        events: Array<{
          at: string;
          kind: 'count' | 'delta';
          quantity: number;
          id: string;
        }> = [];
      if (!place) {
        for (const c of latestCounts(state, seasonId, selectedArea).filter(c => c.articleId === a.id))
          events.push({ at: c.countedAt, kind: 'count', quantity: c.quantity, id: c.id });
        for (const { value: o } of state.orders.filter(
          o => o.value.seasonId === seasonId && o.value.area === selectedArea
        )) {
          for (const r of o.receipts || [])
            for (const l of r.lines) {
              const original = o.lines.find(x => x.id === l.lineId);
              if (original?.articleId === a.id) {
                if (original.unit !== a.unit) {
                  issues.push('Einheit einer Lieferung passt nicht.');
                  continue;
                }
                events.push({
                  at: r.receivedAt,
                  kind: 'delta',
                  quantity: round(l.quantity * original.packSize),
                  id: 'receipt:' + r.id + ':' + l.lineId
                });
              }
            }
        }
      }
      for (const doc of current.filter((d): d is Movement => d.kind === 'movement' && d.articleId === a.id)) {
        if (doc.unit !== a.unit) {
          issues.push('Einheit einer Bewegung passt nicht.');
          continue;
        }
        if (doc.area === selectedArea && doc.place === place)
          events.push({
            at: doc.at,
            kind: ['count', 'opening'].includes(doc.type) ? 'count' : 'delta',
            quantity: ['incoming', 'count', 'opening'].includes(doc.type) ? doc.quantity : -doc.quantity,
            id: doc.id
          });
        if (doc.type === 'transfer' && doc.toArea === selectedArea && doc.toPlace === place)
          events.push({ at: doc.at, kind: 'delta', quantity: doc.quantity, id: doc.id + ':to' });
      }
      const ordered = events.sort(
        (x, y) =>
          Date.parse(x.at) - Date.parse(y.at) ||
          (x.kind === y.kind ? x.id.localeCompare(y.id) : x.kind === 'count' ? 1 : -1)
      );
      let quantity: number | null = null,
        observed: number | null = null,
        countedAt: string | null = null;
      const seen = new Set<string>();
      for (const e of ordered) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (e.kind === 'count') {
          quantity = e.quantity;
          observed = e.quantity;
          countedAt = e.at;
        } else if (quantity !== null) quantity = round(quantity + e.quantity);
      }
      // A daily total has no intra-day timestamp. Compare it with the actual count's Berlin date.
      const countDay = countedAt ? berlinDay(new Date(countedAt)) : '';
      if (!place) {
        for (const sale of effects.consumption.filter(c => c.articleId === a.id && c.area === selectedArea)) {
          if (sale.unit !== a.unit) {
            issues.push('Rezeptureinheit passt nicht.');
            continue;
          }
          if (quantity === null || sale.date < countDay || seen.has(sale.sourceId) || !sale.quantity) continue;
          seen.add(sale.sourceId);
          if (sale.date === countDay) {
            issues.push('Tagesexport und Zählung am selben Tag: zeitliche Zuordnung prüfen.');
            quantity = null;
          } else quantity = round(quantity - sale.quantity);
        }
      }
      if (quantity !== null && quantity < 0) issues.push('Rechnerisch negativer Bestand: Erfassungen prüfen.');
      return { articleId: a.id, name: a.name, unit: a.unit, quantity, observed, countedAt, issues };
    });
}
