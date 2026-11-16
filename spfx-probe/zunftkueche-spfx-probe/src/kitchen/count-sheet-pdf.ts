// Abendabschluss auf Papier: Rückfall, wenn kein Gerät oder keine Verbindung da ist.
// Leere Kästchen zum Eintragen, gruppiert wie in der App. Die Werte werden später in der App übernommen.
import type { InventorySession } from './model';
import { PdfPage, pdfDocument, wrap } from './pdf-document.ts';

const num = (value: number): string => value.toLocaleString('de-DE', { maximumFractionDigits: 4 });

export interface CountSheetContext {
  area: string;
  seasonName: string;
  places?: Record<string, string>;
  categories?: Record<string, string>;
  generatedAt?: string;
}

/** A4 hochkant, 595 × 842 Punkte. */
export function countSheetPdf(session: InventorySession, context: CountSheetContext): Uint8Array {
  const places = context.places || {},
    categories = context.categories || {};
  const groupOf = (articleId: string): string => (categories[articleId] || '').trim() || 'Ohne Kategorie';
  const lines = [...session.lines].sort(
    (a, b) =>
      groupOf(a.articleId).localeCompare(groupOf(b.articleId), 'de') || a.articleName.localeCompare(b.articleName, 'de')
  );
  const stamp = new Date(context.generatedAt || new Date().toISOString()).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const pages: string[] = [];
  let page = new PdfPage(),
    y = 0,
    group = '';
  const start = (): void => {
    page = new PdfPage();
    page.box(0, 782, 595, 60, [0.25, 0.27, 0.58]);
    page.raw('1 1 1 rg\n');
    page.text(36, 812, 'Abendabschluss · Liste zum Ausfüllen', 16, true);
    page.text(36, 794, context.area + ' · ' + context.seasonName + ' · gedruckt ' + stamp, 9);
    page.raw('0 0 0 rg\n');
    page.text(36, 760, 'Datum: ______________   Gezählt von: ______________________________', 9);
    page.text(36, 742, 'Leeres Kästchen = nicht gezählt. 0 = nichts vorhanden.', 8);
    page.text(330, 722, 'Volle Gebinde', 8, true);
    page.text(400, 722, 'Einzeln', 8, true);
    page.text(492, 722, 'P', 8, true);
    page.text(512, 722, 'N', 8, true);
    page.text(532, 722, 'Ü', 8, true);
    page.line(36, 716, 559, 716, 0.6);
    y = 700;
    group = '';
  };
  const finish = (): void => {
    page.text(36, 30, 'P = passt · N = nachbestellen · Ü = Überhang', 7);
    page.text(500, 30, 'Seite ' + (pages.length + 1), 7);
    pages.push(page.stream);
  };
  start();
  for (const line of lines) {
    const name = wrap(line.articleName, 44),
      single = line.packSize === 1,
      detail =
        (places[line.articleId] ? places[line.articleId] + ' · ' : '') +
        (single ? 'Menge in ' + line.unit : line.packName + ' · ' + num(line.packSize) + ' ' + line.unit),
      groupChange = groupOf(line.articleId) !== group,
      height = Math.max(34, name.length * 11 + 22) + (groupChange ? 22 : 0);
    if (y - height < 60) {
      finish();
      start();
    }
    if (groupOf(line.articleId) !== group) {
      group = groupOf(line.articleId);
      page.text(36, y, group, 10, true);
      y -= 18;
    }
    name.forEach((part, i) => page.text(36, y - i * 11, part, 10, i === 0));
    page.text(36, y - name.length * 11 - 1, detail, 7);
    if (!single) page.frame(330, y - 12, 62, 22);
    page.frame(400, y - 12, 50, 22);
    page.text(453, y - 4, line.unit.slice(0, 8), 7);
    [492, 512, 532].forEach(x => page.frame(x, y - 8, 10, 10));
    y -= Math.max(34, name.length * 11 + 22);
    page.line(36, y + 8, 559, y + 8);
  }
  finish();
  return pdfDocument(pages, 595, 842);
}
