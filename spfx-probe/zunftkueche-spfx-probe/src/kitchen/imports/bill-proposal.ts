/* eslint-disable @rushstack/no-new-null -- Missing proposals remain explicitly unknown. */
import type { BillLine } from '../ww/model';
import { importedNumber } from './preview.ts';
export interface BillProposal {
  billType?: 'credit';
  needsSeparateFiles?: true;
  scanNumberConflict?: true;
  costAreas?: string[];
  number: string;
  date: string;
  net: number | null;
  tax: number | null;
  gross: number | null;
  lines: BillLine[];
}
const parse = (raw: string): number | null => {
  try {
    return raw ? importedNumber({ text: raw }, ',', true) : null;
  } catch {
    return null;
  }
};
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 0.021;
const cents = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const round4 = (value: number): number => Math.round((value + Number.EPSILON) * 10000) / 10000;
/** Ein einziger Steuersatz, wenn Netto und Brutto dazu passen (7 %, 19 % oder steuerfrei). */
function singleRate(net: number | null, gross: number | null): number | null {
  if (net === null || gross === null || !net) return null;
  const rate = [19, 7, 0].find(r => Math.abs(net * (1 + r / 100) - gross) <= 0.021);
  return rate === undefined ? null : rate;
}
interface GrossRow {
  line: BillLine;
  unit: number;
  total: number;
}
/**
 * Bruttozeilen in Netto umrechnen. Nur wenn die Zeilensumme (abzüglich eines Prozentrabatts) zum Bruttobetrag der
 * Rechnung passt, ein einziger Steuersatz gilt und die Nettosumme der Zeilen danach die Nettosumme der Rechnung trifft.
 * Der Rabatt steckt dann in den Zeilenpreisen: es sind die Preise, die tatsächlich bezahlt wurden.
 */
function netFromGross(rows: GrossRow[], net: number | null, gross: number | null, discountPercent = 0): BillLine[] {
  const plain = rows.map(row => row.line);
  const rate = singleRate(net, gross);
  if (!rows.length || net === null || gross === null || rate === null) return plain;
  const sum = rows.reduce((total, row) => total + row.total, 0);
  if (!close(sum * (1 - discountPercent / 100), gross)) return plain;
  const factor = (1 - discountPercent / 100) / (1 + rate / 100);
  const priced = rows.map(row => ({
    ...row.line,
    unitNet: round4(row.unit * factor),
    totalNet: cents(row.total * factor),
    taxRate: rate
  }));
  // Rundung: höchstens ein Cent je Zeile, ausgeglichen an der größten Zeile.
  const difference = cents(net - priced.reduce((total, line) => total + line.totalNet, 0));
  if (Math.abs(difference) > 0.01 * priced.length + 0.001) return plain;
  if (difference) {
    const largest = priced.reduce((a, b) => (b.totalNet > a.totalNet ? b : a));
    largest.totalNet = cents(largest.totalNet + difference);
  }
  if (
    priced.some(line => line.quantity !== null && Math.abs(cents(line.quantity * line.unitNet) - line.totalNet) > 0.02)
  )
    return plain;
  return priced;
}
const documentHeaders =
  /^[ \t]*(Rechnungsnummer|Rechnungs[- \t]*Nr\.?|Rechnung[ \t]+(?:Nr\.?|Nummer)|Gutschrift[ \t]+(?:Nr\.?|Nummer)|Belegnummer)[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9_.\/-]*(?:[ \t]+-[ \t]+[A-Z0-9][A-Z0-9_.\/-]*)*)(?:[ \t]+Datum[ \t]*:?[ \t]*(\d{1,2}\.\d{1,2}\.\d{4}))?[ \t]*(?:(?:Seite|Technical[ \t]+ID)[ \t]*:[^\r\n]*)?$/gim;
const documentNumber = (value: string): string => value.replace(/[ \t]*-[ \t]*/g, '-');

function scannedTaxTotals(text: string): Pick<BillProposal, 'net' | 'tax' | 'gross'> | undefined {
  const tables = text.split(/^[ \t|]*UST-Satz[ \t]+Netto-Entgelt[ \t]+UST-Betrag[ \t]+Brutto-Entgelt[ \t]*$/im);
  if (tables.length === 1) return undefined;
  const unknown = { net: null, tax: null, gross: null };
  if (tables.length !== 2) return unknown;
  const rows = tables[1].trimStart().split(/\r?\n/);
  const rates: number[] = [];
  let sumNet = 0,
    sumTax = 0,
    sumGross = 0;
  for (const row of rows) {
    if (!row.trim()) continue;
    const match = row.match(
      /^[ \t]*(\d{1,3}(?:[,.]\d{1,2})?[ \t]*%|Gesamtbetrag)[ \t]+(-?[\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]*(?:EUR)?[ \t]*$/i
    );
    if (!match) return unknown;
    const [net, tax, gross] = match.slice(2).map(parse);
    if (net === null || tax === null || gross === null || !close(net + tax, gross)) return unknown;
    if (/^Gesamtbetrag$/i.test(match[1])) {
      if (rates.length)
        return close(sumNet, net) && close(sumTax, tax) && close(sumGross, gross) ? { net, tax, gross } : unknown;
      // Steuerzeilen nicht erkannt: nur übernehmen, wenn eine zweite Stelle des Belegs denselben Betrag nennt.
      return confirmedElsewhere(text, gross) ? { net, tax, gross } : unknown;
    }
    const rate = Number(match[1].replace('%', '').replace(',', '.'));
    if (rate > 100 || rates.includes(rate) || !close((net * rate) / 100, tax)) return unknown;
    rates.push(rate);
    sumNet += net;
    sumTax += tax;
    sumGross += gross;
  }
  return unknown;
}
function confirmedElsewhere(text: string, gross: number): boolean {
  return [
    ...text.matchAll(
      /^[ \t]*(?:Summe[ \t]+aller[ \t]+bezogenen[ \t]+Waren[ \t]+und[ \t]+Leistungen|Gutschrift|Offener[ \t]+Zahlbetrag)[ \t]+(-?[\d.]+,\d{2})[ \t]*(?:EUR)?[ \t]*$/gim
    )
  ].some(m => {
    const amount = parse(m[1]);
    return amount !== null && close(Math.abs(amount), Math.abs(gross));
  });
}
function hasScannedCredit(text: string, gross: number | null | undefined): boolean {
  if (gross === null || gross === undefined || gross >= 0) return false;
  const amounts = new Set(
    [...text.matchAll(/^[ \t]*Gutschrift[ \t]+([\d.]+,\d{2})[ \t]+EUR[ \t]*$/gim)].map(match => parse(match[1]))
  );
  const amount = [...amounts][0];
  return amounts.size === 1 && amount !== null && close(amount, -gross);
}

function beverageTotals(text: string, usedOcr = false): Pick<BillProposal, 'net' | 'tax' | 'gross'> | undefined {
  const groups = text.split(/\r?\n/).filter(row => /^[ \t]*(?:Ware|Pfand)[ \t]*[*“”"'][ \t]*\d/i.test(row));
  if (!groups.length) return undefined;
  const unknown = { net: null, tax: null, gross: null };
  const totals = [...text.matchAll(/^[ \t]*Rechnungsbetrag[ \t]*:?[ \t]+EUR[ \t]+([^\r\n]+)$/gim)];
  const raw = totals.length === 1 ? totals[0][1].trim() : '';
  let gross = /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(raw) ? parse(raw) : null;
  // Texterkennung liest die letzte Ziffer manchmal als ] | l I. Dann zählt nur ein Betrag, der zu den Teilsummen passt.
  const blurred =
    usedOcr && gross === null && /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d[\]|lI]$/.test(raw) ? raw.slice(0, -1) : '';
  if (gross === null && !blurred) return unknown;
  const categories = new Set<string>();
  let netCents = 0,
    taxCents = 0,
    grossCents = 0;
  for (const row of groups) {
    const match = row.match(
      /^[ \t]*(Ware|Pfand)[ \t]*[*“”"'][ \t]*(\d{1,3}(?:,\d{1,2})?)[ \t]*%[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]+MwSt\.[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]+Gesamt[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]*$/i
    );
    if (!match) return unknown;
    const [, category, rateText, ...amounts] = match;
    const rate = Number(rateText.replace(',', '.'));
    const [base, tax, subtotal] = amounts.map(parse);
    const key = category.toLowerCase() + ':' + rate;
    if (
      base === null ||
      tax === null ||
      subtotal === null ||
      rate > 100 ||
      categories.has(key) ||
      !close((base * rate) / 100, tax) ||
      Math.round(base * 100) + Math.round(tax * 100) !== Math.round(subtotal * 100)
    )
      return unknown;
    categories.add(key);
    netCents += Math.round(base * 100);
    taxCents += Math.round(tax * 100);
    grossCents += Math.round(subtotal * 100);
  }
  if (gross === null) {
    const sum = (grossCents / 100).toFixed(2).replace('.', ',');
    if (sum.slice(0, -1) !== blurred.replace(/\./g, '')) return unknown;
    gross = grossCents / 100;
  }
  return grossCents === Math.round(gross * 100) ? { net: netCents / 100, tax: taxCents / 100, gross } : unknown;
}

function scannedReceiptLines(text: string): BillLine[] {
  const lines: BillLine[] = [];
  let inReceipt = false;
  for (const row of text.split(/\r?\n/)) {
    if (
      /^[ \t]*Artikel[ \t]+Nr\.[ \t]+Beschreibung[ \t]+Menge[ \t]+Einzelpreis[ \t]+Preis[ \t]+nach[ \t]+Rabatt[ \t]+UST[ \t]*$/i.test(
        row
      )
    ) {
      inReceipt = true;
      continue;
    }
    if (/^[ \t]*(?:Summe[ \t]+Lieferschein|Seite[ \t]+\d+[ \t]*$)/i.test(row)) inReceipt = false;
    if (!inReceipt) continue;
    const match = row.match(
      /^[ \t]*\d{12,14}[ \t]+(.+?)[ \t]+(-?\d+(?:,\d+)?)[ \t]+([A-Za-zÄÖÜäöü.]+)[ \t]+([\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]+(\d{1,3}(?:,\d{1,2})?)[ \t]*%[ \t]*$/
    );
    if (!match) continue;
    const [quantity, price, beforeDiscount, afterDiscount, taxRate] = [
      match[2],
      match[4],
      match[5],
      match[6],
      match[7]
    ].map(parse);
    if (
      quantity === null ||
      !quantity ||
      price === null ||
      beforeDiscount === null ||
      afterDiscount === null ||
      taxRate === null ||
      taxRate > 100 ||
      !close(quantity * price, beforeDiscount) ||
      Math.abs(afterDiscount) > Math.abs(beforeDiscount) ||
      (afterDiscount && Math.sign(afterDiscount) !== Math.sign(quantity))
    )
      continue;
    const name = match[1].trim().slice(0, 240);
    if (!name) continue;
    const role = /\b(?:pfand|leergut)\b/i.test(name)
      ? 'deposit'
      : /\b(?:rabatt|skonto)\b/i.test(name)
        ? 'discount'
        : quantity < 0
          ? 'return'
          : 'goods';
    lines.push({
      id: 'receipt-' + (lines.length + 1),
      articleId: null,
      name,
      quantity: role === 'discount' ? null : quantity,
      unit: match[3],
      role,
      unitNet: null,
      totalNet: null,
      taxRate
    });
  }
  return lines;
}

// Only the explicit layout with gross unit and line amounts is supported here.
// Its gross prices are never transferred into fields labelled net.
function grossTableLines(text: string, net: number | null, gross: number | null): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r => /Nr\.[ \t]+Artikelbeschreibung[ \t]+Anz\.[ \t]+Brutto[ \t]+Gesamtpreis/i.test(r));
  if (start < 0) return [];
  const result: BillLine[] = [];
  const priced: GrossRow[] = [];
  let current: { index: number; name: string } | undefined;
  const amounts =
    /(?:^|[ \t]+)(\d+(?:,\d+)?)[ \t]+([\d.]+,\d{2})[ \t]+(?:e(?:ur)?[ \t]+)?([\d.]+,\d{2})(?:[ \t]+e(?:ur)?)?[ \t]*$/i;
  for (const row of rows.slice(start + 1)) {
    if (/^[ \t]*(?:Zahlbar|Zwischensumme|Rechnungssumme|Summe[ \t]+Netto)/i.test(row)) break;
    const first = row.match(/^[ \t]*(\d{1,3})[ \t]+(\d+\*?)[ \t]+(.+)$/);
    let content = row;
    if (first) {
      current = { index: Number(first[1]), name: first[3].trim() };
      content = first[3];
    }
    if (!current) continue;
    const m = content.match(amounts);
    if (!m) {
      // Zweite und dritte Zeile der Beschreibung (z. B. „Qualitätswein 0,75l“) gehören zum Artikel.
      if (!first && row.trim()) current.name = (current.name + ' ' + row.trim()).slice(0, 240);
      continue;
    }
    const quantity = parse(m[1]),
      unit = parse(m[2]),
      total = parse(m[3]);
    const name = (first ? content.slice(0, m.index).trim() : current.name).slice(0, 240);
    if (
      quantity !== null &&
      quantity > 0 &&
      unit !== null &&
      total !== null &&
      name &&
      close(quantity * unit, total) &&
      !result.some(l => l.id === 'suggestion-' + current!.index)
    ) {
      result.push({
        id: 'suggestion-' + current.index,
        articleId: null,
        name,
        quantity,
        unit: '',
        unitNet: null,
        totalNet: null,
        taxRate: null
      });
      priced.push({ line: result[result.length - 1], unit, total });
    }
    current = undefined;
  }
  // „10,00 % Rabatt  -53,95“ unter der Zwischensumme: gilt für alle Zeilen.
  const discount = text.match(/^[ \t]*(\d{1,2}(?:[.,]\d{1,2})?)[ \t]*%[ \t]*Rabatt[ \t]+-[ \t]*([\d.]+,\d{2})/im);
  const percent = discount ? Number(discount[1].replace(',', '.')) : 0;
  return netFromGross(priced, net, gross, Number.isFinite(percent) ? percent : 0);
}
function netTableLines(text: string): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r => /Pos[ \t]+Menge[ \t]+Art\.-Nr\.[ \t]+Text[ \t]+Einzelpreis/i.test(r));
  if (start < 0 || !/Gesamt[ \t]+Netto/i.test(text)) return [];
  const result: BillLine[] = [];
  let current: { index: number; name: string; quantity: number; unit: string } | undefined;
  for (const row of rows.slice(start + 1)) {
    if (/^[ \t]*(?:Gesamt[ \t]+Netto|Zwischensumme|Gesamtbetrag|Zahlbar)/i.test(row)) break;
    const head = row.match(
      /^[ \t]*(\d{1,3})[ \t]+(-?[\d.]+,\d{2})[ \t]+([A-Za-zÄÖÜäöü.]+)[ \t]+([A-Za-z0-9_-]+)[ \t]+(.+)$/
    );
    let amounts = row.match(/^[ \t]*(-?[\d.]+,\d{2})[ \t]+([\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]*$/);
    if (head) {
      const quantity = parse(head[2]);
      // Kurze Positionen stehen mit ihren Beträgen in einer Zeile.
      const inline = head[5].match(/^(.+?)[ \t]+(-?[\d.]+,\d{2})[ \t]+([\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]*$/);
      current =
        quantity !== null && quantity !== 0
          ? {
              index: Number(head[1]),
              quantity,
              unit: head[3],
              name: (inline ? inline[1] : head[5]).trim().slice(0, 240)
            }
          : undefined;
      if (!inline) continue;
      amounts = inline;
    }
    if (current && !amounts && !head && row.trim()) {
      current.name = (current.name + ' ' + row.trim().replace(/[ \t]+/g, ' ')).slice(0, 240);
      continue;
    }
    if (!current || !amounts) continue;
    const offset = amounts.length === 5 ? 1 : 0;
    const unitNet = parse(amounts[1 + offset]),
      taxRate = parse(amounts[2 + offset]),
      totalNet = parse(amounts[3 + offset]);
    if (
      unitNet !== null &&
      taxRate !== null &&
      taxRate <= 100 &&
      totalNet !== null &&
      current.name &&
      close(current.quantity * unitNet, totalNet) &&
      !result.some(l => l.id === 'suggestion-' + current!.index)
    )
      result.push({
        id: 'suggestion-' + current.index,
        articleId: null,
        name: current.name,
        quantity: current.quantity,
        unit: current.unit,
        unitNet,
        totalNet,
        taxRate
      });
    current = undefined;
  }
  return result;
}
function discountTableLines(text: string): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r =>
      /Pos\.[ \t]+Artikelnummer[ \t]+Artikelbezeichnung[ \t]+Menge[ \t]+USt\.[ \t]+Einzelpreis[ \t]+Rabatt[ \t]+Gesamtpreis/i.test(
        r
      )
    );
  if (start < 0) return [];
  const lines: BillLine[] = [];
  let current: { index: number; name: string } | undefined;
  for (const row of rows.slice(start + 1)) {
    if (/^[ \t]*(?:Zwischensumme|Gesamtsumme|Gesamtbetrag)/i.test(row)) break;
    const head = row.match(/^[ \t]*(\d{1,3})[ \t]+[A-Za-z0-9_-]+[ \t]+(.+)$/);
    if (head) {
      current = { index: Number(head[1]), name: head[2].trim() };
      continue;
    }
    if (!current || !row.trim()) continue;
    const m = row.match(
      /^[ \t]*(\d+(?:,\d+)?)[ \t]+([A-Za-zÄÖÜäöü.]+)[ \t]+(\d+(?:,\d+)?)[ \t]*%[ \t]+([\d.]+,\d{2})[ \t]+EUR[ \t]+(\d+(?:,\d+)?)[ \t]*%[ \t]+([\d.]+,\d{2})[ \t]+EUR[ \t]*$/i
    );
    if (!m) {
      if (!/^[ \t]*Lieferung/i.test(row)) current.name = (current.name + ' ' + row.trim()).slice(0, 240);
      continue;
    }
    const quantity = parse(m[1]),
      taxRate = parse(m[3]),
      unit = parse(m[4]),
      discount = parse(m[5]),
      totalNet = parse(m[6]);
    if (
      quantity !== null &&
      quantity > 0 &&
      taxRate !== null &&
      taxRate <= 100 &&
      unit !== null &&
      discount !== null &&
      discount >= 0 &&
      discount <= 100 &&
      totalNet !== null &&
      Math.abs(quantity * unit * (1 - discount / 100) - totalNet) <= 0.006 * quantity + 0.021 &&
      current.name
    )
      lines.push({
        id: 'suggestion-' + current.index,
        articleId: null,
        name: current.name,
        quantity,
        unit: m[2],
        unitNet: discount === 0 ? unit : round4(totalNet / quantity),
        totalNet,
        taxRate
      });
    current = undefined;
  }
  return lines;
}
// Bäckerei-Layout: Bezeichnung, Menge, Einheit, Preis, Rabatt %, rabattierter Einzelpreis, Gesamt.
// Netto- oder Bruttopreise werden über die Belegsummen bestimmt; passt keine, bleiben die Beträge leer.
function bakeryLines(text: string, net: number | null, gross: number | null): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r => /Art\.[ \t]*Nr\.[ \t]+Bezeichnung/i.test(r));
  if (start < 0 || !/Rabatt/i.test(text)) return [];
  const found: Array<{ name: string; quantity: number; unit: string; unitPrice: number; total: number }> = [];
  for (const row of rows.slice(start + 1)) {
    if (/^[ \t]*(?:Summe|Netto)[ \t]*:/i.test(row)) break;
    const m = row.match(
      /^[ \t]*(?:\d{1,6}[ \t]+)?(.+?)[ \t]+(\d+(?:,\d+)?)[ \t]+([A-Za-zÄÖÜäöüß.]+)[ \t]+([\d.]+,\d{2})[ \t]+(\d{1,3}(?:,\d{1,2})?)[ \t]+([\d.]+,\d{2})[ \t]+([\d.]+,\d{2})(?:[ \t]+\d{1,6})?[ \t]*$/
    );
    if (!m) continue;
    const [quantity, price, discount, unitPrice, total] = [m[2], m[4], m[5], m[6], m[7]].map(parse);
    if (
      quantity === null ||
      quantity <= 0 ||
      price === null ||
      discount === null ||
      discount > 100 ||
      unitPrice === null ||
      total === null ||
      Math.abs(price * (1 - discount / 100) - unitPrice) > 0.006 ||
      !close(quantity * unitPrice, total)
    )
      continue;
    found.push({ name: m[1].trim().slice(0, 240), quantity, unit: m[3], unitPrice, total });
  }
  const sum = found.reduce((s, l) => s + l.total, 0);
  const isNet = net !== null && close(sum, net);
  if (!found.length || (!isNet && !(gross !== null && close(sum, gross)))) return [];
  const lines = found.map((l, i) => ({
    id: 'bakery-' + (i + 1),
    articleId: null,
    name: l.name,
    quantity: l.quantity,
    unit: l.unit,
    unitNet: isNet ? l.unitPrice : null,
    totalNet: isNet ? l.total : null,
    taxRate: isNet ? singleRate(net, gross) : null
  }));
  return isNet
    ? lines
    : netFromGross(
        lines.map((line, i) => ({ line, unit: found[i].unitPrice, total: found[i].total })),
        net,
        gross
      );
}
// Summenzeile „Netto: … x % MwSt: … Brutto: …“ (ein Steuersatz).
function inlineTotals(text: string): Pick<BillProposal, 'net' | 'tax' | 'gross'> | undefined {
  const rows = [
    ...text.matchAll(
      /^[ \t]*Netto[ \t]*:[ \t]*(-?[\d.]+,\d{2})[ \t]+(\d{1,3}(?:,\d{1,2})?)[ \t]*%[ \t]*MwSt\.?[ \t]*:[ \t]*(-?[\d.]+,\d{2})[ \t]+Brutto[ \t]*:[ \t]*(-?[\d.]+,\d{2})[ \t]*$/gim
    )
  ];
  if (rows.length !== 1) return undefined;
  const [net, rate, tax, gross] = rows[0].slice(1).map(parse);
  if (net === null || rate === null || tax === null || gross === null || rate > 100) return undefined;
  if (!close(net + tax, gross) || Math.abs((net * rate) / 100 - tax) > 0.02) return undefined;
  return { net, tax, gross };
}
function marketLines(text: string): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r => /MM[ \t]+ART\.-NR[ \t]+EAN[ \t]+ARTIKEL[ \t]+PACK/i.test(r));
  if (start < 0) return [];
  const lines: BillLine[] = [];
  const found: Array<{ line: BillLine; total: number; code: string }> = [];
  for (const row of rows.slice(start + 1)) {
    if (/NETTO-WARENWERT/i.test(row)) break;
    const m = row.match(
      /^[ \t]*\d+\.\d+[ \t]+\d{10,14}[ \t]+(.+?)[ \t]+([A-Z]{2})[ \t]+[\d.]+,\d{3}[ \t]+\d+[ \t]+([\d.]+,\d{2})[ \t]+(\d+)[ \t]+([\d.]+,\d{2})[ \t]+([A-Z])(?:[ \t]|$)/
    );
    if (!m) continue;
    const unit = parse(m[3]),
      quantity = parse(m[4]),
      total = parse(m[5]);
    if (unit !== null && quantity !== null && quantity > 0 && total !== null && close(unit * quantity, total)) {
      lines.push({
        id: 'market-' + (lines.length + 1),
        articleId: null,
        name: m[1].trim().slice(0, 240),
        quantity,
        unit: m[2],
        unitNet: null,
        totalNet: null,
        taxRate: null
      });
      found.push({ line: lines[lines.length - 1], total, code: m[6] });
    }
  }
  // Großmarkt-Preise sind netto. Mengenrabatte nennen den Artikel und werden dort abgezogen.
  const declared = parse((text.match(/NETTO-WARENWERT[ \t]*:[ \t]*([\d.]+,\d{2})/i) || [])[1] || '');
  const rates = new Map(
    [...text.matchAll(/^[ \t]*[\d.]+,\d{2}[ \t]+([A-Z])[ \t]*=[ \t]*(\d{1,2}),\d{2}[ \t]*%/gm)].map(m => [
      m[1],
      Number(m[2])
    ])
  );
  const discounts = [
    ...text.matchAll(/^[ \t]*Mengenrabatt[ \t]+(?:-[ \t]*)?(.+?)[ \t]+([\d.]+,\d{2})-[ \t]+[A-Z]\b/gim)
  ];
  const net = new Map(found.map(row => [row.line.id, row.total]));
  for (const d of discounts) {
    const target = found.filter(row => row.line.name === d[1].trim());
    const value = parse(d[2]);
    if (target.length !== 1 || value === null) return lines;
    net.set(target[0].line.id, cents(net.get(target[0].line.id)! - value));
  }
  if (
    declared === null ||
    !close(
      [...net.values()].reduce((a, b) => a + b, 0),
      declared
    )
  )
    return lines;
  return found.map(row => {
    const totalNet = net.get(row.line.id)!;
    return {
      ...row.line,
      unitNet: round4(totalNet / row.line.quantity!),
      totalNet,
      taxRate: rates.get(row.code) ?? null
    };
  });
}
function scanHints(
  text: string,
  usedOcr: boolean
): Pick<BillProposal, 'needsSeparateFiles' | 'scanNumberConflict' | 'costAreas'> {
  const pages = text.split(/^[ \t]*Seite \d+[ \t]*$/im);
  const identifiers = new Set<string>();
  const documentKinds = new Set<string>();
  let finalTotalPages = 0;
  for (const page of pages) {
    if (
      /^[ \t]*(?:Rechnungsbetrag|Rechnungssumme|Gesamtbetrag|Endbetrag)[ \t]*:?[ \t]*(?:EUR[ \t]+)?-?[\d.]+,\d{2}(?:[ \t]|$)/im.test(
        page
      )
    )
      finalTotalPages++;
    for (const match of page.matchAll(documentHeaders)) {
      identifiers.add(documentNumber(match[2]).toUpperCase());
      if (!/^belegnummer$/i.test(match[1])) documentKinds.add(/^gutschrift/i.test(match[1]) ? 'credit' : 'invoice');
    }
    if (/^[ \t]*Gutschrift[ \t]*$/im.test(page) || hasScannedCredit(page, scannedTaxTotals(page)?.gross))
      documentKinds.add('credit');
    if (/^[ \t]*Rechnung[ \t]*$/im.test(page)) documentKinds.add('invoice');
  }
  const labels = new Set<string>();
  for (const match of text.matchAll(
    /^[ \t]*(?:(?:Kostenstelle|Bereich|Einsatzort)[ \t]*:[ \t]*|Lieferung[ \t]+(?:Zunftabend[ \t]+)?)(Hallenbar|Bar|Küche|Zunftscheuer|Scheuer|Marktplatz|Markt)[ \t]*:?[ \t]*$/gim
  )) {
    const label = match[1].toLowerCase();
    labels.add(
      label === 'küche'
        ? 'Küche'
        : ['scheuer', 'zunftscheuer'].includes(label)
          ? 'Zunftscheuer'
          : ['markt', 'marktplatz'].includes(label)
            ? 'Marktplatz'
            : label === 'bar'
              ? 'Bar'
              : 'Hallenbar'
    );
  }
  // Texterkennung schneidet Nummern gelegentlich ab (455 statt 455923). Solche Bruchstücke zählen nicht als eigene Nummer.
  if (usedOcr)
    for (const id of [...identifiers])
      if (!/\d/.test(id) || [...identifiers].some(o => o !== id && o.startsWith(id))) identifiers.delete(id);
  return {
    ...(identifiers.size > 1 || documentKinds.size > 1 ? { needsSeparateFiles: true as const } : {}),
    ...(usedOcr && identifiers.size > 1 && documentKinds.size < 2 && finalTotalPages < 2
      ? { scanNumberConflict: true as const }
      : {}),
    ...(labels.size ? { costAreas: [...labels] } : {})
  };
}
export function billProposal(text: string, { usedOcr = false } = {}): BillProposal {
  const hints = scanHints(text, usedOcr);
  if (hints.needsSeparateFiles) return { ...hints, number: '', date: '', net: null, tax: null, gross: null, lines: [] };
  const only = (values: string[]): string => (new Set(values).size === 1 ? values[0] : '');
  const unique = (pattern: RegExp): string => only([...text.matchAll(pattern)].map(m => m[1].trim()));
  const headers = [...text.matchAll(documentHeaders)];
  const numbers = headers.map(match => documentNumber(match[2]));
  // Beschriftungen und Werte als getrennte Blöcke (z. B. Shop-Rechnungen): Nummer und Datum stehen darunter.
  const block = text.match(
    /^[ \t]*Rechnungsnummer[ \t]*:[ \t]*\r?\n[ \t]*Rechnungsdatum[ \t]*:[ \t]*\r?\n[ \t]*([A-Z0-9][A-Z0-9_.\/-]*)[ \t]*\r?\n[ \t]*(\d{1,2}\.\d{1,2}\.\d{4})[ \t]*$/im
  );
  const number =
    only(usedOcr ? numbers.filter(n => /\d/.test(n) && !numbers.some(o => o !== n && o.startsWith(n))) : numbers) ||
    (!numbers.length && block ? block[1] : '');
  const dateLabels =
    /(?:\bRechnungsdatum|\bBelegdatum|^[ \t]*(?:Proforma-Lieferschein[ \t]+)?Datum)[ \t]*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/gim;
  const rawDate = only([
      ...headers.flatMap(match => (match[3] ? [match[3]] : [])),
      ...[...text.matchAll(dateLabels)].map(match => match[1]),
      ...(block ? [block[2]] : [])
    ]),
    parts = rawDate.split('.');
  const date = rawDate ? parts[2] + '-' + parts[1].padStart(2, '0') + '-' + parts[0].padStart(2, '0') : '';
  const scanTotals = scannedTaxTotals(text);
  const billType =
    /^[ \t]*Gutschrift(?:[ \t]+(?:Nr\.?|Nummer)[^\r\n]*)?[ \t]*$/im.test(text) ||
    hasScannedCredit(text, scanTotals?.gross)
      ? 'credit'
      : undefined;
  if (scanTotals)
    return {
      ...hints,
      ...(billType ? { billType } : {}),
      number,
      date,
      ...scanTotals,
      lines: scanTotals.gross === null ? [] : scannedReceiptLines(text)
    };
  const beverage = beverageTotals(text, usedOcr);
  if (beverage) return { ...hints, ...(billType ? { billType } : {}), number, date, ...beverage, lines: [] };
  let net = parse(
    unique(
      /(?:Nettobetrag|Summe[ \t]*Netto|Gesamt[ \t]*Netto|Gesamtsumme[ \t]*\(Netto\)|Zwischensumme[ \t]*\(Netto\))[ \t]*:?[ \t]*(-?[\d.]+,\d{2})/gi
    )
  );
  const explicitGross = parse(
    unique(
      /(?:Gesamtbetrag|Rechnungsbetrag|Endbetrag|Summe[ \t]*Brutto)[ \t]*:?[ \t]*(-?[\d.]+,\d{2})(?!\d)(?![^\r\n]*\d+[.,]\d{2})/gi
    )
  );
  let tax = parse(
    unique(
      /(?:MwSt\.?|Umsatzsteuer|Mehrwertsteuer)(?:[ \t]+\d+[,.]?\d*[ \t]*%)?[ \t]*:?[ \t]*(-?[\d.]+,\d{2})(?!\d)(?![^\r\n]*\d+[.,]\d{2})/gi
    )
  );
  let gross = explicitGross;
  // A row with two amounts can be a taxable base followed by tax. Accept it
  // only if the base matches net and the total independently reconciles.
  const candidates: Array<{ base: number; tax: number }> = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(
      /(?:MwSt\.?|USt\.?|Umsatzsteuer|Mehrwertsteuer)[ \t]*(?:auf[ \t]+)?([\d.]+,\d{2})[ \t]+(?:e(?:ur)?[ \t]+)?([\d.]+,\d{2})(?:[ \t]+e(?:ur)?)?[ \t]*$/i
    );
    if (m) {
      const base = parse(m[1]),
        amount = parse(m[2]);
      if (base !== null && amount !== null) candidates.push({ base, tax: amount });
    }
  }
  if (net === null && /NETTOWERT[ \t]+%[ \t]+MWST[ \t]+MWST[ \t]+BRUTTO/i.test(text)) {
    const declared = parse(unique(/NETTO-WARENWERT[ \t]*:[ \t]*([\d.]+,\d{2})/gi));
    const totalGross = parse(unique(/SUMME[ \t]+EUR[ \t]+([\d.]+,\d{2})/gi));
    const rows = [...text.matchAll(/^[ \t]*([\d.]+,\d{2})[ \t]+([\d.]+,\d{2})[ \t]+([\d.]+,\d{2})[ \t]*$/gm)];
    const matched = rows.filter(m => {
      const a = parse(m[1]),
        b = parse(m[2]),
        c = parse(m[3]);
      return (
        a !== null &&
        b !== null &&
        c !== null &&
        declared !== null &&
        totalGross !== null &&
        close(a, declared) &&
        close(c, totalGross) &&
        close(a + b, c)
      );
    });
    if (matched.length === 1) {
      net = declared;
      tax = parse(matched[0][2]);
      gross = totalGross;
    }
  }
  const inline = net === null && gross === null && tax === null ? inlineTotals(text) : undefined;
  if (inline) ({ net, tax, gross } = inline);
  const namedGross = parse(unique(/Rechnungssumme[ \t]*:?[ \t]*(-?[\d.]+,\d{2})/gi));
  const total = explicitGross ?? namedGross;
  if (
    net !== null &&
    total !== null &&
    candidates.length === 1 &&
    close(candidates[0].base, net) &&
    close(net + candidates[0].tax, total)
  ) {
    if (tax === null) tax = candidates[0].tax;
    if (gross === null) gross = total;
  }
  return {
    ...hints,
    ...(billType ? { billType } : {}),
    number,
    date,
    net,
    tax,
    gross,
    lines: [
      ...grossTableLines(text, net, gross),
      ...netTableLines(text),
      ...discountTableLines(text),
      ...marketLines(text),
      ...bakeryLines(text, net, gross)
    ].map(line => {
      if (/\b(?:pfand|leergut)\b/i.test(line.name)) return { ...line, role: 'deposit' };
      if (/\b(?:rabatt|skonto)\b/i.test(line.name)) return { ...line, role: 'discount' };
      if ((line.totalNet ?? 0) < 0 && /\b(?:retoure|rückgabe)\b/i.test(line.name)) return { ...line, role: 'return' };
      if ((line.totalNet ?? 0) < 0) return { ...line, role: 'open' };
      return line;
    })
  };
}
