/* eslint-disable @rushstack/no-new-null -- Empty imported business values remain explicitly unknown. */
import type { Area, Workspace } from '../model';
import type { PriceList, Rule, Slot, Template, WwDocument } from './model';
import { button, field, h, n, money, note, select, empty, amount2, backLink } from '../markup.ts';
import { businessTabs, confirmationActions, dayLabel, heading, rowActions } from './common.ts';
import { isDaySlot } from './delivery-days.ts';
import type { Screen } from './common';
import { documents } from './model.ts';
import { effectiveOffer } from './domain.ts';
import { unitName } from '../units.ts';
const suppliers = (s: Workspace): Array<[string, string]> =>
  s.suppliers.filter(r => r.value.active).map(r => [r.value.id, r.value.name]);
export function procurementOverview(page: Screen, docs: WwDocument[], s: Workspace, area: Area): string {
  const meta = {
    slots: ['Liefertermine', 'Mittwoch bis Sonntag – oder jeder andere Tag.', 'slot', 'Termin hinzufügen'],
    rules: [
      'Lieferregeln',
      'Übliche Liefertage, Bestellschluss und Vorlauf je Lieferant.',
      'rule',
      'Lieferregel anlegen'
    ],
    templates: [
      'Bestellvorlagen',
      'Bewährte Artikellisten für neue Bestellungen verwenden.',
      'template',
      'Vorlage anlegen'
    ],
    prices: ['Frühere Preise', 'Jede Preisänderung mit Datum. Alte Bestellungen behalten ihre Preise.', 'prices', '']
  } as const;
  const key = page as keyof typeof meta;
  const m = meta[key];
  if (!m) return '';
  const records = docs.filter(d => d.kind === m[2] && (!('area' in d) || d.area === area));
  return (
    (page === 'prices' ? '' : businessTabs(page)) +
    (page === 'prices' ? backLink('nav', 'Lieferanten', 'suppliers') : '') +
    heading(m[0], m[1], m[3] ? button('ww-new', m[3], m[2], true) : '') +
    (page === 'prices'
      ? '<p class="workspace-note">Einkaufspreise netto je Gebinde. Preise ändert ihr im Profil des Lieferanten unter „Preise ändern“.</p>'
      : '') +
    `<section class="panel ww-records">${
      records.length
        ? records
            .sort((a, b) => b.at.localeCompare(a.at))
            .map(d => {
              let title = '',
                sub = '',
                actions = '';
              if (d.kind === 'slot') {
                title = d.name;
                sub = dayLabel(d.date) + ' · ' + [d.time, d.place].filter(Boolean).join(' · ');
              }
              if (d.kind === 'rule') {
                title = s.suppliers.find(r => r.value.id === d.supplierId)?.value.name || 'Lieferant';
                sub =
                  d.weekdays.map(n => ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][n]).join(', ') +
                  ' · ' +
                  d.leadDays +
                  ' Tage Vorlauf · ' +
                  (d.cutoffTime
                    ? 'Bestellschluss ' + d.cutoffTime + ' Uhr' + (d.cutoff ? ' · Absprache: ' + d.cutoff : '')
                    : d.cutoff || 'Bestellschluss offen');
              }
              if (d.kind === 'template') {
                title = d.name;
                sub =
                  (s.suppliers.find(r => r.value.id === d.supplierId)?.value.name || 'Lieferant') +
                  ' · ' +
                  d.lines.length +
                  ' Artikel';
                actions = button('ww-use', 'Bestellung vorbereiten', d.id, true);
              }
              if (d.kind === 'prices') {
                title = d.name;
                sub =
                  (s.suppliers.find(r => r.value.id === d.supplierId)?.value.name || 'Lieferant') +
                  ' · gültig ab ' +
                  dayLabel(d.validFrom) +
                  ' · ' +
                  d.lines.length +
                  ' Preise · ' +
                  (d.confirmed ? 'Bestätigt' : 'Entwurf');
              }
              return `<div class="listrow"><div><strong>${h(title)}</strong><p>${h(sub)}</p></div><div class="actions">${actions}${rowActions(d.id, d.confirmed && d.kind === 'prices' ? 'Ansehen und ändern' : 'Bearbeiten')}</div></div>`;
            })
            .join('')
        : empty('Hier ist noch nichts hinterlegt. Ihr könnt direkt mit dem Anlegen beginnen.')
    }</section>`
  );
}
export function procurementLine(
  kind: 'template' | 'prices',
  s: Workspace,
  supplierId: string,
  line?: {
    offerId: string;
    quantity?: number | null;
    priceNet?: number | null;
    deposit?: number | null;
  }
): string {
  const offers = s.offers
    .filter(r => r.value.active && r.value.supplierId === supplierId)
    .map(
      r =>
        [
          r.value.id,
          (s.articles.find(a => a.value.id === r.value.articleId)?.value.name || 'Artikel') +
            ' · ' +
            r.value.packName +
            ' à ' +
            n(r.value.packSize)
        ] as [string, string]
    );
  return `<div class="ww-line" data-line>${select('offerId', 'Lieferartikel', [['', 'Bitte wählen'], ...offers], line?.offerId || offers[0]?.[0] || '')}${kind === 'template' ? field('quantity', 'Gebinde je Termin', line?.quantity === null ? '' : n(line?.quantity ?? null), false, 'text', 'inputmode="decimal"') : field('priceNet', 'Nettopreis je Gebinde', line?.priceNet === null ? '' : n(line?.priceNet ?? null), false, 'text', 'inputmode="decimal"') + field('deposit', 'Pfand je Gebinde', line?.deposit === null ? '' : n(line?.deposit ?? null), false, 'text', 'inputmode="decimal"')}${button('ww-remove', 'Entfernen')}</div>`;
}
/** Preisliste eines Lieferanten als Tabelle: jede Zeile ein Artikel mit Gebinde, ein Preis je Zeile. */
export function priceRows(doc: PriceList, s: Workspace): PriceList['lines'] {
  const lists = documents(s.ww, 'prices');
  const rest = s.offers
    .filter(
      r => r.value.active && r.value.supplierId === doc.supplierId && !doc.lines.some(l => l.offerId === r.value.id)
    )
    .map(r => {
      let current = r.value;
      try {
        current = effectiveOffer(r.value, lists, doc.validFrom);
      } catch {
        /* Gebinde seit der letzten Preisliste geändert: Preis aus dem Artikel zeigen */
      }
      return { offerId: r.value.id, priceNet: current.priceNet, deposit: current.deposit };
    });
  const name = (offerId: string): string => {
    const offer = s.offers.find(o => o.value.id === offerId)?.value;
    return s.articles.find(a => a.value.id === offer?.articleId)?.value.name || '';
  };
  return [...doc.lines, ...rest].sort((a, b) => name(a.offerId).localeCompare(name(b.offerId), 'de'));
}
function priceTable(doc: PriceList, s: Workspace): string {
  const supplier = s.suppliers.find(r => r.value.id === doc.supplierId)?.value;
  const rows = priceRows(doc, s)
    .map(line => {
      const offer = s.offers.find(o => o.value.id === line.offerId)?.value;
      const article = s.articles.find(a => a.value.id === offer?.articleId)?.value;
      if (!offer || !article) return '';
      const label = article.name + ', ' + offer.packName;
      return `<tr data-line><th scope="row">${h(article.name)}<input type="hidden" name="offerId" value="${h(offer.id)}"></th><td>${h(offer.packName)} à ${n(offer.packSize)} ${h(unitName(article.unit, offer.packSize))}</td><td><input name="priceNet" inputmode="decimal" value="${h(amount2(line.priceNet))}" aria-label="Preis netto für ${h(label)}"></td><td><input name="deposit" inputmode="decimal" value="${h(amount2(line.deposit))}" aria-label="Pfand für ${h(label)}"></td></tr>`;
    })
    .join('');
  return (
    `<form data-form="ww-prices" class="panel ww-editor">` +
    heading('Preise · ' + (supplier?.name || 'Lieferant'), 'Ein Preis je Artikel. Nur geänderte Zeilen werden gespeichert, die bisherigen Preise bleiben für alte Bestellungen erhalten.') +
    `<input type="hidden" name="name" value="${h(doc.name)}"><input type="hidden" name="supplierId" value="${h(doc.supplierId)}">` +
    `<div class="formgrid">${field('validFrom', 'Gültig ab', doc.validFrom, true, 'date')}</div>` +
    (rows
      ? `<div class="table-scroll"><table class="price-table"><thead><tr><th scope="col">Artikel</th><th scope="col">Gebinde</th><th scope="col">Preis netto je Gebinde</th><th scope="col">Pfand je Gebinde</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : empty('Für diesen Lieferanten sind noch keine Artikel hinterlegt.')) +
    confirmationActions('Preise speichern') +
    '</form>'
  );
}
export function procurementForm(doc: Slot | Rule | Template | PriceList, s: Workspace): string {
  if (doc.kind === 'prices') return priceTable(doc, s);
  let body = '';
  if (doc.kind === 'slot')
    body =
      field('name', 'Bezeichnung', doc.name, true) +
      field('date', 'Lieferdatum', doc.date, true, 'date') +
      field('time', 'Zeitfenster', doc.time) +
      field('place', 'Liefer- oder Abholort', doc.place, false, 'text', 'list="delivery-places"') +
      '<datalist id="delivery-places">' +
      (s.seasons.find(x => x.value.id === doc.scope)?.value.deliveryPlaces || [])
        .map(x => '<option value="' + h(x) + '"></option>')
        .join('') +
      '</datalist>';
  if (doc.kind === 'rule')
    body =
      select('supplierId', 'Lieferant', suppliers(s), doc.supplierId) +
      `<fieldset><legend>Übliche Liefertage</legend><div class="actions">${[1, 2, 3, 4, 5, 6, 0].map(i => `<label class="check"><input type="checkbox" name="weekdays" value="${i}" ${doc.weekdays.includes(i) ? 'checked' : ''}>${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][i]}</label>`).join('')}</div></fieldset>` +
      field('leadDays', 'Vorlauf in Tagen', String(doc.leadDays), true, 'number', 'min="0" max="365"') +
      field('cutoffTime', 'Bestellschluss (Uhrzeit)', doc.cutoffTime || '', false, 'time') +
      field('cutoff', 'Bestellschluss / Absprache', doc.cutoff) +
      note(
        'deadlineOverrides',
        'Ausnahmen (je Zeile Lieferdatum=Bestellschluss, z. B. 2027-02-05=2027-02-03T10:00)',
        Object.entries(doc.deadlineOverrides || {})
          .map(([d, t]) => d + '=' + t)
          .join('\n')
      ) +
      '<p>Vorlauf in Kalendertagen. Feiertage und Sonderabsprachen ausdrücklich als Ausnahme eintragen.</p>' +
      field('minNet', 'Mindestbestellwert netto', n(doc.minNet), false, 'text', 'inputmode="decimal"') +
      field('feeNet', 'Lieferkosten netto', n(doc.feeNet), false, 'text', 'inputmode="decimal"') +
      note('note', 'Hinweise', doc.note);
  if (doc.kind === 'template')
    body =
      field('name', 'Name der Vorlage', doc.name, true) +
      select('supplierId', 'Lieferant', suppliers(s), doc.supplierId) +
      `<div class="ww-lines">${doc.lines.map(l => procurementLine(doc.kind, s, doc.supplierId, l)).join('')}</div>` +
      button('ww-add', 'Artikel hinzufügen', doc.kind) +
      note('note', 'Verwendung / Hinweise', doc.note);
  return `<form data-form="ww-${doc.kind}" class="panel ww-editor">${heading(doc.kind === 'slot' ? 'Liefertermin' : doc.kind === 'rule' ? 'Bestellschluss und Liefertage' : 'Bestellvorlage', 'Angaben prüfen und speichern.')}<div class="formgrid">${body}</div>${confirmationActions('Speichern')}</form>`;
}
export function templateUse(template: Template, slots: Slot[], s: Workspace): string {
  return `<form data-form="ww-use" class="panel">${heading('Bestellung vorbereiten', template.name + ' · Liefertage ankreuzen und Mengen je Tag prüfen.')}<p>Die Lieferaufteilung bleibt in einer gemeinsamen Bestellung. Vor dem Abgeben die Gesamtsummen prüfen.</p>${
    slots.length
      ? `<div class="ww-matrix-scroll"><table class="ww-matrix"><thead><tr><th>Artikel / Gebinde</th>${slots.map(slot => `<th><label class="check"><input type="checkbox" name="slot" value="${h(slot.id)}">${h(dayLabel(slot.date))}${isDaySlot(slot) ? '' : '<small>' + h(slot.name) + '</small>'}</label></th>`).join('')}</tr></thead><tbody>${template.lines
          .map((l, i) => {
            const offer = s.offers.find(o => o.value.id === l.offerId)?.value;
            return `<tr><th>${h(s.articles.find(a => a.value.id === offer?.articleId)?.value.name || 'Artikel')}<small>${h(offer?.packName || '')}</small></th>${slots.map(slot => `<td>${field('qty_' + slot.id + '_' + i, 'Menge ' + dayLabel(slot.date), n(l.quantity), false, 'text', 'inputmode="decimal"')}</td>`).join('')}</tr>`;
          })
          .join('')}</tbody></table></div>`
      : empty('Für diese Saison sind noch keine Einsatztage hinterlegt. Bitte unter Einstellungen bei „Saison bearbeiten“ eintragen.')
  }${confirmationActions('Gemeinsame Lieferantenbestellung anlegen')}</form>`;
}
export function supplierRuleHint(rules: Rule[], supplierId: string, date: string): string {
  const rule = rules
    .filter(r => r.supplierId === supplierId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .at(-1);
  if (!rule) return '';
  const weekday = date ? new Date(date + 'T12:00Z').getUTCDay() : -1;
  return `<p class="workspace-note">${rule.weekdays.length && weekday >= 0 && !rule.weekdays.includes(weekday) ? '<strong>Abweichender Liefertag: bitte mit dem Lieferanten absprechen.</strong> ' : ''}${h(rule.leadDays)} Tage Vorlauf · ${h(rule.cutoffTime ? 'Bestellschluss ' + rule.cutoffTime + ' Uhr' + (rule.cutoff ? ' · Absprache: ' + rule.cutoff : '') : rule.cutoff || 'Bestellschluss noch absprechen')}${rule.minNet === null ? '' : ' · Mindestbestellwert ' + money(rule.minNet) + ' netto'}</p>`;
}
