/* eslint-disable @rushstack/no-new-null -- Unknown business values are explicit in stored documents. */
import type { Area, Stored } from '../model';
export interface Base {
    id: string;
    kind: string;
    scope: string;
    at: string;
    by: string;
    confirmed: boolean;
}
export interface Slot extends Base {
    kind: 'slot';
    name: string;
    date: string;
    time: string;
    place: string;
}
export interface Rule extends Base {
    kind: 'rule';
    supplierId: string;
    weekdays: number[];
    leadDays: number;
    cutoff: string;
    minNet: number | null;
    feeNet: number | null;
    note: string;
}
export interface Template extends Base {
    kind: 'template';
    name: string;
    supplierId: string;
    area: Area;
    lines: Array<{
        offerId: string;
        quantity: number | null;
    }>;
    note: string;
}
export interface PriceList extends Base {
    kind: 'prices';
    name: string;
    supplierId: string;
    validFrom: string;
    lines: Array<{
        offerId: string;
        offerSignature?: string;
        priceNet: number | null;
        deposit: number | null;
    }>;
}
export interface Recipe extends Base {
    kind: 'recipe';
    familyId: string;
    name: string;
    category: string;
    yield: number;
    salePriceGross: number | null;
    ingredients: Array<{
        articleId: string;
        quantity: number;
        unit: string;
    }>;
}
export interface Plan extends Base {
    kind: 'plan';
    name: string;
    area: Area;
    date: string;
    lines: Array<{
        recipeId: string;
        portions: number;
    }>;
    note: string;
}
export type MovementType = 'incoming' | 'return' | 'waste' | 'internal' | 'transfer' | 'opening' | 'count';
export interface Movement extends Base {
    kind: 'movement';
    area: Area;
    articleId: string;
    quantity: number;
    unit: string;
    type: MovementType;
    place: string;
    toArea: Area | null;
    toPlace: string;
    note: string;
}
export interface BillLine {
    id: string;
    articleId: string | null;
    name: string;
    quantity: number | null;
    unit: string;
    unitNet: number | null;
    totalNet: number | null;
    taxRate: number | null;
}
export interface Bill extends Base {
    kind: 'bill';
    name: string;
    supplierId: string;
    number: string;
    date: string;
    area: Area;
    orderIds: string[];
    fileHash: string;
    fileName: string;
    attachment: string;
    net: number | null;
    tax: number | null;
    gross: number | null;
    adjustmentNet: number;
    lines: BillLine[];
    note: string;
}
export type Purpose = 'sales' | 'menuOrders';
export type ImportField = 'externalId' | 'productCode' | 'productName' | 'quantity' | 'unit' | 'date' | 'status' | 'amount' | 'currency';
export interface Profile extends Base {
    kind: 'profile';
    name: string;
    purpose: Purpose;
    separator: ';' | ',' | '\t';
    decimalSeparator: ',' | '.';
    dateFormat: 'iso' | 'de' | 'excel';
    basis: 'net' | 'gross' | 'unknown';
    columnMap: Partial<Record<ImportField, number>>;
    mappings: Array<{
        externalCode: string;
        productId: string;
        factor: number;
        unit?: string;
    }>;
    activeStatuses: string[];
    cancelledStatuses: string[];
    refundStatuses: string[];
    defaultStatus?: 'active';
}
export interface SystemRow {
    externalId: string;
    productId: string;
    name: string;
    quantity: number;
    date: string;
    status: 'active' | 'cancelled' | 'refund';
    amount: number | null;
}
export interface SystemImport extends Base {
    kind: 'system';
    replacesId?: string;
    name: string;
    area: Area;
    purpose: Purpose;
    sourceId: string;
    from: string;
    to: string;
    fileHash: string;
    canonicalKey: string;
    basis: 'net' | 'gross' | 'unknown';
    currency: string;
    rows: SystemRow[];
    recipes: Recipe[];
}
export interface BillLink extends Base { kind:'billLink'; billId:string; area:Area; orderIds:string[]; reason:string }
export interface AllocationLedger extends Base {kind:'allocation';area:Area;entries:Array<{planId:string;articleId:string;date:string;stockUse:number;incomingUse:number}>}
export type WwDocument = AllocationLedger | BillLink | Slot | Rule | Template | PriceList | Recipe | Plan | Movement | Bill | Profile | SystemImport;
export interface WwState {
    ready: boolean;
    records: Stored<WwDocument>[];
}
export const immutableKinds = new Set<WwDocument['kind']>(['prices', 'recipe', 'bill', 'movement', 'system', 'billLink']);
export function documents<T extends WwDocument['kind']>(state: WwState | undefined, kind: T): Array<Extract<WwDocument, {
    kind: T;
}>> { return (state?.records || []).map(r => r.value).filter((r): r is Extract<WwDocument, {
    kind: T;
}> => r.kind === kind); }
