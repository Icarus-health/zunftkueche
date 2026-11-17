import type { Workspace, Area } from '../model';
import { documents, billLineLabels } from './model.ts';
import type { Bill, BillLineRole, SystemImport } from './model';
import { importEffects, activeImports, cents, round } from './domain.ts';
import { purchaseTotals, billTypeLabel, linkedBill, billGrossForArea } from './bill-accounting.ts';
import { button, h, n, money, empty } from '../markup.ts';

function paymentReport(systems: SystemImport[]): string {
  const groups = new Map<string, { method: string; currency: string; paid: number; refunded: number }>();
  for (const doc of systems) {
    if (doc.purpose !== 'payments') continue;
    for (const row of doc.rows) {
      if (row.status === 'cancelled') continue;
      const key = JSON.stringify([doc.currency, row.paymentMethod.toLocaleLowerCase('de-DE')]);
      const group = groups.get(key) ?? {
        method: row.paymentMethod || 'Zahlart offen',
        currency: doc.currency,
        paid: 0,
        refunded: 0
      };
      if (row.status === 'refund') group.refunded = cents(group.refunded - row.amount);
      else group.paid = cents(group.paid + row.amount);
      groups.set(key, group);
    }
  }
  const rows = [...groups.values()].sort(
    (a, b) => a.currency.localeCompare(b.currency) || a.method.localeCompare(b.method, 'de')
  );
  const amount = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const renderRow = (row: (typeof rows)[number]): string =>
    '<tr><th scope="row">' +
    h(row.method) +
    ' · ' +
    h(row.currency) +
    '</th><td>' +
    amount.format(row.paid) +
    '</td><td>' +
    amount.format(row.refunded) +
    '</td><td><strong>' +
    amount.format(cents(row.paid - row.refunded)) +
    '</strong></td></tr>';
  const totals = [...new Set(rows.map(row => row.currency))].flatMap(currency => {
    const same = rows.filter(row => row.currency === currency);
    if (same.length < 2) return [];
    return [
      {
        method: 'Gesamt',
        currency,
        paid: cents(same.reduce((sum, row) => sum + row.paid, 0)),
        refunded: cents(same.reduce((sum, row) => sum + row.refunded, 0))
      }
    ];
  });
  const table = rows.length
    ? '<div class="ww-preview"><table><thead><tr><th>Zahlart</th><th>Gezahlt</th><th>Erstattet</th><th>Saldo</th></tr></thead><tbody>' +
      rows.map(renderRow).join('') +
      '</tbody>' +
      (totals.length ? '<tfoot>' + totals.map(renderRow).join('') + '</tfoot>' : '') +
      '</table></div>'
    : empty('Noch keine berücksichtigten Zahlungen aus Kassenabrechnungen.');
  return '<section aria-label="Zahlungsabrechnung"><h3>Zahlungsabrechnung</h3>' + table + '</section>';
}

function purchaseReport(bills: Bill[], area: Area): string {
  const pending = bills.filter(b => b.area === area && b.costAssignment?.mode === 'open').length;
  const relevant = bills.filter(b => {
    const gross = billGrossForArea(b, area);
    return gross !== undefined && (b.costAssignment?.mode !== 'split' || gross !== 0);
  });
  const open = pending
    ? '<p role="status">' +
      pending +
      (pending === 1 ? ' Beleg mit offener Kostenstelle.' : ' Belege mit offener Kostenstelle.') +
      '</p>'
    : '';
  if (!relevant.length) return '<h3>Einkauf</h3><p>Noch keine Kosten zugeordnet.</p>' + open;
  const totals = purchaseTotals(relevant, area);
  const roles: BillLineRole[] = ['deposit', 'return', 'discount', 'expense', 'open'];
  const rows = roles.flatMap(role => {
    const amount = totals.lines[role];
    if (!amount) return [];
    const missing = amount.unknown ? ' · ' + amount.unknown + ' ohne Nettobetrag' : '';
    return [
      '<tr><th scope="row">' +
        h(billLineLabels[role] + missing) +
        '</th><td>' +
        money(amount.charged) +
        '</td><td>' +
        money(amount.credited) +
        '</td></tr>'
    ];
  });
  return (
    '<h3>Einkauf</h3><dl class="summary-grid"><div><dt>Rechnungen brutto</dt><dd>' +
    money(totals.invoices) +
    '</dd></div><div><dt>Gutschriften brutto</dt><dd>' +
    money(totals.credits) +
    '</dd></div>' +
    (totals.legacy ? '<div><dt>Negative Altbelege brutto</dt><dd>' + money(totals.legacy) + '</dd></div>' : '') +
    '<div><dt>Belegsaldo brutto</dt><dd>' +
    money(totals.gross) +
    '</dd></div></dl>' +
    open +
    (relevant.some(b => b.costAssignment?.mode === 'split')
      ? '<p>Bei aufgeteilten Belegen ist der Bruttoanteil enthalten. Die Nettopositionen bleiben am Original.</p>'
      : '') +
    (rows.length
      ? '<details><summary>Pfand, Rückgaben und weitere Positionen</summary><div class="ww-preview"><table><thead><tr>' +
        '<th>Positionsart</th><th>Berechnet netto</th><th>Gutgeschrieben netto</th></tr></thead><tbody>' +
        rows.join('') +
        '</tbody></table></div></details>'
      : '')
  );
}

export function wwReport(s: Workspace, season: string, area: Area): string {
  const systems = activeImports(documents(s.ww, 'system').filter(d => d.scope === season && d.area === area));
  const effects = importEffects(systems);
  const bills = documents(s.ww, 'bill')
    .filter(d => d.scope === season && d.confirmed)
    .map(b => linkedBill(b, s));
  const movements = documents(s.ww, 'movement').filter(d => d.scope === season && d.area === area && d.confirmed);
  const sales = [...effects.sales].sort((a, b) => b.quantity - a.quantity);
  const returns = movements.filter(row => row.type === 'return').length;
  const revenue = new Map<string, { sum: number; missing: number }>();
  const basisLabel = (basis: string): string =>
    basis === 'gross' ? 'brutto' : basis === 'net' ? 'netto' : 'Preisart offen';
  for (const row of sales) {
    const key = row.currency + ' · ' + basisLabel(row.basis);
    const value = revenue.get(key) ?? { sum: 0, missing: 0 };
    if (row.amount === null) value.missing++;
    else value.sum = cents(value.sum + row.amount);
    revenue.set(key, value);
  }
  const consumption = new Map<string, { articleId: string; unit: string; quantity: number }>();
  for (const { articleId, unit, quantity } of effects.consumption) {
    const key = JSON.stringify([articleId, unit]);
    consumption.set(key, { articleId, unit, quantity: round((consumption.get(key)?.quantity ?? 0) + quantity) });
  }
  return (
    '<section class="plain-section"><div class="page-heading"><div><h2>Saisonabrechnung</h2>' +
    '<p>Bestätigte Daten der gewählten Saison und des Bereichs.</p></div>' +
    button('ww-export', 'Auswertung exportieren (CSV)') +
    '</div>' +
    paymentReport(systems) +
    '<h3>Artikelverkäufe</h3>' +
    ([...revenue]
      .map(
        ([key, value]) =>
          '<p>' +
          n(value.sum) +
          ' ' +
          h(key) +
          (value.missing ? ' · ' + value.missing + ' Produkte mit unvollständigem Betrag' : '') +
          '</p>'
      )
      .join('') || empty('Noch keine bestätigten Artikelverkäufe.')) +
    (sales.length
      ? '<div class="ww-preview"><table><caption>Bestseller nach Absatzmenge</caption><thead><tr><th>Produkt</th><th>Absatz nach Erstattungen</th><th>Umsatz</th></tr></thead><tbody>' +
        sales
          .map(
            row =>
              '<tr><td>' +
              h(row.name) +
              '</td><td>' +
              n(row.quantity) +
              '</td><td>' +
              (row.amount === null ? 'Unvollständig' : n(row.amount) + ' ' + h(row.currency)) +
              ' · ' +
              h(basisLabel(row.basis)) +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table></div>'
      : '') +
    purchaseReport(bills, area) +
    '<h3>Verbrauch</h3><p>Rezeptverbrauch aus bestätigten Artikelverkäufen</p><div class="data-list">' +
    ([...consumption.values()]
      .map(
        row =>
          '<div class="listrow"><strong>' +
          h(s.articles.find(a => a.value.id === row.articleId)?.value.name || row.articleId) +
          '</strong><span>' +
          n(row.quantity) +
          ' ' +
          h(row.unit) +
          '</span></div>'
      )
      .join('') || empty('Noch kein rechnerischer Rezeptverbrauch.')) +
    '</div><p>' +
    movements.length +
    (movements.length === 1 ? ' erfasste Warenbewegung' : ' erfasste Warenbewegungen') +
    ' · ' +
    returns +
    (returns === 1 ? ' Rückgabe' : ' Rückgaben') +
    '</p>' +
    '<div class="actions">' +
    button('ww-open', 'Bestandsbewegungen', 'journal') +
    button('ww-open', 'Rezeptkalkulation', 'recipes') +
    '</div>' +
    '<p>Menüvorbestellungen · ' +
    n(effects.menuDemand.reduce((sum, row) => sum + row.quantity, 0)) +
    ' Portionen geplant</p>' +
    '</section>'
  );
}

function csvCell(value: unknown): string {
  let text = typeof value === 'number' ? n(value) : String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text) && typeof value !== 'number') text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export function exportBusinessRows(s: Workspace, season: string, area: Area): string {
  const rows: unknown[][] = [
    [
      'Art',
      'Quelle',
      'Datum von',
      'Datum bis',
      'Artikel',
      'Menge',
      'Einheit',
      'Betrag',
      'Preisart',
      'Währung',
      'Status',
      'Zahlart'
    ]
  ];
  for (const doc of activeImports(documents(s.ww, 'system').filter(d => d.scope === season && d.area === area))) {
    if (doc.purpose === 'payments') {
      for (const row of doc.rows)
        rows.push([
          'Zahlung',
          doc.name,
          row.date ?? doc.from,
          row.date ?? doc.to,
          '',
          '',
          '',
          row.amount,
          '',
          doc.currency,
          row.status,
          row.paymentMethod
        ]);
    } else {
      for (const row of doc.rows)
        rows.push([
          doc.purpose,
          doc.name,
          row.date,
          row.date,
          row.name,
          row.quantity,
          'Portion / Stück',
          row.amount === null ? '' : n(row.amount),
          doc.basis,
          doc.currency,
          row.status,
          ''
        ]);
    }
  }
  for (const original of documents(s.ww, 'bill').filter(d => d.scope === season && d.confirmed)) {
    const bill = linkedBill(original, s),
      gross = billGrossForArea(bill, area);
    if ((gross === undefined && bill.area !== area) || (bill.costAssignment?.mode === 'split' && gross === 0)) continue;
    rows.push([
      billTypeLabel(bill),
      bill.number,
      bill.date,
      bill.date,
      bill.name,
      '',
      '',
      gross === undefined ? '' : gross,
      'gross',
      'EUR',
      gross === undefined
        ? 'Kostenstelle offen'
        : bill.costAssignment?.mode === 'split'
          ? 'bestätigter Bereichsanteil'
          : 'bestätigt',
      ''
    ]);
  }
  for (const movement of documents(s.ww, 'movement').filter(d => d.scope === season && d.area === area && d.confirmed))
    rows.push([
      'Bewegung',
      movement.type,
      movement.at,
      movement.at,
      s.articles.find(a => a.value.id === movement.articleId)?.value.name || movement.articleId,
      movement.quantity,
      movement.unit,
      '',
      '',
      '',
      'bestätigt',
      ''
    ]);
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
