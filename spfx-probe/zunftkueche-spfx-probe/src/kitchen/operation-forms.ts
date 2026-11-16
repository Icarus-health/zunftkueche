import type { InventorySession, Order } from './model';
import type { DeliverySlip } from './ww/model';
import { button, field, h, n, note, segmented, select } from './markup.ts';
import { unitName } from './units.ts';
import { deliveryRemaining } from './supplier-orders.ts';
import { dayLabel } from './ww/common.ts';
import { countQuantity, receivedQuantity } from './operations.ts';
import { searchField } from './workspace.ts';
import { icon } from './icons.ts';
function localTime(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function slipInput(): string {
  return '<label>Lieferscheindatei<input type="file" name="deliverySlipFile" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></label>';
}
export function deliverySlipsView(order: Order, slips: DeliverySlip[], writable: boolean): string {
  if (!writable && !slips.length) return '';
  const label = (date: string | null | undefined): string => (date ? dayLabel(date) : 'Termin offen');
  const lines = slips
    .map(slip => {
      const date = slip.deliveryId
        ? order.deliveries?.find(slot => slot.id === slip.deliveryId)?.date
        : order.deliveryDate;
      return (
        '<div class="listrow"><div><strong>' +
        h(slip.name) +
        '</strong><small>' +
        h(label(date)) +
        '</small></div>' +
        button('slip-download', 'Herunterladen', slip.id) +
        '</div>'
      );
    })
    .join('');
  const form = writable
    ? '<form data-form="delivery-slip"><div class="formgrid">' +
      (order.deliveries?.length
        ? select(
            'slipDelivery',
            'Liefertermin',
            [
              ['', 'Termin wählen'],
              ...order.deliveries.map((slot): [string, string] => [
                slot.id,
                label(slot.date) + (slot.place ? ' · ' + slot.place : '') + (slot.time ? ' · ' + slot.time : '')
              ])
            ],
            '',
            'required'
          )
        : '') +
      slipInput() +
      '</div><p class="muted">PDF, JPEG oder PNG · bis 8 MB</p><button type="submit">Lieferschein ablegen</button></form>'
    : '';
  return (
    '<details class="receipt-history"' +
    (slips.length ? ' open' : '') +
    '><summary>Lieferscheine' +
    (slips.length ? ' (' + slips.length + ')' : '') +
    '</summary>' +
    lines +
    (form && slips.length
      ? '<details class="calm-disclosure"><summary>Weiteren Lieferschein ablegen</summary>' + form + '</details>'
      : form) +
    '</details>'
  );
}
/** Stand der Eingabe in der Warenannahme: wie viele Zeilen haben eine Menge, und wo bleibt ein Rest offen. */
export function receiptProgress(filled: number, total: number): string {
  return filled + ' von ' + total + ' eingetragen';
}
export function receiptForm(order: Order, deliveryId?: string, slipsReady = false): string {
  const selected = order.deliveries?.find(d => d.id === deliveryId) || order.deliveries?.[0];
  const lines = order.lines.filter(l => !selected || l.schedule?.[selected.id] !== 0);
  let open = 0;
  const list = lines
    .map(l => {
      const ordered = selected ? (l.schedule?.[selected.id] ?? null) : l.quantity,
        remaining = selected
          ? deliveryRemaining(order, l.id, selected.id)
          : Math.max(0, (l.quantity || 0) - receivedQuantity(order, l.id)),
        received = (ordered || 0) - remaining;
      const unknown = ordered === null || ordered === undefined,
        entry = !unknown && remaining > 0;
      if (entry) open++;
      return `<div class="receipt-line"${entry ? ' data-receipt-line data-expected="' + remaining + '"' : ''}><div><strong>${h(l.articleName)}</strong><small class="receipt-expected">${unknown ? 'Menge offen' : 'Noch erwartet: ' + n(remaining) + ' ' + h(unitName(l.packName, remaining))}${l.packSize !== 1 ? ' · à ' + n(l.packSize) + ' ' + h(unitName(l.unit, l.packSize)) : ''}</small>${received > 0 ? '<small>Bisher da: ' + n(received) + ' ' + h(unitName(l.packName, received)) + '</small>' : ''}${entry ? '<small class="receipt-rest" data-receipt-rest hidden></small>' : ''}</div>${unknown ? '<strong class="receipt-state">Menge offen – Bestellung prüfen</strong>' : entry ? icon('check') + field('received_' + l.id, 'Jetzt geliefert', '', false, 'text', 'inputmode="decimal" aria-label="' + h('Jetzt geliefert · ' + l.articleName + ' · ' + l.packName + ' · Rest ' + n(remaining)) + '"') : '<strong class="receipt-state done">' + icon('check') + 'Erledigt</strong>'}</div>`;
    })
    .join('');
  return `<form data-form="receipt" class="panel calm-workflow receipt-form"><div class="calm-heading"><div>${button('cancel', 'Zurück')}<h1>Warenannahme</h1></div></div><div class="receipt-top"><p class="calm-subtitle">${h(order.supplierName)}</p>${selected ? '<label class="pill-select"><span class="sr-only">Liefertermin</span><select name="receiptDelivery">' + order.deliveries!.map(d => '<option value="' + h(d.id) + '"' + (d.id === selected.id ? ' selected' : '') + '>' + h((d.date ? dayLabel(d.date) : 'Datum offen') + ' · ' + d.place) + '</option>').join('') + '</select></label>' : ''}</div><div class="receipt-status"><p class="receipt-progress" data-receipt-progress>${receiptProgress(0, open)}</p>${button('receipt-all', 'Bestellmengen eintragen')}</div><p class="calm-hint receipt-hint">„Bestellmengen eintragen“ trägt offene Mengen ein. Erst bestätigen speichert. Teilmengen bleiben offen.</p><div class="receipt-head" aria-hidden="true"><span>Artikel</span><span>Jetzt geliefert</span></div><div class="receipt-list">${list}</div><div class="receipt-more"><details class="calm-disclosure"><summary>Abweichung oder Zeitpunkt ergänzen</summary><div class="formgrid">${field('receivedAt', 'Tatsächlicher Zeitpunkt', localTime(), true, 'datetime-local')}${
    select(
      'deviation',
      'Abweichung',
      [
        ['', 'Keine / noch offen'],
        ['Fehlmenge', 'Fehlmenge'],
        ['Falschlieferung', 'Falschlieferung'],
        ['Beschädigung', 'Beschädigung']
      ],
      ''
    ) + note('note', 'Lieferschein / Hinweis', '')
  }</div>${button('receipt-missing', 'Keine Lieferung erhalten vermerken')}</details>${
    slipsReady
      ? '<details class="calm-disclosure"><summary>Lieferschein hinzufügen <span class="optional">optional</span></summary>' +
        slipInput() +
        '<p>PDF, JPEG oder PNG · bis 8 MB</p></details>'
      : ''
  }</div><div class="calm-actions"><button type="submit" class="primary">Wareneingang bestätigen</button></div></form>`;
}
function countField(name: string, value: string, mode: string, label: string): string {
  return `<label class="count-field"><input name="${h(name)}" type="text" value="${h(value)}" inputmode="${mode}" placeholder="–" aria-label="${h(label)}" /></label>`;
}
/** Zwei gleichwertige Hälften neben dem sichtbaren Wert. Große Mengen werden direkt ins Feld getippt. */
function stepper(name: string, label: string): string {
  return `<span class="stepper"><button type="button" data-action="count-step" data-id="${h(name)}|-1" aria-label="${h(label)} · eins weniger">${icon('minus')}</button><button type="button" data-action="count-step" data-id="${h(name)}|1" aria-label="${h(label)} · eins mehr">${icon('plus')}</button></span>`;
}
function countAmount(name: string, unit: string, value: string, mode: string, label: string): string {
  return `<div class="count-amount"><span class="count-unit" aria-hidden="true">${h(unit)}</span>${countField(name, value, mode, label)}${stepper(name, label)}</div>`;
}
export function assessmentLabel(assessment: string): string {
  return assessment === 'reorder' ? 'Nachbestellen' : assessment === 'surplus' ? 'Überhang' : '';
}
export function countProgress(counted: number, visible: number, total: number): string {
  const filtered = visible < total;
  return (
    '<strong>' +
    counted +
    ' von ' +
    visible +
    (filtered ? ' angezeigten' : '') +
    ' Artikeln gezählt</strong>' +
    (filtered ? '<span><i> · </i>Gesamt: ' + total + ' Artikel</span>' : '')
  );
}
export function countShare(counted: number, visible: number): number {
  return visible > 0 ? Math.round((counted / visible) * 100) : 0;
}
export function inventoryForm(
  session: InventorySession,
  relevantIds: string[] = [],
  places: Record<string, string> = {},
  categories: Record<string, string> = {}
): string {
  type Line = InventorySession['lines'][number];
  const quantity = (l: Line): number | null => countQuantity(l.packs, l.loose, l.packSize);
  const counted = session.lines.filter(l => quantity(l) !== null).length;
  const groupOf = (l: Line): string => (categories[l.articleId] || '').trim();
  const groups = [...new Set(session.lines.map(groupOf))].sort((a, b) =>
    a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de')
  );
  const titled = groups.some(Boolean);
  /* Eine Zeile je Artikel. Antippen öffnet die Eingabe, immer nur eine zugleich. Alle Felder bleiben im Formular, auch die zugeklappten. */
  const line = (l: Line): string => {
    const q = quantity(l),
      single = l.packSize === 1,
      place = places[l.articleId] || '',
      badge = assessmentLabel(l.assessment);
    return (
      `<div class="count-line${single ? ' count-single' : ''}" data-relevant="${relevantIds.includes(l.articleId) || q !== null}" data-search="${h([l.articleName, place].filter(Boolean).join(' '))}">` +
      `<details class="count-item" name="count-item" data-section-key="count:${h(l.articleId)}"><summary><span class="count-name"><strong>${h(l.articleName)}</strong><small>${place ? h(place) + ' · ' : ''}${single ? 'Menge in ' + h(unitName(l.unit)) : h(unitName(l.packName, 1)) + ' · ' + n(l.packSize) + ' ' + h(unitName(l.unit, l.packSize))}${l.note ? ' · Hinweis: ' + h(l.note) : ''}</small></span><span class="count-badge" data-count-badge${badge ? '' : ' hidden'}>${badge}</span><span class="count-total" data-count-total="${h(l.articleId)}" data-state="${q === null ? 'open' : 'counted'}">${q === null ? 'offen' : n(q) + ' ' + h(unitName(l.unit, q))}</span>${icon('check')}</summary>` +
      `<div class="count-editor">${single ? '<input type="hidden" name="packs_' + h(l.articleId) + '" value="" />' : countAmount('packs_' + l.articleId, l.packName, n(l.packs), 'numeric', l.articleName + ' · volle ' + l.packName)}${countAmount('loose_' + l.articleId, single ? l.unit : l.unit + ' einzeln', n(single ? q : l.loose), 'decimal', l.articleName + ' · ' + (single ? l.unit : l.unit + ' einzeln'))}` +
      `${segmented(
        'assessment_' + l.articleId,
        'Einschätzung · ' + l.articleName,
        [
          ['ok', 'Passt'],
          ['reorder', 'Nachbestellen'],
          ['surplus', 'Überhang']
        ],
        l.assessment
      )}` +
      `<div class="count-editor-actions"><details class="count-note"${l.note ? ' open' : ''}><summary>${l.note ? 'Hinweis' : 'Hinweis hinzufügen'}</summary>${field('countnote_' + l.articleId, 'Kurzer Hinweis · ' + l.articleName, l.note)}</details><button type="button" class="primary" data-action="count-next" data-id="${h(l.articleId)}">Nächster Artikel</button></div></div></details></div>`
    );
  };
  const list = groups
    .map(group => {
      const lines = session.lines.filter(l => groupOf(l) === group);
      return `<section class="count-group" data-count-group>${titled ? '<h2>' + h(group || 'Ohne Kategorie') + ' <span data-group-count>' + lines.length + '</span></h2>' : ''}<div class="count-rows">${lines.map(line).join('')}</div></section>`;
    })
    .join('');
  return `<form data-form="inventory" class="panel inventory-form calm-workflow"><div class="calm-heading"><div>${button('cancel', 'Schließen')}<h1>Abendabschluss</h1></div></div><div class="inventory-entry"><div class="count-status"><p class="count-progress" data-count-progress>${countProgress(counted, session.lines.length, session.lines.length)}</p><div class="count-bar" aria-hidden="true"><i data-count-bar style="width:${countShare(counted, session.lines.length)}%"></i></div><p class="calm-hint">Artikel antippen und Menge eintragen. Leeres Feld = noch nicht gezählt. 0 = nichts vorhanden.</p><button type="button" class="text-button count-sheet" data-action="count-sheet" data-id="">Liste zum Ausdrucken (PDF)</button></div><div class="calm-toolbar">${
    relevantIds.length
      ? segmented(
          'inventoryFilter',
          'Artikel anzeigen',
          [
            ['planned', 'Bestellte Artikel', 'Bestellte Artikel dieser Saison'],
            ['all', 'Alle Artikel', 'Alle Artikel der Saison']
          ],
          'planned'
        )
      : ''
  }${searchField('', 'Artikel suchen')}</div>${list}<div class="calm-actions"><button type="submit">Entwurf speichern</button><button type="button" data-action="inventory-finish" data-id="" class="tinted">Weiter zur Prüfung</button></div></div><div data-inventory-review></div></form>`;
}
