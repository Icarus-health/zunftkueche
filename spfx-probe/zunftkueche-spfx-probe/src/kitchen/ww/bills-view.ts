import { invoicePriceProposals } from './invoice-prices.ts';
import type { Area, Workspace, Stored } from '../model';
import type { Bill, BillLine } from './model';
import { billGrossForArea, billTypeLabel, linkedBill, relatedBills, returnMovements } from './bill-accounting.ts';
import { reconcileBill } from './reconciliation.ts';
import { documents, billLineLabels, billLineRoles } from './model.ts';
import { button, field, select, h, n, money, note, check, empty, backLink } from '../markup.ts';
import { businessTabs, heading, confirmationActions, dayLabel } from './common.ts';
export function billLine(s: Workspace, l?: BillLine): string {
  return `<div class="ww-line" data-line data-id="${h(l?.id || crypto.randomUUID())}">${field('lineName', 'Originalbezeichnung', l?.name || '', true)}${select(
    'lineRole',
    'Positionsart',
    billLineRoles.map(role => [role, billLineLabels[role]]),
    l?.role ?? 'goods'
  )}${select(
    'articleId',
    'Artikel zuordnen (optional)',
    [
      ['', 'Noch nicht zugeordnet'],
      ...s.articles.filter(r => r.value.active).map(r => [r.value.id, r.value.name] as [string, string])
    ],
    l?.articleId || ''
  )}${field('quantity', 'Rechnungsmenge', n(l?.quantity), false, 'text', 'inputmode="decimal"')}${field('unit', 'Rechnungseinheit', l?.unit || '')}${field('unitNet', 'Einzelpreis netto', n(l?.unitNet), false, 'text', 'inputmode="decimal"')}${field('totalNet', 'Zeilenbetrag netto', n(l?.totalNet), false, 'text', 'inputmode="decimal"')}${field('taxRate', 'Steuersatz %', n(l?.taxRate), false, 'text', 'inputmode="decimal"')}${button('ww-remove', 'Entfernen')}</div>`;
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
  fromInbox = false
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
  const progress = '<p class="ww-full" data-pdf-progress role="status" aria-live="polite" hidden></p>';
  const retry =
    '<details class="ww-full"><summary>Erkennung erneut versuchen</summary>' +
    button('ww-pdf-ocr', 'Scan mit Texterkennung lesen') +
    '</details>';
  return `<form data-form="ww-bill" class="panel ww-editor">${heading(credit ? 'Gutschrift prüfen' : 'Rechnung prüfen', fromInbox || credit ? '' : 'Original behalten, Angaben prüfen und mit Bestellungen verbinden.')}${reviewNote}${
    fromInbox
      ? '<p class="muted">Original aus SharePoint · ' + h(b.fileName) + '</p>' + progress
      : '<p class="ww-alert">Saison: ' +
        h(season?.name || 'nicht gewählt') +
        ' · Rechnungsdatum und Saison prüfen. Gelieferte Mengen bei der Bestellung annehmen.</p>'
  }${b.needsSeparateFiles ? '<p class="ww-alert" role="alert">Mehrere Belege erkannt. Bitte die Einzelbelege aus dem Original ablegen und getrennt prüfen.</p>' : ''}<div class="bill-workbench">${previewUrl ? '<aside class="bill-original"><h2>Original vergleichen</h2>' + (previewImage ? '<a href="' + h(previewUrl) + '" target="_blank" rel="noopener noreferrer"><img src="' + h(previewImage.image) + '" alt="Rechnungsoriginal, Seite 1"></a><p>Seite 1 von ' + previewImage.pages + (previewImage.pages > 1 ? ' · Weitere Seiten im Original öffnen.' : '') + '</p>' : '<p>Seitenvorschau nicht verfügbar. Bitte das Original separat öffnen.</p>') + '<a href="' + h(previewUrl) + '" target="_blank" rel="noopener noreferrer">Original separat öffnen</a></aside>' : ''}<div class="formgrid">${
    fromInbox
      ? ''
      : '<h2 class="ww-full">1 · PDF auswählen und lesen</h2>' +
        field('pdf', 'PDF-Original auswählen', '', false, 'file', 'accept=".pdf"') +
        button('ww-pdf-read', 'Rechnung auslesen') +
        progress +
        retry +
        '<p class="ww-full muted">Text und Bildscans werden auf diesem Gerät gelesen. Ergebnisse am Original prüfen.</p>' +
        (b.fileName
          ? '<p class="ww-full">Original: ' + h(b.fileName) + (b.attachment ? ' · gespeichert' : '') + '</p>'
          : '')
  }
    <h2 class="ww-full">${fromInbox ? 'Rechnungsdaten' : '2 · Rechnungsdaten prüfen'}</h2>${select(
      'billType',
      'Belegart',
      [
        ['invoice', 'Rechnung'],
        ['credit', 'Gutschrift']
      ],
      b.billType ?? ((b.gross ?? 0) < 0 ? 'credit' : 'invoice')
    )}
    ${field('name', 'Belegname', b.name, true)}${select('supplierId', 'Lieferant', [['', 'Lieferant auswählen'], ...s.suppliers.filter(r => r.value.active).map(r => [r.value.id, r.value.name] as [string, string])], b.supplierId, 'required')}${field('number', credit ? 'Gutschriftnummer' : 'Rechnungsnummer', b.number)}${field('date', credit ? 'Belegdatum' : 'Rechnungsdatum', b.date, true, 'date')}${field('net', 'Netto gesamt', n(b.net), false, 'text', 'inputmode="decimal"')}${field('tax', 'Steuer gesamt', n(b.tax), false, 'text', 'inputmode="decimal"')}${field('gross', 'Brutto gesamt', n(b.gross), false, 'text', 'inputmode="decimal"')}${field('adjustmentNet', 'Nebenkosten / Rabatt netto (mit Vorzeichen)', n(b.adjustmentNet), false, 'text', 'inputmode="decimal"')}<h2 class="ww-full">${fromInbox ? 'Bestellung und Positionen' : '3 · Bestellung und Positionen prüfen'}</h2><details class="ww-full"${b.orderIds.length || b.creditForId || b.returnIds?.length ? ' open' : ''}><summary>Bestellung, Originalrechnung und Rückgaben zuordnen</summary>
    ${billRelations(b, s)}</details>${billCostFields(b)}${suggestions.length ? `<div class="ww-full ww-alert"><strong>${suggestions.length} Positionsvorschläge gefunden</strong><p>Mengen und Bezeichnungen am Original prüfen. Preise und Einheiten am Beleg prüfen. Brutto-Preise werden nicht als Netto übernommen; unerkannte Positionen ergänzen.</p><ul>${suggestions.map(l => `<li>${h(l.name)} · ${n(l.quantity)}</li>`).join('')}</ul>${button('ww-bill-accept-lines', 'Positionen übernehmen')}</div>` : ''}<div class="ww-lines">${b.lines.map(l => billLine(s, l)).join('')}</div>${button('ww-add', credit ? 'Position hinzufügen' : 'Rechnungsposition hinzufügen', 'bill')}${b.billType === 'credit' ? '<p class="ww-full muted">Beträge einer Gutschrift mit negativem Vorzeichen eintragen.</p>' : ''}${note('note', 'Hinweise / Abweichungen / Pfand', b.note)}${b.needsSeparateFiles ? '' : check('confirmed', credit ? 'Gutschrift geprüft und bestätigen' : 'Original, Lieferant, Positionen, Mengen, Summen und Bestellbezug geprüft und Rechnung bestätigen', b.confirmed)}</div></div>${sourceText ? `<details><summary>Ausgelesener PDF-Text · Angaben am Original prüfen</summary><pre class="ww-original">${h(sourceText)}</pre></details>` : ''}${fromInbox ? retry : '<p>Die Texterkennung liefert Vorschläge für Kopf, Summen und bei unterstützten Formaten Positionen. Alle Angaben am Original prüfen; unlesbare oder mehrdeutige Werte bleiben offen. Für Bildscans steht die Texterkennung zur Verfügung; bei schlechter Qualität Angaben manuell erfassen.</p>'}${confirmationActions(b.needsSeparateFiles ? 'Zur Prüfung speichern' : credit ? 'Gutschrift speichern' : 'Rechnung speichern', fromInbox ? 'Zurück zu den Rechnungen' : 'Abbrechen')}</form>`;
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
            `<div class="listrow"><div><h2>${h(s.suppliers.find(v => v.value.id === b.supplierId)?.value.name || 'Lieferant')} · ${h(b.number || b.name)}</h2><p>${h(b.number || 'Nummer offen')} · ${dayLabel(b.date)} · ${h(billTypeLabel(b))} · ${h(s.suppliers.find(r => r.value.id === b.supplierId)?.value.name)} · ${b.scanNumberReview?.status === 'open' ? 'Belegnummern prüfen' : b.needsSeparateFiles ? 'Einzelbelege erforderlich' : b.confirmed ? 'Bestätigt' : 'Entwurf'}${b.costAssignment?.mode === 'open' ? ' · Kostenstelle offen' : ''}</p><small>${b.lines.length} Positionen · ${b.orderIds.length} Bestellbezüge · ${b.attachment ? 'Original gespeichert' : 'Ohne gespeichertes Original'}</small></div><div class="actions"><strong>${money(b.gross)} brutto</strong>${button(b.confirmed ? 'ww-bill-view' : 'ww-edit', b.confirmed ? 'Ansehen' : 'Weiter prüfen', b.id)}</div></div>`
        )
        .join('') || empty('Noch keine Rechnungen. Original als PDF hinzufügen oder Beleg manuell erfassen.')
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
    `<section class="panel"><h2>${h(billTypeLabel(b))}</h2><p>Netto ${b.net === null ? 'offen' : money(b.net)} · Steuer ${b.tax === null ? 'offen' : money(b.tax)} · Brutto ${money(b.gross)}</p><div class="ww-preview"><table><thead><tr><th>Position</th><th>Art</th><th>Menge</th><th>Einzelpreis netto</th><th>Zeile netto</th></tr></thead><tbody>${b.lines.map(l => `<tr><td>${h(l.name)}</td><td>${h(l.role ? billLineLabels[l.role] : 'Offen')}</td><td>${n(l.quantity)} ${h(l.unit)}</td><td>${money(l.unitNet)}</td><td>${money(l.totalNet)}</td></tr>`).join('')}</tbody></table></div><p>${h(b.note)}</p>${b.scanNumberReview?.status === 'reviewed' ? `<p class="ww-source">Einzelbeleg geprüft von ${h(b.scanNumberReview.by)} am ${h(new Date(b.scanNumberReview.at).toLocaleString('de-DE'))}. ${h(b.scanNumberReview.reason)}</p>` : ''}<p class="ww-source">Geprüft: ${h(b.by)} · ${h(new Date(b.at).toLocaleString('de-DE'))}</p>${b.attachment ? button('ww-bill-original', 'PDF-Original herunterladen', b.id) : ''}</section>${
      invoicePriceProposals(b, s).length
        ? '<section class="panel"><h2>Preisänderungen prüfen</h2><p>Nettopreis je eindeutig zugeordnetem Liefergebinde. Keine Änderung an alten Bestellungen. Rabatt, Pfand, Fracht oder unklare Einheiten werden nicht übernommen.</p>' +
          invoicePriceProposals(b, s)
            .map(
              p =>
                '<p><strong>' +
                h(p.name) +
                '</strong> · ' +
                h(p.offer.packName) +
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
          button('ww-bill-prices', 'Als neuen Preisstand vorbereiten', b.id) +
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
                h(row.unit) +
                ' · ' +
                dayLabel(row.at.slice(0, 10)) +
                '</p>'
            )
            .join('') || '<p>Zuordnung zu einer erfassten Rückgabe offen.</p>')
        : ''
    }${latest ? '<p class="muted">Zuordnung ergänzt: ' + h(latest.reason) + ' · ' + h(latest.by) + '</p>' : ''}${comparison.length ? `<p>Vergleich in Artikel-Basiseinheiten. Offene oder abweichende Einheiten bleiben zur Prüfung offen. Preisabweichung = Rechnungszeile netto minus Bestellpreis für die Rechnungsmenge, ohne Pfand.</p><div class="ww-preview"><table><thead><tr><th>Artikel</th><th>Bestellt</th><th>Angenommen</th><th>Berechnet</th><th>Mengendifferenz</th><th>Preisabweichung netto</th></tr></thead><tbody>${comparison.map(r => `<tr><td>${h(r.name)}<small>${h(r.issue)}</small></td><td>${r.ordered === null ? 'Offen' : n(r.ordered) + ' ' + h(r.unit)}</td><td>${r.received === null ? 'Offen' : n(r.received)}</td><td>${r.invoiced === null ? 'Offen' : n(r.invoiced)}</td><td>${r.quantityDifference === null ? 'Offen' : n(r.quantityDifference)}</td><td>${r.priceDifference === null ? 'Offen' : money(r.priceDifference)}</td></tr>`).join('')}</tbody></table></div>` : ''}${
      b.orderIds
        .map(id => {
          const o = s.orders.find(r => r.value.id === id)?.value;
          return o
            ? `<div class="listrow"><div><strong>${h(o.supplierName)} · ${h(o.occasion)}</strong><p>${o.lines.length} bestellte Positionen · ${(o.receipts || []).length} Wareneingänge</p><small>Rechnungs- und Liefergebinde können abweichen. Mengen und Pfand am Original vergleichen.</small></div>${button('order-open', 'Bestellung prüfen', id)}</div>`
            : '<p>Bestellbezug nicht geladen.</p>';
        })
        .join('') || '<p>Keine Bestellung zugeordnet.</p>'
    }</section>`
  );
}
