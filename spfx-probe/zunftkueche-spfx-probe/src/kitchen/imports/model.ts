/* eslint-disable @rushstack/no-new-null -- Empty imported business values remain explicitly unknown. */
import type { Area } from '../model';
import type { ImportField, Purpose, ImportRow } from '../ww/model';
export interface GridCell {
    text: string;
    number?: number;
    formula?: boolean;
}
export interface ImportGrid {
    name: string;
    rows: GridCell[][];
    date1904?: boolean;
}
export interface ImportProfile {
    id: string;
    name: string;
    purpose: Purpose;
    separator: ';' | ',' | '\t';
    decimalSeparator: ',' | '.';
    dateFormat: 'iso' | 'de' | 'excel';
    basis: 'net' | 'gross' | 'unknown';
    columnMap: Partial<Record<ImportField, number>>;
    activeStatuses: string[];
    cancelledStatuses: string[];
    refundStatuses: string[];
    defaultStatus?: 'active';
}
export interface ImportContext {
    seasonId: string;
    area: Area;
    locationId: string;
    sourceId: string;
    periodStart: string;
    periodEnd: string;
    currency: string;
    purpose?: Purpose;
}
export interface ProductMapping {
    sourceId: string;
    externalCode: string;
    targetProductId: string;
    unit: string;
    factor: number;
}
export interface ImportPreview {
    rows: ImportRow[];
    errors: string[];
    warnings: string[];
    missing: string[];
    quantity: number;
    amount: number | null;
}
