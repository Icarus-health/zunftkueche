import { invoicePriceProposals } from './invoice-prices.ts';
import type { Area, Workspace, Stored } from '../model';
import type { Bill, BillLine } from './model';
import { billGrossForArea, billTypeLabel, linkedBill, relatedBills, returnMovements } from './bill-accounting.ts';
import { reconcileBill } from './reconciliation.ts';
import { documents, billLineLabels, billLineRoles } from './model.ts';
import { button, field, select, h, n, money, euro, amount2, note, check, emptyAction, backLink } from '../markup.ts';
import { areaOptions } from '../model.ts';
import { count, unitName } from '../units.ts';
import { paymentNote } from './bill-suggest.ts';
import { businessTabs, heading, confirmationActions, dayLabel } from './common.ts';
export function billLine(s: Workspace, l?: BillLine): string {
  const decimal = 'inputmode="decimal"';
  return `<div class="ww-line bill-line" data-line data-id="${h(l?.id || crypto.randomUUID())}">${field('lineName', 'Bezeichnung auf der Rechnung', l?.name || '', true)}${select(
    'articleId',
    'Artikel',
    [
      ['', 'Kein Artikel zugeordnet'],
      ...s.articles
        .filter(r => r.value.active || r.value.id === l?.articleId)
        .sort((x, y) => x.value.name.localeCompare(y.value.name, 'de'))
        .map(r => [r.value.id, r.value.name] as [string, string])
    ],
    l?.articleId || ''
  )}${field('quantity', 'Menge', n(l?.quantity), false, 'text', decimal)}${field('unit', 'Einheit', l?.unit || '')}${field('unitNet', 'Preis netto', amount2(l?.unitNet), false, 'text', decimal)}${field('totalNet', 'Zeile netto', amount2(l?.totalNet), false, 'text', decimal)}${field('taxRate', 'Steuer %', n(l?.taxRate), false, 'text', decimal)}${select(
    'lineRole',
    'Art',
    billLineRoles.map(role => [role, billLineLabels[role]]),
    l?.role ?? 'goods'
  )}${button('ww-remove', 'Entfernen')}</div>`;
}
function billRelations(b: Bill, s: Workspace): string {
  const orders = s.orders.filter(
    o => o.value.seasonId === b.scope && o.value.area === b.area && o.value.supplierId === b.supplierId
  );
  const returns = returnMovements(b, s);
  const label = (id: string): string => s.articles.find(row => row.value.id === id)?.value.name ?? id;
  return (
    '<fieldset><legend>Bestellungen</legend>' +
    (orders
      .map(o =>
        check(
          'order_' + o.value.id,
          o.value.occasion + ' · ' + (o.value.deliveryDate || 'Termin offen'),
          b.orderIds.includes(o.value.id)
        )
      )
      .join('') || '<p>Keine passende Bestellung.</p>') +
    '</fieldset>' +
    (b.billType === 'credit'
      ? select(
          'creditForId',
          'Originalrechnung',
          [
            ['', 'Zuordnung offen'],
            ...relatedBills(b, s).map((row): [string, string] => [
              row.id,
              (row.number || row.name) + ' · ' + dayLabel(row.date)
            ])
          ],
          b.creditForId ?? ''
        )
      : '') +
    '<fieldset><legend>Erfasste Warenrückgaben</legend>' +
    (returns
      .map(row =>
        check(
          'return_' + row.id,
          label(row.articleId) + ' · ' + n(row.quantity) + ' ' + row.unit + ' · ' + dayLabel(row.at.slice(0, 10)),
          !!b.returnIds?.includes(row.id)
        )
      )
      .join('') || '<p>Keine passende Warenrückgabe erfasst.</p>') +
    '</fieldset>'
  );
}
function billCostFields(bill: Bill): string {
  const cost = bill.costAssignment;
  const split = cost?.mode === 'split' ? cost : undefined;
  return (
    '<details class="ww-full"' +
    (cost ? ' open' : '') +
    '><summary>Kostenstelle</summary>' +
    select(
      'costMode',
      'Zuordnung',
      [
        ['current', 'Diesem Bereich zuordnen'],
        ['open', 'Zuordnung offen'],
        ['split', 'Auf mehrere Bereiche verteilen']
      ],
      cost?.mode ?? 'current'
    ) +
    '<div data-cost-split' +
    (split ? '' : ' hidden') +
    '><p>Die Anteile müssen zusammen dem Bruttobetrag entsprechen.</p><div class="formgrid">' +
    field('costKitchen', 'Küche brutto', n(split?.kitchen), false, 'text', 'inputmode="decimal"') +
    field('costScheuer', 'Zunftscheuer brutto', n(split?.scheuer), false, 'text', 'inputmode="decimal"') +
    field('costMarket', 'Marktplatz brutto', n(split?.market ?? 0), false, 'text', 'inputmode="decimal"') +
    field('costOther', 'Andere Bereiche brutto', n(split?.other), false, 'text', 'inputmode="decimal"') +
    '</div></div></details>'
  );
}
export function billLinkForm(bill: Bill, s: Workspace): string {
  const b = linkedBill(bill, s);
  const relations = b.costAssignment
    ? '<details><summary>Bestellungen und Rückgaben zuordnen</summary>' + billRelations(b, s) + '</details>'
    : billRelations(b, s);
  return (
    '<form data-form="ww-bill-link" class="panel">' +
    heading('Belegzuordnung ergänzen', b.gross === null ? '' : 'Bruttobetrag am Original: ' + money(b.gross)) +
    billCostFields(b) +
    relations +
    field('reason', 'Grund der Ergänzung', '', true, 'text', 'maxlength="1000"') +
    confirmationActions('Zuordnung speichern') +
    '</form>'
  );
}
export function billForm(
  b: Bill,
  s: Workspace,
  sourceText: string,
  suggestions: BillLine[] = [],
  previewUrl = '',
  previewImage?: { image: string; pages: number },
  fromInbox = false,
  queue = '',
  hasNext = false
): string {
  if (b.scanNumberReview?.status === 'open') {
    const original = previewUrl
      ? '<p><a href="' + h(previewUrl) + '" target="_blank" rel="noopener noreferrer">Original öffnen</a></p>'
      : b.attachment
        ? button('ww-bill-original', 'PDF-Original herunterladen', b.id)
        : '';
    const review = original
      ? field('singleDocumentReason', 'Begründung der Einzelbelegprüfung', '', false, 'text', 'maxlength="300"') +
        button('ww-bill-single', 'Alle Seiten geprüft · als Einzelbeleg weiter', '', true)
      : field('pdf', 'Dasselbe PDF erneut auswählen', '', false, 'file', 'accept=".pdf"') +
        button('ww-pdf-read', 'Original erneut öffnen') +
        '<p data-pdf-progress role="status" hidden></p>';
    return (
      '<form data-form="ww-bill" data-collection class="panel ww-editor">' +
      heading('Belegnummern prüfen', b.fileName) +
      '<p>Die Texterkennung hat unterschiedliche Nummern gelesen. Vergleiche alle Seiten im Original. Bei mehreren Belegen bitte einzelne PDFs ablegen.</p>' +
      original +
      review +
      (!original && sourceText ? '<p role="status">' + h(sourceText) + '</p>' : '') +
      (original
        ? confirmationActions('Prüfung offen speichern', fromInbox ? 'Zurück zu den Rechnungen' : 'Abbrechen')
        : button('ww-cancel', fromInbox ? 'Zurück zu den Rechnungen' : 'Abbrechen')) +
      '</form>'
    );
  }
  if (fromInbox && b.needsSeparateFiles && b.sourceFile && b.fileHash) {
    return (
      '<form data-form="ww-bill" data-collection class="panel ww-editor">' +
      heading('Einzelbelege ablegen', b.fileName) +
      '<p>Dieses PDF enthält mehrere Belege. Lege jede Rechnung und Gutschrift als eigene PDF-Datei im selben Rechnungsordner ab.</p>' +
      (previewUrl
        ? '<p><a href="' + h(previewUrl) + '" target="_blank" rel="noopener noreferrer">Sammel-PDF öffnen</a></p>'
        : '') +
      confirmationActions('Prüfstatus speichern', 'Zurück zu den Rechnungen') +
      '</form>'
    );
  }
  const season = s.seasons.find(r => r.value.id === b.scope)?.value;
  const reviewNote =
    b.scanNumberReview?.status === 'reviewed'
      ? '<p class="ww-alert">Original als Einzelbeleg geprüft. Nummer, Datum und Beträge aus dem Original eintragen.</p>'
      : '';
  const credit = b.billType === 'credit';
  const decimal = 'inputmode="decimal"';
  const progress = '<p class="ww-full" data-pdf-progress role="status" aria-live="polite" hidden></p>';
  const retry =
    '<details class="ww-full form-more"><summary>Schlecht gelesen? Texterkennung für Scans verwenden</summary>' +
    button('ww-pdf-ocr', 'Scan mit Texterkennung lesen') +
    '</details>';
  const supplierName = s.suppliers.find(r => r.value.id === b.supplierId)?.value.name;
  // Was die App aus der Datei übernommen hat, in einem Satz. Leere Felder nennt der zweite Satz.
  const mapped = b.lines.filter(l => l.articleId).length;
  const read = [
    supplierName ? 'Lieferant ' + supplierName : '',
    b.number ? 'Nummer ' + b.number : '',
    b.gross !== null ? 'Brutto ' + euro(b.gross) : '',
    b.lines.length
      ? count(b.lines.length, 'Position', 'Positionen') + (mapped ? ', ' + mapped + ' mit Artikel' : '')
      : '',
    paymentNote(b)
  ].filter(Boolean);
  const missing = [
    b.supplierId ? '' : 'Lieferant',
    b.number ? '' : 'Rechnungsnummer',
    b.gross === null ? 'Bruttobetrag' : ''
  ].filter(Boolean);
  const summary =
    sourceText && (read.length || missing.length)
      ? '<div class="bill-read" role="status">' +
        (read.length ? '<p><strong>Aus der Rechnung gelesen:</strong> ' + h(read.join(' · ')) + '</p>' : '') +
        (missing.length
          ? '<p><strong>Bitte ergänzen:</strong> ' + h(missing.join(', ')) + '</p>'
          : '<p>Bitte kurz mit dem Original vergleichen, dann bestätigen.</p>') +
        '</div>'
      : '';
  const lineSum = b.lines.every(l => l.totalNet !== null)
    ? b.lines.reduce((sum, l) => sum + (l.totalNet || 0), 0) + b.adjustmentNet
    : null;
  const lineNote = !b.lines.length
    ? '<p class="muted ww-full">Positionen sind freiwillig. Ohne Positionen zählt die Rechnung mit ihren Summen, aber ohne Preise je Artikel.</p>'
    : lineSum !== null && b.net !== null
      ? '<p class="ww-full ' +
        (Math.abs(lineSum - b.net) <= 0.02 ? 'muted' : 'ww-alert') +
        '">Summe der Positionen ' +
        h(euro(lineSum)) +
        ' netto · auf der Rechnung ' +
        h(euro(b.net)) +
        (Math.abs(lineSum - b.net) <= 0.02 ? ' · passt.' : ' · passt noch nicht.') +
        '</p>'
      : '';
  const terms =
    '<details class="ww-full form-more"' +
    (b.deliveryDate || b.dueDate || b.skontoUntil ? ' open' : '') +
    '><summary>Lieferung und Zahlung</summary><div class="formgrid">' +
    field('deliveryDate', 'Lieferdatum', b.deliveryDate || '', false, 'date') +
    field('dueDate', 'Zahlbar bis', b.dueDate || '', false, 'date') +
    field('skontoUntil', 'Skonto bis', b.skontoUntil || '', false, 'date') +
    field('skontoAmount', 'Skonto-Betrag', amount2(b.skontoAmount), false, 'text', decimal) +
    '</div></details>';
  const more =
    '<details class="ww-full form-more"' +
    (b.orderIds.length || b.creditForId || b.returnIds?.length || b.costAssignment || b.adjustmentNet || credit
      ? ' open'
      : '') +
    '><summary>Weitere Angaben: Bestellung, Kostenstelle, Gutschrift</summary><div class="formgrid">' +
    select(
      'billType',
      'Belegart',
      [
        ['invoice', 'Rechnung'],
        ['credit', 'Gutschrift']
      ],
      b.billType ?? ((b.gross ?? 0) < 0 ? 'credit' : 'invoice')
    ) +
    field('name', 'Belegname', b.name) +
    field(
      'adjustmentNet',
      'Nebenkosten oder Rabatt netto (mit Vorzeichen)',
      amount2(b.adjustmentNet),
      false,
      'text',
      decimal
    ) +
    '</div>' +
    billRelations(b, s) +
    billCostFields(b) +
    note('note', 'Hinweise, Abweichungen, Pfand', b.note) +
    '</details>';
  const priced = b.needsSeparateFiles ? [] : invoicePriceProposals(linkedBill({ ...b, confirmed: true }, s), s);
  const prices = priced.length
    ? '<fieldset class="ww-full bill-prices"><legend>Preise für die Preisliste</legend><ul>' +
      priced
        .map(
          p =>
            '<li><strong>' +
            h(s.articles.find(a => a.value.id === p.offer.articleId)?.value.name || p.name) +
            '</strong> · ' +
            h(unitName(p.offer.packName, 1)) +
            ': ' +
            h(euro(p.newPrice)) +
            ' netto <span class="muted">(' +
            (p.oldPrice === null ? 'bisher ohne Preis' : 'bisher ' + h(euro(p.oldPrice))) +
            ')</span></li>'
        )
        .join('') +
      '</ul>' +
      check(
        'updatePrices',
        'Beim Bestätigen in die Preisliste von ' + (supplierName || 'diesem Lieferanten') + ' übernehmen',
        true
      ) +
      '</fieldset>'
    : '';
  const original = previewUrl
    ? '<aside class="bill-original"><div class="bill-original-bar"><h2>Original</h2>' +
      (previewImage ? button('ww-bill-zoom', 'Vergrößern') : '') +
      '<a href="' +
      h(previewUrl) +
      '" target="_blank" rel="noopener noreferrer">In neuem Fenster öffnen</a></div>' +
      (previewImage
        ? '<button type="button" class="bill-page" data-action="ww-bill-zoom" aria-label="Original vergrößern oder verkleinern"><img src="' +
          h(previewImage.image) +
          '" alt="Rechnungsoriginal, Seite 1"></button><p class="muted">Seite 1 von ' +
          previewImage.pages +
          (previewImage.pages > 1 ? ' · weitere Seiten im neuen Fenster.' : '') +
          '</p>'
        : '<p>Seitenvorschau nicht verfügbar. Bitte das Original im neuen Fenster öffnen.</p>') +
      '</aside>'
    : '';
  const upload = fromInbox
    ? ''
    : '<div class="ww-full bill-upload">' +
      field('pdf', 'Rechnung als PDF auswählen', '', false, 'file', 'accept=".pdf"') +
      button('ww-pdf-read', 'Rechnung auslesen') +
      '</div>' +
      progress +
      (b.fileName
        ? '<p class="ww-full muted">Original: ' + h(b.fileName) + (b.attachment ? ' · gespeichert' : '') + '</p>'
        : '');
  return (
    `<form data-form="ww-bill" class="panel ww-editor bill-form">` +
    heading(
      credit ? 'Gutschrift prüfen' : 'Rechnung prüfen',
      fromInbox ? b.fileName + (queue ? ' · ' + queue : '') : season?.name || ''
    ) +
    reviewNote +
    (fromInbox ? progress : '') +
    (b.needsSeparateFiles
      ? '<p class="ww-alert" role="alert">Mehrere Belege erkannt. Bitte die Einzelbelege aus dem Original ablegen und getrennt prüfen.</p>'
      : '') +
    summary +
    `<div class="bill-workbench">${original}<div class="formgrid">` +
    upload +
    select(
      'supplierId',
      'Lieferant',
      [
        ['', 'Lieferant auswählen'],
        ...s.suppliers.filter(r => r.value.active).map(r => [r.value.id, r.value.name] as [string, string])
      ],
      b.supplierId,
      'required'
    ) +
    select('billArea', 'Bereich', areaOptions(), b.area) +
    (b.supplierId
      ? ''
      : '<details class="ww-full form-more bill-new-supplier"><summary>Lieferant fehlt in der Liste?</summary><div class="bill-upload">' +
        field('newSupplier', 'Name des neuen Lieferanten', '') +
        button('ww-bill-supplier-new', 'Anlegen und auswählen') +
        '</div></details>') +
    field('number', credit ? 'Gutschriftnummer' : 'Rechnungsnummer', b.number) +
    field('date', credit ? 'Belegdatum' : 'Rechnungsdatum', b.date, true, 'date') +
    field('gross', 'Brutto gesamt', amount2(b.gross), false, 'text', decimal) +
    field('net', 'Netto gesamt', amount2(b.net), false, 'text', decimal) +
    field('tax', 'Steuer gesamt', amount2(b.tax), false, 'text', decimal) +
    terms +
    `<h2 class="ww-full">Positionen</h2>` +
    lineNote +
    (suggestions.length
      ? `<div class="ww-full ww-alert"><strong>${count(suggestions.length, 'weitere Position', 'weitere Positionen')} in der Datei gefunden</strong>${button('ww-bill-accept-lines', 'Positionen übernehmen')}</div>`
      : '') +
    `<div class="ww-lines ww-full">${b.lines.map(l => billLine(s, l)).join('')}</div>` +
    '<div class="ww-full">' +
    button('ww-add', 'Position hinzufügen', 'bill') +
    '</div>' +
    (credit ? '<p class="ww-full muted">Beträge einer Gutschrift mit negativem Vorzeichen eintragen.</p>' : '') +
    prices +
    more +
    '</div></div>' +
    (sourceText
      ? `<details class="form-more"><summary>Ausgelesener Text der Datei</summary><pre class="ww-original">${h(sourceText)}</pre></details>`
      : '') +
    retry +
    '<div class="actions sticky-actions">' +
    (b.needsSeparateFiles
      ? ''
      : check('confirmed', credit ? 'Geprüft, Gutschrift bestätigen' : 'Geprüft, Rechnung bestätigen', b.confirmed)) +
    `<button type="submit" class="primary">${b.needsSeparateFiles ? 'Zur Prüfung speichern' : 'Speichern'}</button>` +
    (fromInbox && hasNext && !b.needsSeparateFiles
      ? button('ww-bill-save-next', 'Bestätigen und nächste Rechnung')
      : '') +
    button('ww-cancel', fromInbox ? 'Zurück zu den Rechnungen' : 'Abbrechen') +
    '</div></form>'
  );
}
export function billsOverview(s: Workspace, area: Area): string {
  return (
    businessTabs('bills') +
    heading(
      'Rechnungen und Belege',
      'Belege prüfen, Originale aufbewahren und Bestellungen zuordnen.',
      button('ww-new', 'Rechnung / PDF erfassen', 'bill', true)
    ) +
    `<section class="panel">${
      documents(s.ww, 'bill')
        .map(b => linkedBill(b, s))
        .filter(b => b.area === area || (b.confirmed && !!billGrossForArea(b, area)))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map(
          b =>
            `<div class="listrow"><div><h2>${h(s.suppliers.find(v => v.value.id === b.supplierId)?.value.name || 'Lieferant')} · ${h(b.number || b.name)}</h2><p>${h(b.number || 'Nummer offen')} · ${dayLabel(b.date)} · ${h(billTypeLabel(b))} · ${h(s.suppliers.find(r => r.value.id === b.supplierId)?.value.name)} · ${b.scanNumberReview?.status === 'open' ? 'Belegnummern prüfen' : b.needsSeparateFiles ? 'Einzelbelege erforderlich' : b.confirmed ? 'Bestätigt' : 'Entwurf'}${b.costAssignment?.mode === 'open' ? ' · Kostenstelle offen' : ''}</p><small>${[b.lines.length ? count(b.lines.length, 'Position', 'Positionen') : 'nur Summen', b.orderIds.length ? count(b.orderIds.length, 'Bestellung zugeordnet', 'Bestellungen zugeordnet') : '', paymentNote(b), b.attachment ? 'Original gespeichert' : ''].filter(Boolean).join(' · ')}</small></div><div class="actions"><strong>${money(b.gross)} brutto</strong>${button(b.confirmed ? 'ww-bill-view' : 'ww-edit', b.confirmed ? 'Ansehen' : 'Weiter prüfen', b.id)}</div></div>`
        )
        .join('') ||
      emptyAction(
        'Noch keine Rechnungen. Original als PDF hinzufügen oder Beleg manuell erfassen.',
        'ww-new',
        'Erste Rechnung erfassen',
        'bill'
      )
    }</section>`
  );
}
export function billDetail(row: Stored<Bill>, s: Workspace): string {
  const latest = documents(s.ww, 'billLink')
    .filter(l => l.billId === row.value.id && l.scope === row.value.scope && l.area === row.value.area && l.confirmed)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  const b = linkedBill(row.value, s);
  const comparison = reconcileBill(b, s);
  const original = relatedBills(b, s).find(doc => doc.id === b.creditForId);
  const cost = b.costAssignment;
  const costText =
    cost?.mode === 'open'
      ? '<p>Kostenstelle · Zuordnung offen</p>'
      : cost?.mode === 'split'
        ? '<p>Kostenstelle brutto · Küche ' +
          money(cost.kitchen) +
          ' · Zunftscheuer ' +
          money(cost.scheuer) +
          ' · Marktplatz ' +
          money(cost.market ?? 0) +
          ' · Andere Bereiche ' +
          money(cost.other) +
          '</p>'
        : '';
  const credits = documents(s.ww, 'bill').filter(
    doc =>
      doc.confirmed &&
      doc.billType === 'credit' &&
      doc.scope === b.scope &&
      doc.area === b.area &&
      linkedBill(doc, s).creditForId === b.id
  );
  return (
    backLink('ww-cancel', 'Rechnungen') +
    heading(b.name, b.number + ' · ' + dayLabel(b.date)) +
    `<section class="panel"><h2>${h(billTypeLabel(b))}</h2><p>Netto ${b.net === null ? 'offen' : money(b.net)} · Steuer ${b.tax === null ? 'offen' : money(b.tax)} · Brutto ${money(b.gross)}</p><div class="ww-preview"><table><thead><tr><th>Position</th><th>Art</th><th>Menge</th><th>Einzelpreis netto</th><th>Zeile netto</th></tr></thead><tbody>${b.lines.map(l => `<tr><td>${h(l.name)}</td><td>${h(l.role ? billLineLabels[l.role] : 'Offen')}</td><td>${n(l.quantity)} ${h(unitName(l.unit, l.quantity))}</td><td>${money(l.unitNet)}</td><td>${money(l.totalNet)}</td></tr>`).join('')}</tbody></table></div><p>${h(b.note)}</p>${b.scanNumberReview?.status === 'reviewed' ? `<p class="ww-source">Einzelbeleg geprüft von ${h(b.scanNumberReview.by)} am ${h(new Date(b.scanNumberReview.at).toLocaleString('de-DE'))}. ${h(b.scanNumberReview.reason)}</p>` : ''}<p class="ww-source">Geprüft: ${h(b.by)} · ${h(new Date(b.at).toLocaleString('de-DE'))}</p>${b.attachment ? button('ww-bill-original', 'PDF-Original herunterladen', b.id) : ''}</section>${
      invoicePriceProposals(b, s).length
        ? '<section class="panel"><h2>Preisänderungen prüfen</h2><p>Nettopreis je Gebinde. Alte Bestellungen bleiben unverändert. Rabatt, Pfand, Fracht oder unklare Einheiten werden nicht übernommen.</p>' +
          invoicePriceProposals(b, s)
            .map(
              p =>
                '<p><strong>' +
                h(p.name) +
                '</strong> · ' +
                h(unitName(p.offer.packName, 1)) +
                ' à ' +
                n(p.offer.packSize) +
                ' · bisher ' +
                money(p.oldPrice) +
                ' → ' +
                money(p.newPrice) +
                ' netto · ' +
                h(p.date) +
                '</p>'
            )
            .join('') +
          button('ww-bill-prices', 'Preise übernehmen', b.id) +
          '</section>'
        : ''
    }<section class="panel"><h2>${b.billType === 'credit' ? 'Zuordnungen' : 'Abgleich mit Bestellungen'}</h2>${button('ww-bill-link', 'Zuordnung ergänzen', b.id)}${costText}${
      b.billType === 'credit'
        ? '<p>Originalrechnung · ' +
          h(original?.number || 'Zuordnung offen') +
          '</p>' +
          (original ? button('ww-bill-view', 'Originalrechnung ansehen', original.id) : '')
        : ''
    }
    ${credits.length ? '<h3>Gutschriften zu diesem Beleg</h3>' + credits.map(doc => '<p>' + h(doc.number) + ' · ' + money(doc.gross) + ' ' + button('ww-bill-view', 'Gutschrift ansehen', doc.id) + '</p>').join('') : ''}
    ${
      b.lines.some(line => line.role === 'return') || b.returnIds?.length
        ? '<h3>Warenrückgaben</h3>' +
          (returnMovements(b, s)
            .filter(row => b.returnIds?.includes(row.id))
            .map(
              row =>
                '<p>' +
                h(s.articles.find(a => a.value.id === row.articleId)?.value.name || row.articleId) +
                ' · ' +
                n(row.quantity) +
                ' ' +
                h(unitName(row.unit)) +
                ' · ' +
                dayLabel(row.at.slice(0, 10)) +
                '</p>'
            )
            .join('') || '<p>Zuordnung zu einer erfassten Rückgabe offen.</p>')
        : ''
    }${latest ? '<p class="muted">Zuordnung ergänzt: ' + h(latest.reason) + ' · ' + h(latest.by) + '</p>' : ''}${comparison.length ? `<p>Vergleich in Artikel-Basiseinheiten. Offene oder abweichende Einheiten bleiben zur Prüfung offen. Preisabweichung = Rechnungszeile netto minus Bestellpreis für die Rechnungsmenge, ohne Pfand.</p><div class="ww-preview"><table><thead><tr><th>Artikel</th><th>Bestellt</th><th>Angenommen</th><th>Berechnet</th><th>Mengendifferenz</th><th>Preisabweichung netto</th></tr></thead><tbody>${comparison.map(r => `<tr><td>${h(r.name)}<small>${h(r.issue)}</small></td><td>${r.ordered === null ? 'Offen' : n(r.ordered) + ' ' + h(unitName(r.unit, r.ordered))}</td><td>${r.received === null ? 'Offen' : n(r.received)}</td><td>${r.invoiced === null ? 'Offen' : n(r.invoiced)}</td><td>${r.quantityDifference === null ? 'Offen' : n(r.quantityDifference)}</td><td>${r.priceDifference === null ? 'Offen' : money(r.priceDifference)}</td></tr>`).join('')}</tbody></table></div>` : ''}${
      b.orderIds
        .map(id => {
          const o = s.orders.find(r => r.value.id === id)?.value;
          return o
            ? `<div class="listrow"><div><strong>${h(o.supplierName)} · ${h(o.occasion)}</strong><p>${count(o.lines.length, 'bestellte Position', 'bestellte Positionen')} · ${count((o.receipts || []).length, 'Wareneingang', 'Wareneingänge')}</p><small>Gebinde auf Rechnung und Bestellung können abweichen. Mengen und Pfand am Original vergleichen.</small></div>${button('order-open', 'Bestellung prüfen', id)}</div>`
            : '<p>Bestellbezug nicht geladen.</p>';
        })
        .join('') || '<p>Keine Bestellung zugeordnet.</p>'
    }</section>`
  );
}
