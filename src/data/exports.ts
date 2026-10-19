import type { KitchenState } from '../domain/state.ts';
import { buildClosureChecklist } from '../domain/event-close.ts';
import { movementQuantity, effectiveSales } from '../domain/corrections.ts';
import { sameLocation, purchasingLocation } from '../domain/locations.ts';

type ExportRow = Array<string | number | null>;
export function buildEventExport(state: KitchenState, scope: string, createdAt = new Date().toISOString()) {
  const closure = state.closureHistory?.at(-1);
  const checklist = state.event.status === 'Abgeschlossen' && closure?.action === 'close' && closure.snapshot?.scope === scope
    ? closure.snapshot! : buildClosureChecklist(state, scope);
  const invoices = state.invoices.filter(invoice => scope === 'Alle' || sameLocation(state, invoice.scope, scope));
  const movements = state.movements.filter(movement => scope === 'Alle' || sameLocation(state, movement.location, scope));
  const sales = scope === 'Alle' || scope === purchasingLocation(state) ? effectiveSales(state) : [];
  const sources = [...new Map(invoices.filter(invoice => invoice.source).map(invoice => [invoice.source!.hash, invoice.source!])).values()];
  const rows: ExportRow[] = [['Art', 'ID', 'Bezeichnung', 'Tag / Zuordnung', 'Menge', 'Brutto Cent', 'Netto Cent', 'Quelle / ursprünglicher Wert']];
  for (const invoice of invoices) {
    rows.push(['Beleg', invoice.id, invoice.number, invoice.scope, null, invoice.grossCents, invoice.netCents,
      invoice.source ? `${invoice.source.file} #${invoice.source.hash}` : invoice.documentUrl ?? 'Original offen']);
  }
  for (const movement of movements) {
    rows.push(['Bestand', movement.id, state.articles.find(article => article.id === movement.articleId)?.name ?? movement.articleId,
      `${movement.day} / ${movement.location}`, movementQuantity(state, movement), null, null,
      `Ursprünglich ${movement.quantity}; ${movement.orderId ?? 'ohne Bestellbezug'}`]);
  }
  for (const sale of sales) {
    rows.push(['Verkauf', sale.id, state.menu.find(menu => menu.id === sale.menuId)?.name ?? sale.menuId, sale.day, sale.quantity,
      sale.priceCents === null || sale.quantity === null ? null : sale.priceCents * sale.quantity, null,
      `Stückpreis ${sale.priceCents ?? 'Offen'} Cent; ${sale.quantity === null ? 'Menge offen' : 'bestätigte Menge'}`]);
  }
  return {
    kind: 'event-report' as const, event: { ...state.event }, scope, revision: state.revision, createdAt, sources, checklist, rows,
    notice: 'Auswertung – keine Vollsicherung. Offene Werte sind keine Nullwerte.',
  };
}
export type EventExport = ReturnType<typeof buildEventExport>;
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? 'Offen' : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
function csvRows(rows: unknown[][]): string {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function toCsv(report: EventExport): string {
  return csvRows([
    ['Veranstaltung', report.event.name, report.event.year], ['Umfang', report.scope],
    ['Revision', report.revision], ['Prüfgrundlage Revision', report.checklist.revision], ['Erstellt', report.createdAt], [report.notice],
    ['Prüfstatus', report.checklist.complete ? 'Vollständig' : 'Offen'],
    ...report.checklist.open.map(reason => ['Offener Prüfpunkt', reason]),
    ['Nettoergebnis Cent', report.checklist.resultCents], ['Ergebnisgrundlage', report.checklist.resultReason],
    ...report.rows,
  ]);
}
function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? 'Offen').replace(/[&<>"']/g, character => entities[character]);
}
export function toPrintHtml(report: EventExport): string {
  const header = report.rows[0].map(cell => `<th>${escapeHtml(cell)}</th>`).join('');
  const body = report.rows.slice(1).map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  const issues = report.checklist.open.map(reason => `<li>${escapeHtml(reason)}</li>`).join('');
  return `<!doctype html><html lang="de"><meta charset="utf-8"><title>Auswertung ${escapeHtml(report.event.name)}</title>
<style>body{font:12px system-ui;margin:25px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}@media print{@page{size:A4 landscape;margin:12mm}}</style>
<h1>${escapeHtml(report.event.name)} ${report.event.year}</h1>
<p>Umfang ${escapeHtml(report.scope)} · Revision ${report.revision} · Prüfgrundlage Revision ${report.checklist.revision} · Erstellt ${escapeHtml(report.createdAt)}</p>
<p>${escapeHtml(report.notice)}</p><ul>${issues}</ul>
<p>Nettoergebnis: ${escapeHtml(report.checklist.resultCents === null ? null : (report.checklist.resultCents / 100).toFixed(2) + ' EUR')}</p>
<p>${escapeHtml(report.checklist.resultReason)}</p>
<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></html>`;
}
export function downloadReport(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Historical header and amounts come solely from the saved order, never current masters. */
export function orderCsv(order: KitchenState['orders'][number], exportRevision: number, createdAt = new Date().toISOString()): string {
  const status = order.status === 'bestellt' ? 'manuell als bestellt vermerkt'
    : order.status === 'bestaetigt' ? 'manuell als bestätigt vermerkt' : 'offen';
  return csvRows([
    ['Bestellfassung', order.id ?? 'Nicht gespeichert'],
    ['Veranstaltung', order.context?.eventName ?? 'Historischer Kontext offen', order.context?.eventYear ?? 'Offen'],
    ['Lieferant', order.context?.supplierName ?? 'Historischer Name offen'], ['Umfang', order.day],
    ['Ausgabe-Datenrevision', exportRevision], ['Bestellrevision', 'historisch nicht erfasst'],
    ['Fassung erstellt', order.createdAt ?? 'Offen'], ['Ausgabe erstellt', createdAt], ['Versandstatus', status],
    ['Lieferdatum', order.context?.deliveryDate ?? 'Offen'], ['Lieferadresse', order.context?.deliveryAddress ?? 'Offen'],
    ['Kontakt', order.context?.contact ?? 'Offen'], ['Auswertung – keine Vollsicherung'],
    ['Positions-ID', 'Artikel', 'Menge', 'Einheit', 'Zeit', 'Netto Stückpreis Cent', 'Quelle'],
    ...order.lines.map((line: { id: string; name: string; quantity: number | null; unit: string; time: string; unitPriceCents: number | null; source?: { file: string; hash: string } }) => [
      line.id, line.name, line.quantity, line.unit, line.time, line.unitPriceCents,
      line.source ? `${line.source.file} #${line.source.hash}` : 'Offen',
    ]),
  ]);
}
