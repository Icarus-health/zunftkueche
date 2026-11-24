// Prüfstand: Urteil über eine gelesene Meldung oder einen gelesenen Beleg. Reine Funktionen, ohne Netz und ohne Seite.
// Die entscheidende Zahl ist „falsch ohne Hinweis“: ein falscher oder fehlender Eintrag, den die App nicht markiert hätte.
import type { IntakeContext, IntakeLine } from '../../src/kitchen/ai/intake';
import type { BillRead } from '../../src/kitchen/ai/bill-reader';
import { printedNumber, verified } from '../../src/kitchen/ai/bill-reader.ts';

export interface ExpectedLine {
  kind: 'count' | 'reorder';
  /** Leer bei absichtlich mehrdeutigen Meldungen: dann muss die App nachfragen. */
  articleId: string;
  /** Bestandsmeldung: Menge in der Grundeinheit. */
  total?: number;
  reorder?: boolean;
  /** Nachbestellung: Anzahl Gebinde, Lieferant, Liefertag. */
  packs?: number;
  supplierId?: string;
  day?: string;
  /** Die Zeile ist nur mit Nachfrage richtig (zum Beispiel zwei mögliche Lieferanten oder keine Einheit genannt). */
  ask?: boolean;
}
export interface DictationCase {
  id: string;
  text: string;
  expect: ExpectedLine[];
  note?: string;
}
export type Verdict = 'richtig' | 'richtig mit Rückfrage' | 'abgefangen' | 'falsch ohne Hinweis';
export interface Judgement {
  verdict: Verdict;
  /** Je Abweichung ein Satz. Leer bei „richtig“. */
  reasons: string[];
}

const near = (a: number | undefined, b: number | undefined): boolean =>
  a !== undefined && b !== undefined && Math.abs(a - b) < 0.001;

/** Was aus einer Kartenzeile würde, wenn jemand sie ungeprüft speichert. */
export function lineValue(
  line: IntakeLine,
  context: IntakeContext
): { total?: number; packs?: number; supplierId: string } {
  const pack = context.articles.find(a => a.id === line.articleId)?.packs.find(p => p.offerId === line.offerId);
  if (line.kind === 'reorder') return { packs: line.packs, supplierId: pack?.supplierId || '' };
  if (line.packs === undefined && line.loose === undefined) return { supplierId: '' };
  return { total: (pack ? (line.packs || 0) * pack.packSize : 0) + (line.loose || 0), supplierId: '' };
}

export function judgeDictation(test: DictationCase, lines: IntakeLine[], context: IntakeContext): Judgement {
  const reasons: string[] = [];
  let silent = false,
    flagged = false,
    wrong = false;
  const rest = [...lines];
  const name = (id: string): string => context.articles.find(a => a.id === id)?.name || id || 'ohne Artikel';
  const problem = (text: string, marked: boolean): void => {
    wrong = true;
    reasons.push(text + (marked ? ' (markiert)' : ' (NICHT markiert)'));
    if (!marked) silent = true;
  };
  for (const want of test.expect) {
    let index = want.articleId ? rest.findIndex(l => l.kind === want.kind && l.articleId === want.articleId) : -1;
    if (index < 0) index = rest.findIndex(l => l.kind === want.kind && !l.articleId);
    if (index < 0 && !want.articleId) index = rest.findIndex(l => l.kind === want.kind && l.flags.length > 0);
    if (index < 0) {
      // Vielleicht einem anderen Artikel zugeordnet: nur schlimm, wenn das nicht markiert ist.
      const other = rest.findIndex(l => l.kind === want.kind);
      if (other >= 0) {
        const line = rest.splice(other, 1)[0];
        problem('Erwartet ' + name(want.articleId) + ', vorgeschlagen ' + name(line.articleId), line.flags.length > 0);
      } else problem('Eintrag fehlt: ' + name(want.articleId), false);
      continue;
    }
    const line = rest.splice(index, 1)[0];
    const marked = line.flags.length > 0;
    if (marked) flagged = true;
    if (!want.articleId) {
      // Absichtlich mehrdeutig: richtig ist nur die Nachfrage.
      if (!marked) problem('Mehrdeutige Meldung ohne Nachfrage übernommen als ' + name(line.articleId), false);
      continue;
    }
    if (!line.articleId) {
      problem('Artikel nicht zugeordnet: ' + name(want.articleId), true);
      continue;
    }
    if (want.ask && !marked) problem(name(want.articleId) + ': ohne Nachfrage übernommen', false);
    const got = lineValue(line, context);
    if (want.kind === 'count') {
      if (want.total !== undefined && !near(got.total, want.total))
        problem(name(want.articleId) + ': Menge ' + got.total + ' statt ' + want.total, marked);
      if (want.reorder !== undefined && want.reorder !== line.reorder)
        problem(name(want.articleId) + ': Nachbestellen ' + (line.reorder ? 'vorgemerkt' : 'nicht vorgemerkt'), marked);
    } else {
      if (want.packs !== undefined && !near(got.packs, want.packs))
        problem(name(want.articleId) + ': ' + got.packs + ' Gebinde statt ' + want.packs, marked);
      if (want.supplierId !== undefined && want.supplierId !== got.supplierId)
        problem(name(want.articleId) + ': anderer Lieferant', marked);
      if (want.day !== undefined && want.day !== line.day)
        problem(name(want.articleId) + ': Liefertag „' + line.day + '“ statt „' + want.day + '“', marked);
    }
  }
  for (const extra of rest) problem('Zusätzlicher Eintrag: ' + name(extra.articleId), extra.flags.length > 0);
  return {
    verdict: silent ? 'falsch ohne Hinweis' : wrong ? 'abgefangen' : flagged ? 'richtig mit Rückfrage' : 'richtig',
    reasons
  };
}

/** Sollwerte eines Belegs: Nummer („*“ = egal), Datum, Netto, Steuer, Brutto. Nicht bekannte Beträge sind null. */
export type ExpectedBill = [string, string, number | null, number | null, number | null];

export function judgeBill(want: ExpectedBill, read: BillRead): Judgement {
  const reasons: string[] = [];
  const [number, date, net, tax, gross] = want;
  const clean = (value: string): string => value.replace(/\s/g, '').toLowerCase();
  if (number !== '*' && clean(read.reading.number) !== clean(number))
    reasons.push('Nummer „' + read.reading.number + '“ statt „' + number + '“');
  if (read.reading.date !== date) reasons.push('Datum „' + read.reading.date + '“ statt „' + date + '“');
  const amount = (label: string, printed: string, expected: number | null): void => {
    if (expected === null) return;
    const value = printedNumber(printed);
    if (value === null || Math.abs(value - expected) > 0.011)
      reasons.push(label + ' „' + printed + '“ statt ' + expected);
  };
  amount('Netto', read.reading.net, net);
  amount('Steuer', read.reading.tax, tax);
  amount('Brutto', read.reading.gross, gross);
  const confirmed = verified(read);
  if (!reasons.length) return { verdict: confirmed ? 'richtig' : 'richtig mit Rückfrage', reasons };
  // Rechnet der Beleg nicht auf, hätte die App ihn ohnehin zur Prüfung vorgelegt.
  return { verdict: confirmed ? 'falsch ohne Hinweis' : 'abgefangen', reasons };
}
