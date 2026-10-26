/* eslint-disable @rushstack/no-new-null -- Unknown source values must remain unknown. */
import type { GridCell, ImportContext, ImportGrid, ImportPreview, ImportProfile, ProductMapping } from './model';
import type { ImportField, SystemRow } from '../ww/model';
import { amount, cents, round, validDate } from '../ww/domain.ts';
export function importedNumber(cell: GridCell | undefined, decimal: ',' | '.', signed = false): number | null {
    if (!cell || !cell.text.trim())
        return null;
    if (cell.number !== undefined) {
        amount(cell.number, false, signed);
        return cell.number;
    }
    const raw = cell.text.trim().replace(/[\u00a0\u202f ]/g, '');
    const pattern = decimal === ',' ? /^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,4})?$/ : /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/;
    if (!pattern.test(raw))
        throw new Error('Zahlenformat ist mehrdeutig oder ungültig.');
    const value = Number(decimal === ',' ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, ''));
    amount(value, false, signed);
    return value;
}
function dateValue(cell: GridCell | undefined, profile: ImportProfile, grid: ImportGrid, fallback: string): string {
    if (!cell?.text.trim())
        return fallback;
    let date = cell.text.trim();
    if (profile.dateFormat === 'de') {
        const m = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
        if (!m)
            throw new Error('Datum passt nicht zu TT.MM.JJJJ.');
        date = m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    else if (profile.dateFormat === 'excel') {
        const serial = cell.number ?? Number(date);
        if (!Number.isFinite(serial) || serial < 1 || (!grid.date1904 && Math.floor(serial) === 60))
            throw new Error('Excel-Datum bitte prüfen.');
        const epoch = grid.date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
        date = new Date(epoch + Math.floor(serial) * 86400000).toISOString().slice(0, 10);
    }
    validDate(date);
    if (date < '2000-01-01' || date > '2200-12-31')
        throw new Error('Datum außerhalb des unterstützten Bereichs.');
    return date;
}
export function previewSystemImport(grid: ImportGrid, headerRow: number, profile: ImportProfile, context: ImportContext, mappings: ProductMapping[]): ImportPreview {
    validDate(context.periodStart);
    validDate(context.periodEnd);
    if (context.periodStart > context.periodEnd)
        throw new Error('Zeitraum bitte prüfen.');
    if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= grid.rows.length - 1)
        throw new Error('Kopfzeile und Datenzeilen wählen.');
    if (profile.columnMap.quantity === undefined || (profile.columnMap.productCode === undefined && profile.columnMap.productName === undefined))
        throw new Error('Artikel und Mengenspalte müssen zugeordnet sein.');
    const errors: string[] = [], warnings: string[] = [], missing = new Set<string>(), rows: SystemRow[] = [];
    const status = (values: string[], s: string): boolean => values.some(v => v.trim().toLocaleLowerCase() === s);
    for (let i = headerRow + 1; i < grid.rows.length; i++) {
        const line = grid.rows[i];
        if (!line.some(c => c.text.trim()))
            continue;
        const get = (field: ImportField): GridCell | undefined => profile.columnMap[field] === undefined ? undefined : line[profile.columnMap[field]!];
        try {
            for (const field of Object.keys(profile.columnMap) as ImportField[])
                if (get(field)?.formula)
                    warnings.push('Zeile ' + (i + 1) + ': gespeicherten Formelwert für ' + field + ' am Original prüfen.');
            const externalCode = (get('productCode')?.text || get('productName')?.text || '').trim();
            const mapping = mappings.find(m => m.sourceId === context.sourceId && m.externalCode === externalCode);
            if (!mapping) {
                missing.add(externalCode || 'Artikel ohne Kennung');
                throw new Error('Artikel „' + externalCode + '“ zuordnen.');
            }
            if (!Number.isFinite(mapping.factor) || mapping.factor <= 0)
                throw new Error('Artikelumrechnung bitte prüfen.');
            const unit = get('unit')?.text.trim();
            if (unit && unit !== mapping.unit)
                throw new Error('Einheit „' + unit + '“ passt nicht zur bestätigten Umrechnung.');
            const value = importedNumber(get('quantity'), profile.decimalSeparator, true);
            if (value === null)
                throw new Error('Menge fehlt.');
            const label = (get('status')?.text || '').trim().toLocaleLowerCase();
            let rowStatus: SystemRow['status'];
            if (status(profile.cancelledStatuses, label))
                rowStatus = 'cancelled';
            else if (status(profile.refundStatuses, label))
                rowStatus = 'refund';
            else if (status(profile.activeStatuses, label) || (!label && (profile.purpose === 'sales' || profile.defaultStatus === 'active')))
                rowStatus = 'active';
            else
                throw new Error('Status „' + label + '“ ausdrücklich zuordnen.');
            if (value < 0 && rowStatus !== 'cancelled') {
                if (profile.purpose !== 'sales')
                    throw new Error('Negative Menümenge bitte als Stornierung klären.');
                rowStatus = 'refund';
            }
            let money = importedNumber(get('amount'), profile.decimalSeparator, true);
            if (rowStatus === 'refund' && money !== null)
                money = -Math.abs(money);
            if (rowStatus === 'active' && money !== null && money < 0)
                throw new Error('Negativen Betrag bitte als Erstattung oder Korrektur klären.');
            const date = dateValue(get('date'), profile, grid, context.periodStart);
            if (!get('date')?.text.trim() && context.periodStart !== context.periodEnd)
                throw new Error('Ohne Datumszeile bitte genau einen Betriebstag wählen.');
            if (date < context.periodStart || date > context.periodEnd)
                throw new Error('Datum liegt außerhalb des gewählten Zeitraums.');
            const currency = get('currency')?.text.trim();
            if (currency && currency !== context.currency)
                throw new Error('Währung passt nicht zum Import.');
            rows.push({ externalId: (get('externalId')?.text || '').trim(), productId: mapping.targetProductId, name: (get('productName')?.text || externalCode).trim(), quantity: round(Math.abs(value) * mapping.factor), date, status: rowStatus, amount: money === null ? null : cents(money) });
        }
        catch (e) {
            errors.push('Zeile ' + (i + 1) + ': ' + (e instanceof Error ? e.message : 'Eingaben prüfen.'));
        }
    }
    if (rows.length > 500)
        errors.push('Bitte einen auf Artikel und Betriebstag verdichteten Bericht mit höchstens 500 Zeilen exportieren. Einen Zeitraum nicht in überlappenden Teilimporten übernehmen; in der Vorschau wird nichts gekürzt.');
    return { rows, errors, warnings: [...new Set(warnings)], missing: [...missing], quantity: round(rows.reduce((n, r) => n + (r.status === 'cancelled' ? 0 : r.status === 'refund' ? -r.quantity : r.quantity), 0)), amount: rows.some(r => r.amount === null) ? null : cents(rows.filter(r => r.status !== 'cancelled').reduce((n, r) => n + r.amount!, 0)) };
}
