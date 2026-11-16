// Vorschläge beim Prüfen einer Rechnung, die den Datenbestand brauchen: Artikel je Zeile und Lieferant.
import type { Workspace } from '../model';
import type { Bill, BillLine } from './model';
import { documents } from './model.ts';
import { articleGuess, nameKey, supplierGuess } from '../imports/bill-hints.ts';

/** Was bei diesem Lieferanten schon einmal bestätigt wurde: Zeilenname → Artikel. Die jüngste Rechnung gewinnt. */
export function learnedArticles(s: Workspace, supplierId: string): Map<string, string> {
  const learned = new Map<string, string>();
  const bills = documents(s.ww, 'bill')
    .filter(b => b.confirmed && b.supplierId === supplierId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
  for (const bill of bills)
    for (const line of bill.lines) if (line.articleId) learned.set(nameKey(line.name).join(' '), line.articleId);
  return learned;
}
/** Zeilen ohne Artikel bekommen einen Vorschlag, wenn er eindeutig ist. Bereits zugeordnete Zeilen bleiben unberührt. */
export function withArticles(lines: BillLine[], s: Workspace, supplierId: string): BillLine[] {
  if (!supplierId) return lines;
  const learned = learnedArticles(s, supplierId);
  const offered = new Set(
    s.offers.filter(o => o.value.active && o.value.supplierId === supplierId).map(o => o.value.articleId)
  );
  const active = s.articles.filter(a => a.value.active).map(a => ({ id: a.value.id, name: a.value.name }));
  const candidates = active.filter(a => offered.has(a.id));
  return lines.map(line => {
    if (line.articleId || (line.role && line.role !== 'goods' && line.role !== 'return')) return line;
    const known = learned.get(nameKey(line.name).join(' '));
    if (known && active.some(a => a.id === known)) return { ...line, articleId: known };
    return { ...line, articleId: articleGuess(line.name, candidates, learned) };
  });
}
export function guessSupplier(text: string, fileName: string, s: Workspace): string {
  return supplierGuess(
    text,
    fileName,
    s.suppliers
      .filter(r => r.value.active)
      .map(r => ({ id: r.value.id, name: r.value.name, phone: r.value.phone, email: r.value.email }))
  );
}
/** Kurzer Satz für die Rechnungsliste: Zahlungsziel und Skonto, wenn bekannt. */
export function paymentNote(b: Bill): string {
  const day = (value: string): string => value.split('-').reverse().join('.');
  const parts: string[] = [];
  if (b.dueDate) parts.push('zahlbar bis ' + day(b.dueDate));
  if (b.skontoUntil)
    parts.push(
      'Skonto ' +
        (b.skontoAmount ? b.skontoAmount.toFixed(2).replace('.', ',') + ' € ' : '') +
        'bis ' +
        day(b.skontoUntil)
    );
  return parts.join(' · ');
}
