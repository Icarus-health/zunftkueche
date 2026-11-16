/* eslint-disable @rushstack/no-new-null -- Null explicitly represents unknown quantities, prices and dates in the persisted domain and DOM APIs. */
import type { Order, OrderLine, Workspace } from './model';
import { documents } from './ww/model.ts';
import { effectiveOffer } from './ww/domain.ts';
export interface DeliveryQuote {
  date: string;
  price: number | null;
  source: string;
  validFrom: string | null;
}
export function priceSuggestion(
  order: Order,
  line: OrderLine,
  state: Workspace
): { price: number | null; note: string; quotes: DeliveryQuote[] } {
  const none = (
    note: string,
    quotes: DeliveryQuote[] = []
  ): { price: null; note: string; quotes: DeliveryQuote[] } => ({ price: null, note, quotes });
  const offer = state.offers.find(row => row.value.id === line.offerId)?.value;
  if (!offer || !offer.active) return none('Der Artikel ist bei diesem Lieferanten nicht mehr hinterlegt.');
  const relevant = (order.deliveries || []).filter(d => line.schedule?.[d.id] !== 0);
  if (!relevant.length || relevant.some(d => !d.date))
    return none('Für einen Preisvorschlag zuerst alle benötigten Lieferdaten und Mengen eintragen.');
  try {
    const lists = documents(state.ww, 'prices');
    const quotes = relevant.map(d => {
      const date = d.date!,
        quoted = effectiveOffer(offer, lists, date);
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
      return { date, price: quoted.priceNet, source: source?.name || 'Preis am Artikel', validFrom: quoted.priceDate };
    });
    if (quotes.some(q => q.price === null || !q.validFrom))
      return none('Für mindestens einen Liefertag fehlt ein gültiger Preis.', quotes);
    if (quotes.some(q => q.price !== quotes[0].price))
      return none(
        'Für die Liefertage gelten unterschiedliche Preise. Bitte vor der Bestellung einzeln prüfen.',
        quotes
      );
    return {
      price: quotes[0].price,
      note: 'Preisvorschlag anhand der Liefertermine; Gültigkeit und Angebot prüfen.',
      quotes
    };
  } catch {
    return none('Gebinde und Preis passen nicht zusammen. Bitte den Artikel beim Lieferanten prüfen.');
  }
}
