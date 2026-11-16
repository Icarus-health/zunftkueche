/* eslint-disable @rushstack/no-new-null -- Unbekannte Vorschläge bleiben ausdrücklich leer. */
// Vorschläge rund um eine Rechnung, die nicht im Zahlenteil stehen: Lieferant, Lieferdatum, Zahlungsziel, Skonto,
// Bereich und Artikel je Position. Alles hier ist ein Vorschlag. Im Zweifel bleibt das Feld leer, statt zu raten.
import type { Area } from '../model';

const iso = (d: string, m: string, y: string): string => y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
const valid = (value: string): boolean => {
  const t = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value;
};
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const amount = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
};
const first = (text: string, patterns: RegExp[]): RegExpMatchArray | null => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match;
  }
  return null;
};

export interface BillTerms {
  deliveryDate: string;
  dueDate: string;
  skontoUntil: string;
  skontoPercent: number | null;
  skontoAmount: number | null;
}
/** Lieferdatum, Zahlungsziel und Skonto aus dem Rechnungstext. `billDate` ist das Rechnungsdatum (JJJJ-MM-TT) oder leer. */
export function billTerms(source: string, billDate: string): BillTerms {
  // Silbentrennung am Zeilenende („ohne Ab-\nzug“) zusammenziehen, Zeilenumbrüche wie Leerzeichen behandeln.
  const text = source.replace(/-[ \t]*\r?\n[ \t]*(?=[a-zäöü])/g, '').replace(/\s+/g, ' ');
  const result: BillTerms = { deliveryDate: '', dueDate: '', skontoUntil: '', skontoPercent: null, skontoAmount: null };
  const take = (m: RegExpMatchArray | null, at = 1): string => {
    if (!m) return '';
    const value = iso(m[at], m[at + 1], m[at + 2]);
    return valid(value) ? value : '';
  };
  result.deliveryDate = take(
    first(text, [
      /Liefer(?:datum|tag)[ :]*(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i,
      /Leistungsdatum[ :]*(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i,
      /Lieferungen?[ ]+vom[ ]+(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i,
      /Versanddatum[ :]*(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i,
      /Lieferschein[^.]{0,60}?[ ]vom[ ]+(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i
    ])
  );
  const skonto = first(text, [
    /bis[ ]+(?:zum[ ]+)?(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})[ ]+(?:mit[ ]+)?(\d{1,2}(?:[.,]\d{1,2})?)[ ]?%[ ]*Skonto(?:[ ]+(?:=[ ]*)?([\d.]+,\d{2}))?/i
  ]);
  if (skonto) {
    result.skontoUntil = take(skonto);
    result.skontoPercent = amount(skonto[4].replace('.', ','));
    result.skontoAmount = amount(skonto[5]);
  } else {
    const reversed = text.match(
      /(\d{1,2}(?:[.,]\d{1,2})?)[ ]?%[ ]*Skonto[ ]+(?:bei[ ]+Zahlung[ ]+)?bis[ ]+(?:zum[ ]+)?(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i
    );
    const within = text.match(
      /innerhalb[ ]+(?:von[ ]+)?(\d{1,3})[ ]+Tagen?[ ]+(?:mit[ ]+|abzüglich[ ]+|abzgl\.?[ ]+)?(\d{1,2}(?:[.,]\d{1,2})?)[ ]?%[ ]*Skonto/i
    );
    if (reversed) {
      result.skontoUntil = take(reversed, 2);
      result.skontoPercent = amount(reversed[1].replace('.', ','));
    } else if (within && billDate && valid(billDate)) {
      result.skontoUntil = addDays(billDate, Number(within[1]));
      result.skontoPercent = amount(within[2].replace('.', ','));
    }
  }
  if (!result.skontoUntil) {
    result.skontoPercent = null;
    result.skontoAmount = null;
  }
  const dated = first(text, [
    /bis[ ]+(?:zum[ ]+)?(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})[ ]+(?:ohne[ ]+Abzug|rein[ ]+netto|netto)/i,
    /innerhalb[ ]+(?:von[ ]+)?\d{1,3}[ ]+Tagen?[ ]*\((\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})\)/i,
    /(?:fällig|Fälligkeit)[ ]*(?:am|bis|:)?[ ]*(?:zum[ ]+)?(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})/i,
    /zahlbar[ ]+bis[ ]+(?:zum[ ]+)?(\d{1,2})\.[ \t]?(\d{1,2})\.[ \t]?(\d{4})(?![ ]+(?:mit[ ]+)?\d{1,2}(?:[.,]\d+)?[ ]?%[ ]*Skonto)/i
  ]);
  if (dated) result.dueDate = take(dated);
  else if (billDate && valid(billDate)) {
    const days = text.match(
      /(?:zahlbar|Zahlungsziel)[^.]{0,30}?(\d{1,3})[ ]+Tagen?(?![ ]+(?:mit[ ]+)?\d{1,2}(?:[.,]\d+)?[ ]?%)/i
    );
    if (days) result.dueDate = addDays(billDate, Number(days[1]));
    else if (/zahlbar[ ]+sofort|sofort[ ]+(?:zahlbar|fällig)|ohne[ ]+Abzug[ ]+sofort/i.test(text))
      result.dueDate = billDate;
  }
  return result;
}

/** Bereich nur aus eindeutigen Hinweisen: Dateiname oder ausdrücklich beschriftete Lieferadresse. */
export function billArea(text: string, fileName: string): Area | '' {
  const areas = (value: string): Area[] => {
    const found: Area[] = [];
    if (/zunft[ _-]?scheuer|(?:^|[^a-zäöü])scheuer/i.test(value)) found.push('Zunftscheuer');
    if (/marktplatz|brunnen/i.test(value)) found.push('Marktplatz');
    if (/k(?:ü|ue)che/i.test(value)) found.push('Küche');
    return found;
  };
  const fromName = areas(fileName);
  if (fromName.length === 1) return fromName[0];
  if (fromName.length > 1) return '';
  const labelled = [
    ...text.matchAll(
      /(?:Lieferadresse|Lieferanschrift|Lieferort|Lieferung[ \t]+an|Kostenstelle|Kommission|Betreff)[ \t]*:?[ \t]*([^\r\n]{0,80})/gi
    )
  ].flatMap(m => areas(m[1]));
  const unique = [...new Set(labelled)];
  return unique.length === 1 ? unique[0] : '';
}

const GENERIC = new Set([
  'weingut',
  'weinhaus',
  'winzer',
  'bäckerei',
  'baeckerei',
  'metzgerei',
  'getränke',
  'getraenke',
  'markt',
  'gmbh',
  'kg',
  'ohg',
  'gbr',
  'co',
  'und',
  'der',
  'die',
  'das',
  'staufen',
  'breisgau',
  'firma',
  'handel',
  'service',
  'deutschland',
  'manufaktur',
  'hof',
  'haus',
  'obst',
  'wein',
  'sekt',
  'café',
  'cafe',
  'e.k',
  'ev',
  'inh'
]);
const fold = (value: string): string =>
  value
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const nameTokens = (name: string): string[] =>
  name
    .toLocaleLowerCase('de-DE')
    .split(/[^a-zäöüß0-9]+/)
    .filter(token => token.length >= 4 && !GENERIC.has(token))
    .map(fold);

export interface SupplierHint {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  customerNumber?: string;
}
/**
 * Lieferant aus Dateiname und Briefkopf. Zeilen, die den Empfänger nennen („Herrn …“, „z. Hd. …“), zählen nicht,
 * weil dort oft ein Vereinsmitglied steht, das wie ein Lieferant heißt. Ohne klaren Vorsprung bleibt das Feld leer.
 */
export function supplierGuess(text: string, fileName: string, suppliers: SupplierHint[]): string {
  const rows = text
    .split(/\r?\n/)
    .filter(row => !/\b(?:herrn?|frau|z\.?[ \t]*hd\.?|zu[ \t]+h(?:ä|ae)nden|kunde|kontoinhaber)\b/i.test(row))
    .map(fold);
  const body = rows.join('\n');
  const digits = body.replace(/[^0-9\n]/g, '');
  const file = fold(fileName);
  const scores = suppliers
    .map(supplier => {
      const tokens = nameTokens(supplier.name);
      let score = 0;
      if (tokens.some(token => file.includes(token))) score += 3;
      const hits = rows.filter(row => tokens.some(token => row.includes(token))).length;
      score += Math.min(hits, 3);
      const domain = (supplier.email || '').split('@')[1];
      if (domain && body.includes(fold(domain))) score += 3;
      const phone = (supplier.phone || '').replace(/\D/g, '').replace(/^(?:0049|49|0)/, '');
      if (phone.length >= 6 && digits.includes(phone)) score += 3;
      return { id: supplier.id, score };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (!best || best.score < 2 || (second && best.score - second.score < 2)) return '';
  return best.id;
}

const STOP = new Set([
  'der',
  'die',
  'das',
  'und',
  'mit',
  'für',
  'fuer',
  'aus',
  'vom',
  'von',
  'stk',
  'stück',
  'stueck',
  'ca'
]);
const SYNONYMS: Record<string, string> = { doctor: 'dr', doktor: 'dr', ltr: 'l', liter: 'l', fl: 'flasche' };
/** Wörter und Mengenangaben einer Bezeichnung, vergleichbar gemacht: „0.2l“ und „0,2 l“ sind gleich. */
export function nameKey(name: string): string[] {
  const text = fold(name)
    .replace(/(\d)[.,](\d)/g, '$1,$2')
    .replace(/(\d)(ml|cl|l|kg|g|ltr)\b/g, '$1 $2')
    .replace(/\b(\d+),0\b/g, '$1');
  const tokens = text
    .split(/[^a-z0-9,]+/)
    .map(token => token.replace(/^,+|,+$/g, ''))
    .filter(token => token && !STOP.has(token) && (token.length > 1 || /\d/.test(token)))
    .map(token => SYNONYMS[token] || token)
    .filter(token => !/^(?:l|ml|cl|kg|g)$/.test(token) && !/^(?:19|20)\d{2}$/.test(token));
  return [...new Set(tokens)];
}
export interface ArticleHint {
  id: string;
  name: string;
}
/**
 * Artikel zu einer Rechnungszeile. Zuerst das, was bei diesem Lieferanten schon einmal bestätigt wurde (`learned`:
 * Zeilenname → Artikel), sonst der Artikel des Lieferanten mit den meisten gemeinsamen Wörtern, wenn er klar vorn liegt.
 */
export function articleGuess(lineName: string, candidates: ArticleHint[], learned: Map<string, string>): string | null {
  const key = nameKey(lineName);
  const known = learned.get(key.join(' '));
  if (known && candidates.some(c => c.id === known)) return known;
  if (!key.length) return null;
  const scored = candidates
    .map(candidate => {
      const other = nameKey(candidate.name);
      const shared = key.filter(token => other.includes(token));
      const words = shared.filter(token => /[a-z]{3}/.test(token)).length;
      // Anteil der Zeilenwörter, die im Artikelnamen vorkommen, und umgekehrt: beides muss tragen.
      const score = words ? (shared.length / key.length + shared.length / Math.max(other.length, 1)) / 2 : 0;
      const sizes = (tokens: string[]): string[] => tokens.filter(token => /^\d+(?:,\d+)?$/.test(token));
      const conflict =
        sizes(key).length && sizes(other).length && !sizes(key).some(size => sizes(other).includes(size));
      return { id: candidate.id, score: conflict ? 0 : score };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < 0.45 || (second && best.score - second.score < 0.12)) return null;
  return best.id;
}
