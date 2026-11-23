/* eslint-disable @rushstack/no-new-null -- Missing proposals remain explicitly unknown. */
// Nachsichtige Erkennung für Scans und unübliche Belege. Sie greift erst, wenn die strenge Erkennung nichts findet.
// Regel: ein Betrag wird nur übernommen, wenn er sich nachrechnen lässt
// (Netto × Satz = Steuer, Netto + Steuer = Brutto, Menge × Preis = Betrag). Alles andere bleibt leer.
import type { BillLine } from '../ww/model';

// Betragsmuster in den Ausdrücken unten: Komma mit Tausenderpunkten (1.192,10) oder Punkt als Dezimalzeichen (1192.10).
/** Betrag mit Komma („1.192,10“) oder mit Punkt („1192.10“, manche Kassenprogramme). */
export function amount(raw: string): number | null {
  const t = raw.trim();
  if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+\.\d{2}$/.test(t)) return Number(t);
  return null;
}
const near = (a: number, b: number, tolerance = 0.011): boolean => Math.abs(a - b) <= tolerance;
const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const round4 = (value: number): number => Math.round((value + Number.EPSILON) * 10000) / 10000;
/** Vergleich von Belegnummern ohne Trennzeichen: „2026/33“ und „2026-33“ sind dieselbe Nummer. */
export const numberKey = (value: string): string => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// Beschriftung einer Belegnummer, dahinter die Nummer in derselben oder in der nächsten Zeile.
const NUMBER_SAME_LINE =
  /(?:Rechnungsnummer|Rechnungs[- \t]*Nr\.?|Rechnung[ \t]+(?:Nr\.?|Nummer)|Rechn\.?[- \t]*Nr\.?|Belegnummer|Beleg[- \t]*Nr\.?|Gutschrift[ \t]+(?:Nr\.?|Nummer)|Gutschrifts[- \t]*Nr\.?)[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9_.\/-]*(?:[ \t]+-[ \t]+[A-Z0-9][A-Z0-9_.\/-]*)?)/gi;
const NUMBER_NEXT_LINE =
  /(?:Rechnungsnummer|Rechnungs[- \t]*Nr\.?|Rechnung[ \t]+(?:Nr\.?|Nummer)|Rechn\.?[- \t]*Nr\.?|Belegnummer|Beleg[- \t]*Nr\.?|Gutschrift[ \t]+(?:Nr\.?|Nummer)|Gutschrifts[- \t]*Nr\.?)[ \t]*[:#]?[ \t]*\r?\n[ \t|]*([A-Z0-9][A-Z0-9_.\/-]*(?:[ \t]+-[ \t]+[A-Z0-9][A-Z0-9_.\/-]*)?)/gi;
const tidy = (value: string): string => value.replace(/[ \t]*-[ \t]*/g, '-').replace(/[._\/-]+$/, '');
const plausible = (value: string): boolean =>
  value.length >= 3 && /\d{2}/.test(value) && !/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(value);

/** Belegnummern, auch wenn die Beschriftung mitten in der Zeile steht, die Nummer in der nächsten Zeile folgt oder in der Überschrift steht. */
export function looseNumbers(text: string): string[] {
  const found: string[] = [];
  const add = (raw: string): void => {
    const value = tidy(raw);
    if (plausible(value) && !found.includes(value)) found.push(value);
  };
  for (const m of text.matchAll(NUMBER_SAME_LINE)) add(m[1]);
  for (const m of text.matchAll(NUMBER_NEXT_LINE)) add(m[1]);
  // Überschrift wie „Rechnung 2026/33“ oder „RECHNUNG Nr. RE-1234“.
  for (const m of text.matchAll(
    /^[ \t|]*(?:Rechnung|Gutschrift)[ \t]+(?:Nr\.?[ \t]*)?([A-Z]{0,4}-?\d[A-Z0-9_.\/-]{2,})[ \t]*$/gim
  ))
    add(m[1]);
  return found;
}

/** Nummer aus dem Dateinamen, wenn er sie ausdrücklich nennt („Braun_RG_455925_…“, „Rechnung RE-2026…“). */
export function fileNameNumber(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, '');
  const m = base.match(/(?:^|[_ .-])(?:RG|RE|Rechnung|Rechn|Beleg|Nr)[_ .-]*([A-Z]{0,3}-?\d[\d\/-]{3,})/i);
  if (!m) return '';
  const value = m[1].replace(/[\/-]+$/, '');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(value) ? '' : value;
}

/** Belegdaten als JJJJ-MM-TT, auch mit zweistelligem Jahr und mit der Beschriftung mitten in der Zeile. */
export function looseDates(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(
    /(?<![A-Za-zÄÖÜäöüß-])(?:Rechnungsdatum|Belegdatum|Datum)[ \t]*[:.]?[ \t]*(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/gi
  )) {
    const day = Number(m[1]),
      month = Number(m[2]),
      year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2099)
      found.add(year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
  }
  return [...found];
}

export interface Totals {
  net: number;
  tax: number;
  gross: number;
}

/**
 * Steuertabelle ohne lesbare Kopfzeile: „7% 1.365,58 95,59 1.461,17“ je Satz und eine Summenzeile darunter.
 * Gilt nur, wenn jede Zeile für sich stimmt und die Summenzeile die Sätze genau zusammenzählt.
 */
export function rateRowTotals(text: string): (Totals & { rates: Map<number, Totals> }) | undefined {
  const rates = new Map<number, Totals>();
  for (const m of text.matchAll(
    /^[ \t|]*(\d{1,2})[ \t]*%[ \t]+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]+(\S+)[ \t]*(?:EUR|€)?[ \t|]*$/gim
  )) {
    const rate = Number(m[1]),
      net = amount(m[2]),
      tax = amount(m[3]);
    if (net === null || tax === null || !near((net * rate) / 100, tax, 0.021)) continue;
    // Brutto der Zeile verlesen: Netto + Steuer. Die Summenzeile darunter muss es trotzdem bestätigen.
    const gross = amount(m[4]) ?? cents(net + tax);
    if (!near(net + tax, gross)) continue;
    const known = rates.get(rate);
    if (known && (!near(known.net, net) || !near(known.gross, gross))) return undefined;
    rates.set(rate, { net, tax, gross });
  }
  if (!rates.size) return undefined;
  const sum = [...rates.values()].reduce(
    (a, b) => ({ net: a.net + b.net, tax: a.tax + b.tax, gross: a.gross + b.gross }),
    { net: 0, tax: 0, gross: 0 }
  );
  const confirmed = [
    ...text.matchAll(
      /^[ \t|]*(?:Gesamtbetrag|Gesamt|Total|Summe)[ \t]+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]+(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]*(?:EUR|€)?[ \t|]*$/gim
    )
  ].some(m => {
    const [net, tax, gross] = [m[1], m[2], m[3]].map(amount);
    return (
      net !== null &&
      tax !== null &&
      gross !== null &&
      near(net, sum.net) &&
      near(tax, sum.tax) &&
      near(gross, sum.gross)
    );
  });
  return confirmed ? { net: cents(sum.net), tax: cents(sum.tax), gross: cents(sum.gross), rates } : undefined;
}

/**
 * Getränkerechnung, deren Summenzeilen die Texterkennung zerrissen hat: es bleibt „… 121,22 Gesamt : EUR 759,22“.
 * Je Zeile ist das Steuer und Teilsumme. Gilt nur, wenn jede Zeile zu 19 % oder 7 % passt und,
 * falls lesbar, der Rechnungsbetrag dieselbe Summe nennt. `confirmed` sagt, ob der Rechnungsbetrag lesbar war.
 */
export function beveragePairTotals(text: string): (Totals & { confirmed: boolean }) | undefined {
  const rows = text.split(/\r?\n/).filter(row => /Gesamt[ \t]*:[ \t]*EUR/i.test(row));
  if (!rows.length) return undefined;
  let net = 0,
    tax = 0,
    gross = 0;
  for (const row of rows) {
    const m = row.match(/(-?[\d.]+,\d{2})[ \t]+Gesamt[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]*$/i);
    const partTax = m ? amount(m[1]) : null,
      part = m ? amount(m[2]) : null;
    if (partTax === null || part === null) return undefined;
    const partNet = cents(part - partTax);
    if (![19, 7].some(rate => near((partNet * rate) / 100, partTax))) return undefined;
    net += partNet;
    tax += partTax;
    gross += part;
  }
  // Mit Pfandteil auf dem Beleg müssen es mindestens zwei Teilsummen sein (Ware und Pfand).
  if (/^[ \t]*Pfandwert\b/im.test(text) && rows.length < 2) return undefined;
  // Rechnungsbetrag, soweit lesbar, muss dieselbe Summe nennen. Die letzte Ziffer darf unscharf sein (] | l I).
  const declared = text.match(/Rechnungsbetrag[ \t]*:?[ \t]*EUR[ \t]+(\S+)[ \t]*$/im);
  let confirmed = false;
  if (declared) {
    const stated = amount(declared[1]);
    if (stated !== null) {
      if (!near(stated, gross)) return undefined;
      confirmed = true;
    } else if (/^-?[\d.]+,\d[\]|lI]$/.test(declared[1])) {
      if (declared[1].slice(0, -1).replace(/\./g, '') !== cents(gross).toFixed(2).replace('.', ',').slice(0, -1))
        return undefined;
      confirmed = true;
    }
  }
  return { net: cents(net), tax: cents(tax), gross: cents(gross), confirmed };
}

/**
 * Summenblock ohne Beschriftung der Beträge: Netto in der Zeile über „Mehrwertsteuer 19% …“, Brutto in der Zeile darunter.
 * Gilt nur, wenn genau ein solcher Block nachrechenbar ist.
 */
export function taxLineTotals(text: string): Totals | undefined {
  const rows = text.split(/\r?\n/);
  const last = (row: string): number | null => {
    const m = row.match(/(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]*(?:EUR|€)?[ \t]*$/);
    return m ? amount(m[1]) : null;
  };
  const neighbour = (from: number, step: number): number | null => {
    for (let i = from + step, seen = 0; i >= 0 && i < rows.length && seen < 3; i += step) {
      if (!rows[i].trim()) continue;
      seen++;
      return last(rows[i]);
    }
    return null;
  };
  const found: Totals[] = [];
  rows.forEach((row, i) => {
    const m = row.match(
      /(?:Mehrwertsteuer|MwSt\.?|USt\.?|Umsatzsteuer)[ \t]*(\d{1,2})(?:[.,]\d{1,2})?[ \t]*%[ \t]*:?[ \t]*(?:EUR|€)?[ \t]*(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})[ \t]*(?:EUR|€)?[ \t]*$/i
    );
    if (!m) return;
    const rate = Number(m[1]),
      tax = amount(m[2]),
      net = neighbour(i, -1),
      gross = neighbour(i, 1);
    if (net === null || tax === null || gross === null) return;
    if (near((net * rate) / 100, tax) && near(net + tax, gross)) found.push({ net, tax, gross });
  });
  return found.length === 1 ? found[0] : undefined;
}

/**
 * Summenzeile einer Tabelle mit Netto und Steuer nebeneinander („Summe € 2.876,86 € | 201,38 €“, Brutto nicht lesbar).
 * Gilt nur, wenn der zweite Betrag genau 7 % oder 19 % des ersten ist. Steht ein dritter Betrag da, muss er die Summe sein.
 */
export function sumRowTotals(text: string): Totals | undefined {
  const found: Totals[] = [];
  for (const row of text.split(/\r?\n/)) {
    if (!/^[ \t|]*(?:Summe|Gesamt|Total)\b/i.test(row)) continue;
    const values = [...row.matchAll(/(?<![\d.,])(-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|-?\d+\.\d{2})(?![\d,])/g)].map(m =>
      amount(m[1])
    );
    if (values.length < 2 || values.length > 3 || values.some(v => v === null)) continue;
    const [net, tax, gross] = values as number[];
    if (net <= 0 || ![7, 19].some(rate => near((net * rate) / 100, tax))) continue;
    if (gross !== undefined && !near(net + tax, gross)) continue;
    found.push({ net, tax, gross: cents(net + tax) });
  }
  return found.length === 1 ? found[0] : undefined;
}

/** Zahl aus einer Tabellenzelle; ohne Komma auch als Hundertstel („625“ für 6,25), weil Scans Kommas verlieren. */
function readings(token: string, allowWhole: boolean): number[] {
  const t = token.replace(/[*"”“»°'’|]+$/, '');
  const exact = amount(t);
  if (exact !== null) return [exact];
  if (/^-?\d+,\d{1,3}$/.test(t)) return [Number(t.replace(',', '.'))];
  if (!/^-?\d+$/.test(t)) return [];
  const whole = Number(t);
  return [...(allowWhole ? [whole] : []), ...(t.replace('-', '').length >= 3 ? [whole / 100] : [])];
}
const junk = (token: string): boolean => /^[^A-Za-z0-9]+$/.test(token);

export interface ScanLines {
  lines: BillLine[];
  /** Summe der Warenzeilen trifft die Zwischensumme auf dem Beleg. */
  goodsComplete: boolean;
  /** Zeilen im Warenteil, die sich nicht nachrechnen ließen. */
  unread: number;
}

/**
 * Positionen einer gescannten Getränkerechnung: Artikelnummer, Bezeichnung, Anzahl, Einheit, Inhalt, Menge, Preis, Rabatt, Betrag.
 * Eine Zeile zählt nur, wenn Anzahl × Preis × (1 − Rabatt) den Betrag ergibt. Pfandzeilen: Ausgabe − Rückgabe mal Preis.
 */
export function beverageScanLines(text: string, rate: number | null): ScanLines {
  const lines: BillLine[] = [];
  let part: 'none' | 'goods' | 'deposit' = 'none';
  let unread = 0,
    goodsSum = 0;
  let previous: BillLine | undefined;
  const goodsTotals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const row = raw.trim();
    if (/^Art-?[ \t]*Nr\.?[ \t]+Bezeichnun/i.test(row)) {
      part = 'goods';
      previous = undefined;
      continue;
    }
    const subtotal = row.match(/^Zwischensumme[ \t]+Warenwert[ \t]+(-?[\d.]+,\d{2})/i);
    if (subtotal) {
      goodsTotals.push(amount(subtotal[1])!);
      part = 'none';
      continue;
    }
    if (/^Pfandwert\b/i.test(row)) {
      part = 'deposit';
      previous = undefined;
      continue;
    }
    if (
      /^(?:Seite[ \t]+\d+$|Ware\b|Pfand\W|Zahlung\b|Rechnungsbetrag\b)/i.test(row) ||
      /Gesamt[ \t]*:[ \t]*EUR/i.test(row)
    )
      part = 'none';
    if (part === 'none' || !row) continue;
    const tokens = row.split(/[ \t]+/);
    while (tokens.length && junk(tokens[tokens.length - 1])) tokens.pop();
    if (part === 'goods') {
      // Fortsetzung der Bezeichnung in der nächsten Zeile: nur die Gebindeangabe („20x0,33l“).
      if (previous && tokens.length === 1 && /^\d+x\d/i.test(tokens[0])) {
        previous.name = (previous.name + ' ' + tokens[0]).slice(0, 240);
        continue;
      }
      if (!/^\d{2,5}$/.test(tokens[0] || '')) continue;
      let u = -1;
      for (let i = tokens.length - 3; i >= 2; i--)
        if (/^(?:KA|FL|ST|FA|KI|PA|DS|KT|FS)$/i.test(tokens[i])) {
          u = i;
          break;
        }
      const after = u < 0 ? [] : tokens.slice(u + 1);
      const percent = after.length >= 3 ? after[after.length - 2].match(/^(\d{1,2})%$/) : null;
      const discount = percent ? Number(percent[1]) : 0;
      const priceToken = after[after.length - (percent ? 3 : 2)],
        totalToken = after[after.length - 1];
      let hit: { quantity: number; price: number; total: number } | undefined;
      let hits = 0;
      if (u >= 0 && priceToken && totalToken)
        for (const quantity of readings(tokens[u - 1], true))
          for (const price of readings(priceToken, false))
            for (const total of readings(totalToken, false))
              if (quantity !== 0 && near(quantity * price * (1 - discount / 100), total)) {
                if (!hit || hit.quantity !== quantity || hit.price !== price || hit.total !== total) hits++;
                hit = { quantity, price, total };
              }
      if (!hit || hits !== 1) {
        unread++;
        previous = undefined;
        continue;
      }
      const name = tokens
        .slice(1, u - 1)
        .join(' ')
        .replace(/^[_‚,.' ]+/, '')
        .slice(0, 240);
      if (!name) {
        unread++;
        continue;
      }
      previous = {
        id: 'beverage-' + (lines.length + 1),
        articleId: null,
        name,
        quantity: hit.quantity,
        unit: tokens[u].toUpperCase() === 'KA' ? 'Kasten' : tokens[u].toUpperCase() === 'FL' ? 'Flasche' : tokens[u],
        // Zurückgegebene Ware steht mit negativer Anzahl auf der Rechnung.
        ...(hit.quantity < 0 ? { role: 'return' as const } : {}),
        unitNet: round4(hit.total / hit.quantity),
        totalNet: hit.total,
        taxRate: rate
      };
      goodsSum += hit.total;
      lines.push(previous);
      continue;
    }
    // Pfand: Bezeichnung, Ausgabe, Rückgabe, Einzelpreis, Betrag.
    if (tokens.length < 4) continue;
    const price = amount(tokens[tokens.length - 2]),
      total = amount(tokens[tokens.length - 1].replace(/[*"”“»°'’]+$/, ''));
    if (price === null || total === null || !price) continue;
    for (let k = 1; k < tokens.length - 2; k++) {
      if (!/^-?\d+$/.test(tokens[k])) continue;
      const out = Number(tokens[k]),
        back = /^\d+$/.test(tokens[k + 1] || '') && k + 1 < tokens.length - 2 ? Number(tokens[k + 1]) : 0;
      // Vorzeichen müssen passen: Rückgaben stehen mit Minus im Betrag.
      const quantity = [out - back, out].find(q => q !== 0 && near(q * price, total));
      if (quantity === undefined) continue;
      lines.push({
        id: 'beverage-' + (lines.length + 1),
        articleId: null,
        name: ('Pfand ' + tokens.slice(0, k).join(' ')).slice(0, 240),
        quantity,
        unit: 'Stück',
        role: 'deposit',
        unitNet: price,
        totalNet: cents(quantity * price),
        taxRate: rate
      });
      break;
    }
  }
  const declared = goodsTotals.length ? goodsTotals[goodsTotals.length - 1] : null;
  return { lines, goodsComplete: declared !== null && near(goodsSum, declared, 0.021), unread };
}

/**
 * Positionen einer gescannten Sammelrechnung mit Lieferscheinen (Artikelnummer, Bezeichnung, Menge, Einheit, Einzelpreis, Preis, Preis nach Rabatt, Steuersatz).
 * Die Preise sind brutto. Ein Lieferschein zählt nur, wenn seine Zeilen die „Summe Lieferschein“ ergeben; dann werden sie
 * mit dem Steuersatz der Zeile in Netto umgerechnet. Scans verlieren Kommas, deshalb zählt zuerst Menge × Einzelpreis.
 */
export function receiptScanLines(text: string, rates: Map<number, Totals>): ScanLines {
  interface Row {
    name: string;
    quantity: number;
    unit: string;
    gross: number;
    rate: number;
  }
  const slips: Row[][] = [];
  let current: Row[] | undefined;
  let unread = 0,
    complete = true;
  const close = (declared: number | null): void => {
    if (!current) return;
    const sum = current.reduce((a, b) => a + b.gross, 0);
    if (declared === null || !near(sum, declared, 0.021)) complete = false;
    slips.push(current);
    current = undefined;
  };
  for (const raw of text.split(/\r?\n/)) {
    const row = raw.replace(/^[ \t|]+/, '').trim();
    if (/^Artikel[ \t]+Nr\.?[ \t]+Beschreibung[ \t]+Menge/i.test(row)) {
      close(null);
      current = [];
      continue;
    }
    const sum = row.match(/^Summe[ \t]+Lieferschein[ \t]+(-?[\d.]+,\d{2})/i);
    if (sum) {
      close(amount(sum[1]));
      continue;
    }
    if (!current) continue;
    const m = row.match(
      /^\d{12,14}[ \t]+(.+?)[ \t]+(-?\d+(?:,\d+)?)[ \t]+([A-Za-zÄÖÜäöü.]{1,6})[ \t]+(\S+)[ \t]+(.+)$/
    );
    if (!m) {
      if (/^\d{12,14}\b/.test(row)) unread++;
      continue;
    }
    const quantity = Number(m[2].replace(',', '.'));
    const rateMatch = m[5].match(/(19|7|0)[ \t:.,]*%[ \t]*$/);
    const prices = readings(m[4], false);
    if (!quantity || !rateMatch || !prices.length) {
      unread++;
      continue;
    }
    // „Preis nach Rabatt“ zählt, wenn lesbar und nicht höher als Menge × Einzelpreis; sonst Menge × Einzelpreis.
    const tail = m[5]
      .slice(0, rateMatch.index)
      .trim()
      .split(/[ \t]+/);
    const after = tail.length ? amount(tail[tail.length - 1]) : null;
    const computed = cents(quantity * prices[0]);
    const gross = after !== null && Math.abs(after) < Math.abs(computed) - 0.021 && tail.length >= 2 ? after : computed;
    current.push({ name: m[1].trim().slice(0, 240), quantity, unit: m[3], gross, rate: Number(rateMatch[1]) });
  }
  close(null);
  const rows = slips.flat();
  // Kontrolle je Steuersatz gegen die Steuertabelle des Belegs.
  const perRate = new Map<number, number>();
  for (const row of rows) perRate.set(row.rate, (perRate.get(row.rate) || 0) + row.gross);
  const verified =
    complete &&
    !unread &&
    rows.length > 0 &&
    [...perRate].every(([rate, sum]) => rates.has(rate) && near(sum, rates.get(rate)!.gross, 0.021)) &&
    perRate.size === rates.size;
  const lines: BillLine[] = rows.map((row, i) => {
    const net = cents(row.gross / (1 + row.rate / 100));
    return {
      id: 'receipt-' + (i + 1),
      articleId: null,
      name: row.name,
      quantity: row.quantity,
      unit: row.unit,
      role: /\b(?:pfand|leergut)\b/i.test(row.name) ? 'deposit' : row.quantity < 0 ? 'return' : 'goods',
      unitNet: verified ? round4(net / row.quantity) : null,
      totalNet: verified ? net : null,
      taxRate: row.rate
    };
  });
  if (verified)
    // Rundung je Steuersatz an der größten Zeile ausgleichen, damit die Nettosumme die Steuertabelle trifft.
    for (const [rate, totals] of rates) {
      const own = lines.filter(l => l.taxRate === rate);
      const difference = cents(totals.net - own.reduce((a, l) => a + (l.totalNet || 0), 0));
      if (!difference || Math.abs(difference) > 0.01 * own.length + 0.001) continue;
      const largest = own.reduce((a, b) => ((b.totalNet || 0) > (a.totalNet || 0) ? b : a));
      largest.totalNet = cents((largest.totalNet || 0) + difference);
    }
  return { lines, goodsComplete: verified, unread };
}
