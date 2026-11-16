/* eslint-disable @rushstack/no-new-null -- Null explicitly represents unknown quantities, prices and dates in the persisted domain and DOM APIs. */
import type { Workspace, Offer } from '../model';
import type { Bill } from './model';
import { documents } from './model.ts';
import { effectiveOffer } from './domain.ts';
import { unitName } from '../units.ts';
export interface InvoicePriceProposal {
  offer: Offer;
  name: string;
  oldPrice: number | null;
  newPrice: number;
  date: string;
}
export function invoicePriceProposals(b: Bill, s: Workspace): InvoicePriceProposal[] {
  if (
    !b.confirmed ||
    b.costAssignment ||
    b.billType === 'credit' ||
    (b.gross ?? 0) < 0 ||
    b.adjustmentNet !== 0 ||
    b.lines.some(l => l.role === 'discount')
  )
    return [];
  const groups = new Map<string, InvoicePriceProposal[]>();
  for (const line of b.lines) {
    if (
      (line.role && line.role !== 'goods') ||
      !line.articleId ||
      /pfand|rabatt|fracht|lieferkosten|gutschrift|bonus|skonto/i.test(line.name) ||
      line.unitNet === null ||
      line.unitNet <= 0 ||
      !line.quantity ||
      line.quantity <= 0 ||
      line.totalNet === null ||
      Math.abs(line.quantity * line.unitNet - line.totalNet) > 0.02
    )
      continue;
    // Die Rechnungseinheit muss dem Gebinde entsprechen: gleicher Name („Fl.“ gilt als „Flasche“) oder, bei
    // Gebinden mit genau einer Einheit, die Einheit des Artikels. Sonst wäre es ein Preis je Flasche statt je Kiste.
    const same = (a: string, b: string): boolean =>
      unitName(a, 1).trim().toLowerCase() === unitName(b, 1).trim().toLowerCase();
    const articleUnit = s.articles.find(a => a.value.id === line.articleId)?.value.unit || '';
    const candidates = s.offers.filter(
      o =>
        o.value.active &&
        o.value.supplierId === b.supplierId &&
        o.value.articleId === line.articleId &&
        (same(o.value.packName, line.unit) ||
          (o.value.packSize === 1 && (!line.unit.trim() || same(articleUnit, line.unit))))
    );
    if (candidates.length !== 1) continue;
    const offer = candidates[0].value;
    const linked = s.orders
      .filter(o => (b.orderIds || []).includes(o.value.id) && o.value.supplierId === b.supplierId)
      .flatMap(o => o.value.lines)
      .filter(l => l.offerId === offer.id);
    if (
      linked.some(
        l =>
          l.packSize !== offer.packSize ||
          l.packName !== offer.packName ||
          l.code !== offer.code ||
          l.unit !== s.articles.find(a => a.value.id === offer.articleId)?.value.unit
      )
    )
      continue;
    const price = effectiveOffer(offer, documents(s.ww, 'prices'), b.date).priceNet;
    const list = groups.get(offer.id) || [];
    list.push({ offer, name: line.name, oldPrice: price, newPrice: line.unitNet, date: b.date });
    groups.set(offer.id, list);
  }
  return [...groups.values()]
    .filter(lines => lines.every(l => l.newPrice === lines[0].newPrice))
    .map(lines => lines[0])
    .filter(l => l.oldPrice !== l.newPrice);
}
