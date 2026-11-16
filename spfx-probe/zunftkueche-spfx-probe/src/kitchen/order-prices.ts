import type { Order, Workspace } from './model';
import { button, dateDe, h, money } from './markup.ts';
import { unitName } from './units.ts';
import { dayLabel } from './ww/common.ts';
import { priceSuggestion } from './order-guidance.ts';
export function priceReview(order: Order, state: Workspace): string {
  if (!order.lines.length) return '';
  const year = state.seasons.find(s => s.value.id === order.seasonId)?.value.year;
  const lines = order.lines
    .map(l => {
      const offer = state.offers.find(x => x.value.id === l.offerId)?.value,
        proposal = priceSuggestion(order, l, state);
      return (
        '<li><strong>' +
        h(l.articleName) +
        '</strong><span>Preis in diesem Entwurf: ' +
        money(l.priceNet) +
        ' / ' +
        h(unitName(l.packName, 1)) +
        (offer ? ' · Preis am Artikel: ' + money(offer.priceNet) + ' netto / ' + h(unitName(offer.packName, 1)) : '') +
        '</span><small>' +
        (offer?.priceDate
          ? 'Stand ' +
            h(dateDe(offer.priceDate)) +
            (year && Number(offer.priceDate.slice(0, 4)) < year ? ' · älterer Preis, bitte bestätigen' : '') +
            ' · '
          : '') +
        (offer?.note ? h(offer.note) + ' · ' : '') +
        h(proposal.note) +
        '</small>' +
        (proposal.quotes.length
          ? ' <span>' +
            proposal.quotes
              .map(
                q =>
                  h(dayLabel(q.date)) +
                  ': ' +
                  money(q.price) +
                  ' netto / ' +
                  h(unitName(l.packName, 1)) +
                  ' · ' +
                  h(q.source) +
                  (q.validFrom ? ' ab ' + h(q.validFrom) : ' · Preis offen')
              )
              .join(' | ') +
            '</span>'
          : '') +
        (proposal.price !== null && proposal.price !== l.priceNet
          ? button('price-adopt', 'Preisvorschlag übernehmen', l.id)
          : '') +
        '</li>'
      );
    })
    .join('');
  return (
    '<details open class="price-review"><summary>Preise und Hinweise prüfen</summary><p>Preise vor der Bestellung anhand des aktuellen Angebots prüfen. Die Übernahme ändert nur diesen Entwurf.</p><ul>' +
    lines +
    '</ul></details>'
  );
}
