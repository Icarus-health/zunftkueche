// Auswertung einer ganzen Saison über alle Bereiche (Küche, Zunftscheuer, Marktplatz).
// Rechnet nur mit bestätigten Daten; was nicht eindeutig zuzuordnen ist, steht als eigene Zeile da.
import type { Area, Workspace } from './model';
import { AREAS } from './model.ts';
import { orderTotal } from './domain.ts';
import { documents } from './ww/model.ts';
import { activeImports, cents, importEffects } from './ww/domain.ts';
import { billGrossForArea, linkedBill, purchaseTotals } from './ww/bill-accounting.ts';
import { exportBusinessRows } from './ww/reports.ts';
import { button, h, money } from './markup.ts';

export interface AreaFigures {
  area: Area;
  orders: number;
  /** Bestellwert netto der vollständig bepreisten Bestellungen. */
  orderValue: number;
  ordersWithoutPrice: number;
  /** Einkauf laut bestätigten Rechnungen und Gutschriften, Bruttoanteil dieses Bereichs. */
  purchase: number;
  /** Verkäufe aus Kassendaten, nur Bruttobeträge in Euro. */
  sales: number;
  salesOtherBasis: number;
  closings: number;
}
export interface FasnetFigures {
  areas: AreaFigures[];
  total: Omit<AreaFigures, 'area'>;
  /** Einkauf, der keinem der Bereiche zugeordnet ist (offene Kostenstelle oder „Andere Bereiche“). */
  purchaseUnassigned: number;
  billsOpen: number;
}

function salesFor(state: Workspace, seasonId: string, area: Area): { sales: number; other: number } {
  const systems = activeImports(documents(state.ww, 'system').filter(d => d.scope === seasonId && d.area === area));
  let sales = 0,
    other = 0;
  for (const row of importEffects(systems).sales) {
    if (row.amount === null) continue;
    if (row.basis === 'gross' && row.currency === 'EUR') sales = cents(sales + row.amount);
    else other++;
  }
  return { sales, other };
}

export function fasnetFigures(state: Workspace, seasonId: string): FasnetFigures {
  const bills = documents(state.ww, 'bill')
    .filter(d => d.scope === seasonId && d.confirmed)
    .map(b => linkedBill(b, state));
  const areas = AREAS.map((area): AreaFigures => {
    const orders = state.orders
      .map(r => r.value)
      .filter(
        o => o.seasonId === seasonId && o.area === area && (o.status === 'Bestellt' || o.status === 'Abgeschlossen')
      );
    const priced = orders.filter(o => orderTotal(o) !== null);
    const relevant = bills.filter(b => billGrossForArea(b, area) !== undefined);
    const { sales, other } = salesFor(state, seasonId, area);
    return {
      area,
      orders: orders.length,
      orderValue: cents(priced.reduce((sum, o) => sum + (orderTotal(o) ?? 0), 0)),
      ordersWithoutPrice: orders.length - priced.length,
      purchase: relevant.length ? purchaseTotals(relevant, area).gross : 0,
      sales,
      salesOtherBasis: other,
      closings: (state.inventories || []).filter(
        r => r.value.seasonId === seasonId && r.value.area === area && r.value.status === 'Abgeschlossen'
      ).length
    };
  });
  const sum = (pick: (row: AreaFigures) => number): number => cents(areas.reduce((total, row) => total + pick(row), 0));
  const purchaseAll = purchaseTotals(bills).gross;
  return {
    areas,
    total: {
      orders: sum(r => r.orders),
      orderValue: sum(r => r.orderValue),
      ordersWithoutPrice: sum(r => r.ordersWithoutPrice),
      purchase: purchaseAll,
      sales: sum(r => r.sales),
      salesOtherBasis: sum(r => r.salesOtherBasis),
      closings: sum(r => r.closings)
    },
    purchaseUnassigned: cents(purchaseAll - sum(r => r.purchase)),
    billsOpen: bills.filter(b => b.costAssignment?.mode === 'open').length
  };
}

function figureRow(label: string, value: string, note = ''): string {
  return `<div class="figure-row"><dt>${h(label)}</dt><dd>${value}${note ? `<small>${h(note)}</small>` : ''}</dd></div>`;
}
function figures(row: Omit<AreaFigures, 'area'>, unassigned?: number, total = false): string {
  return (
    '<dl class="figure-list">' +
    figureRow(
      'Verkäufe brutto',
      money(row.sales),
      row.salesOtherBasis ? row.salesOtherBasis + ' Posten mit anderer Preisart nicht enthalten' : ''
    ) +
    figureRow(
      'Einkauf laut Rechnungen brutto',
      money(row.purchase),
      unassigned ? 'davon ohne Bereich: ' + money(unassigned) : ''
    ) +
    figureRow(
      'Verkäufe minus Einkauf',
      money(cents(row.sales - row.purchase)),
      total ? 'vorläufig, beides brutto' : ''
    ) +
    figureRow(
      'Bestellwert netto',
      money(row.orderValue),
      row.orders +
        (row.orders === 1 ? ' Bestellung' : ' Bestellungen') +
        (row.ordersWithoutPrice ? ', ' + row.ordersWithoutPrice + ' ohne vollständige Preise' : '')
    ) +
    figureRow('Abendabschlüsse', String(row.closings)) +
    '</dl>'
  );
}

/** Oberer Teil der Auswertung: die ganze Saison, darunter jeder Bereich für sich. */
export function fasnetReport(state: Workspace, seasonId: string, seasonName: string): string {
  const f = fasnetFigures(state, seasonId);
  const open = f.billsOpen
    ? `<p class="figure-hint" role="status">${f.billsOpen} ${f.billsOpen === 1 ? 'Beleg hat' : 'Belege haben'} noch keine Kostenstelle.</p>`
    : '';
  return (
    `<section class="fasnet-report" aria-labelledby="fasnet-total"><div class="figure-card total"><h2 id="fasnet-total">${h(seasonName)} gesamt</h2><p>Alle Bereiche zusammen. Nur bestätigte Rechnungen und Kassendaten.</p>${figures(f.total, f.purchaseUnassigned, true)}${open}${button('fasnet-export', 'Ganze Saison als CSV')}</div>` +
    `<div class="figure-areas">${f.areas.map(row => `<div class="figure-card"><h3>${h(row.area)}</h3>${figures(row)}</div>`).join('')}</div></section>`
  );
}

/** CSV über alle Bereiche: dieselben Zeilen wie je Bereich, mit dem Bereich als erster Spalte. */
export function exportFasnetRows(state: Workspace, seasonId: string): string {
  const lines: string[] = [];
  AREAS.forEach((area, index) => {
    const rows = exportBusinessRows(state, seasonId, area).replace(/^﻿/, '').split('\r\n');
    rows.forEach((row, rowIndex) => {
      if (rowIndex === 0) {
        if (index === 0) lines.push('"Bereich";' + row);
      } else if (row) lines.push('"' + area + '";' + row);
    });
  });
  return '﻿' + lines.join('\r\n');
}
