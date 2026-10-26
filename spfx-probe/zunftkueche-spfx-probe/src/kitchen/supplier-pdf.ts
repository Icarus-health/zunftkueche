/* eslint-disable @rushstack/no-new-null -- Unknown totals remain explicit. */
import type { Order, Supplier } from './model';
import { orderTotal } from './domain.ts';
import { withSchedule, validateSchedule, validDate } from './supplier-orders.ts';

// PDF 1.4, standard embedded viewer fonts, WinAnsi text. No network or paid service.
const num = (v: number | null): string => v === null ? 'offen' : v.toLocaleString('de-DE', { maximumFractionDigits: 4 });
const bytes = (s: string): Uint8Array => Uint8Array.from([...s].map(c => c === '€' ? 128 : c === '–' ? 150 : c === '—' ? 151 : c === '·' ? 183 : c.charCodeAt(0) < 256 ? c.charCodeAt(0) : 63));
const literal = (s: string): string => s.replace(/[\r\n\t]/g, ' ').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const dateLabel = (s: string | null): string => s && validDate(s) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : 'Termin offen';
function wrap(text: string, size: number): string[] {
 const lines: string[] = []; let current = '';
 for (const word of text.replace(/\s+/g, ' ').split(' ')) {
  if ((current + ' ' + word).trim().length > size && current) { lines.push(current); current = ''; }
  let rest = word; while (rest.length > size) { if (current) { lines.push(current); current = ''; } lines.push(rest.slice(0, size)); rest = rest.slice(size); }
  current = (current + ' ' + rest).trim();
 }
 if (current) lines.push(current); return lines.length ? lines : [''];
}
export function supplierPdf(source: Order, supplier: Supplier, generatedAt = new Date().toISOString()): Uint8Array {
 const order = withSchedule(source); validateSchedule(order);
 if (!order.lines.length) throw new Error('Bitte zuerst Artikel und Mengen ergänzen.');
 const pages: string[] = [], dates = order.deliveries!, rowsPerPage = 11;
 for (let di = 0; di < dates.length; di += 5) {
  const columns = dates.slice(di, di + 5), width = 350 / columns.length;
  for (let li = 0; li < order.lines.length; li += rowsPerPage) {
   let stream = '';
   const text = (x: number, y: number, value: string, size = 9, bold = false): void => { stream += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${literal(value)}) Tj ET\n`; };
   stream += '.23 .24 .51 rg 0 535 842 60 re f 1 1 1 rg\n';
   text(30, 565, 'SCHELMENZUNFT STAUFEN', 17, true);
   text(30, 546, (order.status === 'Entwurf' ? 'ENTWURF - noch nicht aufgegeben' : 'BESTELLUNG') + ' · ' + order.area, 10);
   stream += '0 0 0 rg\n';
   text(30, 515, supplier.name, 13, true); text(430, 515, 'Kundennummer: ' + (supplier.customerNumber || 'nicht hinterlegt'));
   text(30, 499, order.occasion.slice(0, 66) || 'Lieferantenbestellung');
   text(430, 499, 'Stand: ' + new Date(generatedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }));
   text(30, 482, 'Bestellweg: ' + order.method + ' · Telefon: ' + (supplier.phone || 'nicht hinterlegt'));
   text(30, 466, 'Bestellkennung: ' + order.id.slice(0, 70), 8);
   stream += '.94 .94 .97 rg 30 416 782 37 re f 0 0 0 rg\n';
   text(36, 438, 'Artikel / Bestellnummer', 9, true); text(245, 438, 'Gebinde', 9, true);
   columns.forEach((d, i) => { text(370 + i * width, 438, dateLabel(d.date), 9, true); text(370 + i * width, 424, ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][new Date((d.date || '2000-01-01') + 'T12:00Z').getUTCDay()], 8); });
   text(735, 438, 'Gesamt*', 9, true);
   const rows = order.lines.slice(li, li + rowsPerPage);
   rows.forEach((l, i) => {
    const y = 401 - i * 21;
    text(36, y, wrap(l.articleName, 37)[0], 9, true); text(36, y - 9, l.code.slice(0, 42), 7);
    text(245, y, l.packName.slice(0, 18)); text(245, y - 9, (num(l.packSize) + ' ' + l.unit).slice(0, 24), 7);
    columns.forEach((d, c) => text(370 + c * width, y, num(l.schedule![d.id] ?? null)));
    text(735, y, num(l.quantity), 9, true);
    stream += `.85 .85 .89 RG 30 ${y - 12} m 812 ${y - 12} l S\n`;
   });
   text(30, 150, '* Gesamtmenge der gesamten Bestellung, auch bei mehreren Seiten. Mengen in den angegebenen Gebinden.', 8);
   let y = 133;
   columns.forEach(d => { wrap(dateLabel(d.date) + ': ' + (d.time || 'Zeit nach Absprache') + ' · ' + (d.place || order.area), 118).forEach(t => { text(30, y, t, 8); y -= 10; }); });
   wrap(order.supplierNote || '', 118).slice(0, 3).forEach(t => { if (t) { text(30, y, t, 8); y -= 10; } });
   const total = orderTotal(order); text(30, 32, total === null ? 'Warenwert: Preise oder Mengen noch offen.' : 'Warenwert gesamt netto: ' + total.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR · ohne Pfand und Lieferkosten', 9, true);
   text(690, 32, 'Seite ' + (pages.length + 1), 8); pages.push(stream);
  }
 }
 const objects: string[] = ['', '<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 const kids: number[] = [];
 for (const content of pages) { const id = objects.length; kids.push(id); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`); objects.push(`<< /Length ${bytes(content).length} >>\nstream\n${content}endstream`); }
 objects[2] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(n => n + ' 0 R').join(' ')}] >>`;
 let pdf = '%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n'; const offsets = [0];
 for (let i = 1; i < objects.length; i++) { offsets.push(bytes(pdf).length); pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
 const xref = bytes(pdf).length;
 pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return bytes(pdf);
}
