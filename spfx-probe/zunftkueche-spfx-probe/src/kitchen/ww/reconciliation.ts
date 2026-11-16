/* eslint-disable @rushstack/no-new-null -- Incomparable invoice units remain unknown. */
import type { Workspace } from '../model';
import type { Bill } from './model';
import { cents, round } from './domain.ts';
import { receivedQuantity } from '../operations.ts';
export interface ReconciliationRow {
  name: string;
  unit: string;
  ordered: number | null;
  received: number | null;
  invoiced: number | null;
  quantityDifference: number | null;
  priceDifference: number | null;
  issue: string;
}
export function reconcileBill(b: Bill, s: Workspace): ReconciliationRow[] {
  const orders = s.orders
    .filter(
      r =>
        b.orderIds.includes(r.value.id) &&
        r.value.supplierId === b.supplierId &&
        r.value.area === b.area &&
        r.value.seasonId === b.scope
    )
    .map(r => r.value);
  return b.lines
    .filter(l => b.billType !== 'credit' && (!l.role || l.role === 'goods'))
    .map(l => {
      const article = s.articles.find(a => a.value.id === l.articleId)?.value,
        lines = orders.flatMap(o => o.lines.filter(x => x.articleId === l.articleId).map(line => ({ order: o, line })));
      const empty: ReconciliationRow = {
        name: l.name,
        unit: article?.unit || l.unit,
        ordered: null,
        received: null,
        invoiced: null,
        quantityDifference: null,
        priceDifference: null,
        issue: ''
      };
      if (!article || !lines.length) return { ...empty, issue: 'Artikel oder passende Bestellposition zuordnen.' };
      const packs = lines.filter(x => x.line.packName === l.unit),
        sizes = [...new Set(packs.map(x => x.line.packSize))];
      const factor = l.unit === article.unit ? 1 : sizes.length === 1 ? sizes[0] : null;
      if (factor === null)
        return {
          ...empty,
          issue:
            'Rechnungseinheit stimmt nicht eindeutig mit einem Liefergebinde überein. Umrechnung am Original prüfen.'
        };
      const invoiced = l.quantity === null ? null : round(l.quantity * factor),
        ordered = lines.some(x => x.line.quantity === null)
          ? null
          : round(lines.reduce((sum, x) => sum + x.line.quantity! * x.line.packSize, 0)),
        hasReceipt = orders.some(o => o.receipts?.length),
        received = hasReceipt
          ? round(lines.reduce((sum, x) => sum + receivedQuantity(x.order, x.line.id) * x.line.packSize, 0))
          : null;
      const unitPrices = [
          ...new Set(lines.map(x => (x.line.priceNet === null ? null : round(x.line.priceNet / x.line.packSize))))
        ],
        expected =
          unitPrices.length === 1 && unitPrices[0] !== null && invoiced !== null
            ? cents(unitPrices[0] * invoiced)
            : null;
      return {
        ...empty,
        ordered,
        received,
        invoiced,
        quantityDifference: received === null || invoiced === null ? null : round(invoiced - received),
        priceDifference: expected === null || l.totalNet === null ? null : cents(l.totalNet - expected),
        issue:
          received === null
            ? 'Noch kein Wareneingang dokumentiert.'
            : invoiced !== received
              ? 'Abweichung zwischen Rechnung und angenommener Menge prüfen.'
              : ''
      };
    });
}
