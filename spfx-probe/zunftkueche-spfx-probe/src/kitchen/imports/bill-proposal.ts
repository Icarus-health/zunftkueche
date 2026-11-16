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
const documentHeaders =
  /^[ \t]*(Rechnungsnummer|Rechnungs[- \t]*Nr\.?|Rechnung[ \t]+(?:Nr\.?|Nummer)|Gutschrift[ \t]+(?:Nr\.?|Nummer)|Belegnummer)[ \t]*[:#]?[ \t]*([A-Z0-9][A-Z0-9_.\/-]*(?:[ \t]+-[ \t]+[A-Z0-9][A-Z0-9_.\/-]*)*)(?:[ \t]+Datum[ \t]*:?[ \t]*(\d{1,2}\.\d{1,2}\.\d{4}))?[ \t]*(?:(?:Seite|Technical[ \t]+ID)[ \t]*:[^\r\n]*)?$/gim;
const documentNumber = (value: string): string => value.replace(/[ \t]*-[ \t]*/g, '-');

function scannedTaxTotals(text: string): Pick<BillProposal, 'net' | 'tax' | 'gross'> | undefined {
  const tables = text.split(/^[ \t]*UST-Satz[ \t]+Netto-Entgelt[ \t]+UST-Betrag[ \t]+Brutto-Entgelt[ \t]*$/im);
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
      return rates.length && close(sumNet, net) && close(sumTax, tax) && close(sumGross, gross)
        ? { net, tax, gross }
        : unknown;
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
function hasScannedCredit(text: string, gross: number | null | undefined): boolean {
  if (gross === null || gross === undefined || gross >= 0) return false;
  const amounts = new Set(
    [...text.matchAll(/^[ \t]*Gutschrift[ \t]+([\d.]+,\d{2})[ \t]+EUR[ \t]*$/gim)].map(match => parse(match[1]))
  );
  const amount = [...amounts][0];
  return amounts.size === 1 && amount !== null && close(amount, -gross);
}

function beverageTotals(text: string): Pick<BillProposal, 'net' | 'tax' | 'gross'> | undefined {
  const groups = text.split(/\r?\n/).filter(row => /^[ \t]*(?:Ware|Pfand)[ \t]*\*[ \t]*\d/i.test(row));
  if (!groups.length) return undefined;
  const unknown = { net: null, tax: null, gross: null };
  const totals = [...text.matchAll(/^[ \t]*Rechnungsbetrag[ \t]*:?[ \t]+EUR[ \t]+([^\r\n]+)$/gim)];
  const gross =
    totals.length === 1 && /^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(totals[0][1].trim())
      ? parse(totals[0][1].trim())
      : null;
  if (gross === null) return unknown;
  const categories = new Set<string>();
  let netCents = 0,
    taxCents = 0,
    grossCents = 0;
  for (const row of groups) {
    const match = row.match(
      /^[ \t]*(Ware|Pfand)[ \t]*\*[ \t]*(\d{1,3}(?:,\d{1,2})?)[ \t]*%[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]+MwSt\.[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]+Gesamt[ \t]*:[ \t]*EUR[ \t]+(-?[\d.]+,\d{2})[ \t]*$/i
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
function grossTableLines(text: string): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r => /Nr\.[ \t]+Artikelbeschreibung[ \t]+Anz\.[ \t]+Brutto[ \t]+Gesamtpreis/i.test(r));
  if (start < 0) return [];
  const result: BillLine[] = [];
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
    if (!m) continue;
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
    )
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
    current = undefined;
  }
  return result;
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
    if (head) {
      const quantity = parse(head[2]);
      current =
        quantity !== null && quantity !== 0
          ? { index: Number(head[1]), quantity, unit: head[3], name: head[5].trim().slice(0, 240) }
          : undefined;
      continue;
    }
    const amounts = row.match(/^[ \t]*(-?[\d.]+,\d{2})[ \t]+([\d.]+,\d{2})[ \t]+(-?[\d.]+,\d{2})[ \t]*$/);
    if (!current || !amounts) continue;
    const unitNet = parse(amounts[1]),
      taxRate = parse(amounts[2]),
      totalNet = parse(amounts[3]);
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
      close(quantity * unit * (1 - discount / 100), totalNet) &&
      current.name
    )
      lines.push({
        id: 'suggestion-' + current.index,
        articleId: null,
        name: current.name,
        quantity,
        unit: m[2],
        unitNet: discount === 0 ? unit : null,
        totalNet,
        taxRate
      });
    current = undefined;
  }
  return lines;
}
function marketLines(text: string): BillLine[] {
  const rows = text.split(/\r?\n/),
    start = rows.findIndex(r => /MM[ \t]+ART\.-NR[ \t]+EAN[ \t]+ARTIKEL[ \t]+PACK/i.test(r));
  if (start < 0) return [];
  const lines: BillLine[] = [];
  for (const row of rows.slice(start + 1)) {
    if (/NETTO-WARENWERT/i.test(row)) break;
    const m = row.match(
      /^[ \t]*\d+\.\d+[ \t]+\d{10,14}[ \t]+(.+?)[ \t]+([A-Z]{2})[ \t]+[\d.]+,\d{3}[ \t]+\d+[ \t]+([\d.]+,\d{2})[ \t]+(\d+)[ \t]+([\d.]+,\d{2})[ \t]+[A-Z](?:[ \t]|$)/
    );
    if (!m) continue;
    const unit = parse(m[3]),
      quantity = parse(m[4]),
      total = parse(m[5]);
    if (unit !== null && quantity !== null && quantity > 0 && total !== null && close(unit * quantity, total))
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
  }
  return lines;
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
    /^[ \t]*(?:(?:Kostenstelle|Bereich|Einsatzort)[ \t]*:[ \t]*|Lieferung[ \t]+(?:Zunftabend[ \t]+)?)(Hallenbar|Bar|Küche|Zunftscheuer|Scheuer)[ \t]*:?[ \t]*$/gim
  )) {
    const label = match[1].toLowerCase();
    labels.add(
      label === 'küche'
        ? 'Küche'
        : ['scheuer', 'zunftscheuer'].includes(label)
          ? 'Zunftscheuer'
          : label === 'bar'
            ? 'Bar'
            : 'Hallenbar'
    );
  }
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
  const number = only(headers.map(match => documentNumber(match[2])));
  const dateLabels =
    /(?:\bRechnungsdatum|\bBelegdatum|^[ \t]*(?:Proforma-Lieferschein[ \t]+)?Datum)[ \t]*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/gim;
  const rawDate = only([
      ...headers.flatMap(match => (match[3] ? [match[3]] : [])),
      ...[...text.matchAll(dateLabels)].map(match => match[1])
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
  const beverage = beverageTotals(text);
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
    lines: [...grossTableLines(text), ...netTableLines(text), ...discountTableLines(text), ...marketLines(text)].map(
      line => {
        if (/\b(?:pfand|leergut)\b/i.test(line.name)) return { ...line, role: 'deposit' };
        if (/\b(?:rabatt|skonto)\b/i.test(line.name)) return { ...line, role: 'discount' };
        if ((line.totalNet ?? 0) < 0 && /\b(?:retoure|rückgabe)\b/i.test(line.name)) return { ...line, role: 'return' };
        if ((line.totalNet ?? 0) < 0) return { ...line, role: 'open' };
        return line;
      }
    )
  };
}
