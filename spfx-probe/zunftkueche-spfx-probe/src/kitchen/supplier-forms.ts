import { orderSheet, deliveryShortLabels, dayChoice } from './order-sheet.ts';
import type { Order, Workspace, Season } from './model';
import { articleAvailable } from './model.ts';
import { button, check, field, h, money, n } from './markup.ts';
import { unitName } from './units.ts';
import { withSchedule } from './supplier-orders.ts';
import { dayLabel } from './ww/common.ts';
import { documents } from './ww/model.ts';

export function deliverySummary(source: Order): string {
  const order = withSchedule(source),
    dates = order.deliveries!,
    missing = dates.filter(d => !d.date).length,
    prices = order.lines.filter(l => l.priceNet === null).length;
  const parts = [
    order.lines.length + ' ' + (order.lines.length === 1 ? 'Artikel' : 'Artikel'),
    dates.length + ' ' + (dates.length === 1 ? 'Liefertag' : 'Liefertage'),
    ...(missing ? [missing + ' ' + (missing === 1 ? 'Datum fehlt' : 'Daten fehlen')] : []),
    ...(prices ? [prices + ' ' + (prices === 1 ? 'Preis offen' : 'Preise offen')] : [])
  ];
  return `<p class="workspace-note">${parts.join(' · ')}${order.status === 'Entwurf' && (missing || prices) ? '. Vor dem Bestellen ergänzen.' : ''}</p>`;
}
export function deliveryMatrix(source: Order, editable: boolean): string {
  const order = withSchedule(source),
    dates = order.deliveries!,
    short = deliveryShortLabels(dates);
  const focus = dates.length > 1 ? dayChoice(dates) : '';
  return (
    focus +
    `<div class="supplier-matrix-scroll" tabindex="0" role="region" aria-label="Bestellmengen je Liefertag, horizontal scrollbar"><table class="supplier-matrix${editable ? '' : ' delivery-plan'}"><thead><tr><th>Artikel / Bestellgebinde</th>${dates.map((d, i) => `<th data-delivery-column="${h(d.id)}">${editable ? field('date_' + d.id, 'Lieferdatum', d.date || '', false, 'date') + '<details><summary>Ort & Zeit</summary>' + field('time_' + d.id, 'Zeitfenster', d.time) + field('place_' + d.id, 'Lieferort', d.place) + button('delivery-remove', 'Tag entfernen', d.id) + '</details>' : '<span class="delivery-day"><span>' + h(short[i]) + '</span><small>' + h([d.date ? '' : 'Datum offen', d.time, d.place].filter(Boolean).join(' · ')) + '</small></span>'}</th>`).join('')}<th>Gesamt</th><th>Netto / Gebinde</th>${editable ? '<th>Prüfung</th>' : ''}</tr></thead><tbody>${order.lines.map(l => `<tr><th scope="row"><strong>${h(l.articleName)}</strong><small>${l.code ? h(l.code) + ' · ' : ''}${h(unitName(l.packName, 1))} à ${n(l.packSize)} ${h(unitName(l.unit, l.packSize))}</small>${l.sources?.length ? '<small class="source-hint">Enthält Rezeptbedarf: ' + [...new Set(l.sources.map(x => x.planId))].length + ' Plan/Pläne</small>' : ''}${editable ? button('line-remove', 'Artikel entfernen', l.id) : ''}</th>${dates.map(d => `<td data-delivery-column="${h(d.id)}">${editable ? field('schedule_' + l.id + '_' + d.id, l.articleName + ' · ' + (d.date ? dayLabel(d.date) : 'neuer Liefertag') + ' · ' + l.packName, n(l.schedule![d.id] ?? null), false, 'text', 'inputmode="decimal"') : n(l.schedule![d.id] ?? null)}</td>`).join('')}<td><strong data-line-total="${h(l.id)}">${n(l.quantity)} ${h(unitName(l.packName, l.quantity))}</strong>${l.priceYear ? '<small>Vorjahr: ' + money(l.priorPriceNet) + ' / ' + h(unitName(l.packName, 1)) + '</small>' : ''}</td><td>${editable ? field('price_' + l.id, 'Nettopreis je ' + l.packName + ' · ' + l.articleName, n(l.priceNet), false, 'text', 'inputmode="decimal"') : money(l.priceNet)}</td>${editable ? '<td>' + check('review_' + l.id, 'Menge und Gebinde geprüft · ' + l.articleName, l.reviewed) + '</td>' : ''}</tr>`).join('') || '<tr><td colspan="' + (dates.length + 4) + '">Artikel unten auswählen und hinzufügen.</td></tr>'}</tbody></table></div>`
  );
}
export function orderGuidance(order: Order): string {
  const dates = order.deliveries || [],
    incomplete = order.lines.filter(l => l.quantity === null || !l.reviewed).length,
    missing = order.lines.filter(l => l.priceNet === null).length;
  const articleStatus = !order.supplierId
    ? 'Lieferant wählen'
    : !order.lines.length
      ? 'Artikel ergänzen'
      : incomplete
        ? incomplete + (incomplete === 1 ? ' Position prüfen' : ' Positionen prüfen')
        : 'Mengen geprüft';
  const dateStatus = dates.length && dates.every(d => !!d.date) ? 'Lieferdaten eingetragen' : 'Lieferdaten ergänzen';
  const items = [
    ['Artikel und Mengen', articleStatus + ' · ' + dateStatus],
    [
      'Preise prüfen',
      !order.lines.length
        ? 'Artikel ergänzen'
        : missing
          ? missing + (missing === 1 ? ' Preis offen' : ' Preise offen')
          : 'Preise prüfen'
    ],
    ['PDF und Abschluss', 'PDF prüfen und selbst bestellen']
  ];
  return (
    '<ol class="order-steps" aria-label="Schritte zur Bestellung">' +
    items
      .map(
        ([name, status], i) =>
          '<li><span>' +
          (i + 1) +
          '</span><div><strong>' +
          h(name) +
          '</strong><small>' +
          h(status) +
          '</small></div></li>'
      )
      .join('') +
    '</ol>'
  );
}
export { priceReview } from './order-prices.ts';
export function supplierOrderForm(order: Order, state: Workspace): string {
  return orderSheet(order, state);
}
export function supplierCopyForm(source: Order, state: Workspace, target?: Season): string {
  const old = withSchedule(source),
    year = state.seasons.find(s => s.value.id === source.seasonId)?.value.year;
  return `<form data-form="copy" class="panel"><div class="page-heading"><div><h1>Aus ${year || 'Vorjahr'} übernehmen</h1><p>${h(source.supplierName)} · Lieferaufteilung</p></div>${button('cancel', 'Zurück')}</div><p>Wählt die benötigten Artikel aus. Neue Lieferdaten können vorerst offen bleiben und müssen vor der Bestellung ergänzt werden. Die Mengen sind ein Vorschlag; Lieferungen und Bestellstatus werden nicht übernommen.</p><p>Bereits zugeordnete Vorjahrestermine dieser Saison werden für weitere Lieferanten vorgeschlagen. Bitte bestätigen.</p><div class="copy-dates">${old.deliveries!.map(d => `<div><strong>Vorjahr: ${h(d.date ? dayLabel(d.date) : 'ohne Datum')} · ${h(d.time || 'Zeit offen')}</strong>${field('copydate_' + d.id, 'Neues Lieferdatum (optional)', d.date ? target?.copyDates?.[d.date] || '' : '', false, 'date')}${h(d.place)}</div>`).join('')}</div><h2>Artikel auswählen</h2>${old.lines
    .map(l => {
      const a = state.articles.find(x => x.value.id === l.articleId)?.value;
      const o = state.offers.find(x => x.value.id === l.offerId)?.value;
      const unavailable = !!a && !!target && !articleAvailable(a, target.id);
      const flagged = !!o?.note && /gestrichen|inaktiv|nicht vorgesehen/i.test(o.note);
      return (
        '<div>' +
        check('copyline_' + l.id, l.articleName, !!a?.active && !!o?.active && !flagged && !unavailable) +
        (o?.note ? '<small>' + h(o.note) + '</small>' : '') +
        (unavailable
          ? '<small>In dieser Saison nicht vorgesehen. Im Artikelprofil ändern, falls benötigt.</small>'
          : '') +
        (flagged ? '<small>Hinweis prüfen – zunächst nicht ausgewählt.</small>' : '') +
        (!a?.active || !o?.active ? '<small>Artikel nicht mehr aktiv. Vor der Übernahme prüfen.</small>' : '') +
        '</div>'
      );
    })
    .join(
      ''
    )}${deliveryMatrix(old, false)}<p>Die hinterlegten Preise werden vorgeschlagen und können veraltet sein. Vorjahrespreise, Mengen und Gebinde vor der Bestellung prüfen.</p><div class="actions"><button type="submit" class="primary">Auswahl als Entwurf übernehmen</button>${button('cancel', 'Abbrechen')}</div></form>`;
}
export function supplierTools(state: Workspace): string {
  return `<details class="context-tools"><summary>Lieferanten, Artikel und Vorlagen</summary><div class="actions">${button('nav', 'Lieferanten & Absprachen', 'suppliers')}${button('nav', 'Artikel', 'articles')}${button('ww-open', 'Vorlage laden', 'templates')}${button('ww-open', 'Liefertermine', 'slots')}${button('ww-open', 'Preise aktualisieren', 'prices')}</div><p>${documents(state.ww, 'template').length} Vorlagen verfügbar. Die Mengen vor der Übernahme prüfen.</p></details>`;
}
