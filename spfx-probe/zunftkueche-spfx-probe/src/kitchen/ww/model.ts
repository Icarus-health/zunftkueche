/* eslint-disable @rushstack/no-new-null -- Unknown business values are explicit in stored documents. */
import type { Area, Stored } from '../model';
import type { SlipExtension } from '../delivery-slip';
import type { InboxSource } from './inbox';
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
  cutoffTime?: string;
  deadlineOverrides?: Record<string, string>;
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
  materials?: Array<{ articleId: string; quantity: number; unit: string }>;
  note: string;
}
export interface EquipmentItem extends Base {
  kind: 'equipment';
  area: Area;
  name: string;
  needed: number;
  available: number | null;
  action: 'prüfen' | 'besorgen' | 'ausleihen';
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
export type BillType = 'invoice' | 'credit';
export const billLineRoles = ['goods', 'return', 'deposit', 'discount', 'expense', 'open'] as const;
export type BillLineRole = (typeof billLineRoles)[number];
export const billLineLabels: Record<BillLineRole, string> = {
  goods: 'Ware',
  return: 'Warenrückgabe',
  deposit: 'Pfand',
  discount: 'Rabatt',
  expense: 'Nebenkosten',
  open: 'Art offen'
};
export interface BillLine {
  role?: BillLineRole;
  id: string;
  articleId: string | null;
  name: string;
  quantity: number | null;
  unit: string;
  unitNet: number | null;
  totalNet: number | null;
  taxRate: number | null;
}
export type BillCostAssignment =
  | { mode: 'open' }
  | {
      mode: 'split';
      kitchen: number;
      scheuer: number;
      /** Fehlt bei Belegen vor 1.21; dann 0. */
      market?: number;
      other: number;
    };
export interface BillRelations {
  costAssignment?: BillCostAssignment | null;
  creditForId?: string;
  returnIds?: string[];
}
export interface Bill extends Base, BillRelations {
  billType?: BillType;
  needsSeparateFiles?: true;
  scanNumberReview?: { status: 'open' } | { status: 'reviewed'; reason: string; by: string; at: string };
  kind: 'bill';
  sourceFile?: InboxSource;
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
export const importPurposes = ['sales', 'payments', 'menuOrders'] as const;
export type Purpose = (typeof importPurposes)[number];
export const purposeLabels: Record<Purpose, string> = {
  sales: 'Artikelverkäufe',
  payments: 'Zahlungen',
  menuOrders: 'Menüvorbestellungen'
};
export type ImportField =
  | 'externalId'
  | 'productCode'
  | 'productName'
  | 'quantity'
  | 'unit'
  | 'date'
  | 'status'
  | 'amount'
  | 'currency'
  | 'paymentMethod';
export interface Profile extends Base {
  kind: 'profile';
  name: string;
  purpose: Purpose;
  separator: ';' | ',' | '\t';
  decimalSeparator: ',' | '.';
  dateFormat: 'iso' | 'de' | 'excel';
  basis: 'net' | 'gross' | 'unknown';
  columnMap: Partial<Record<ImportField, number>>;
  columnHeaders?: Partial<Record<ImportField, string>>;
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
export interface PaymentRow {
  externalId: string;
  paymentMethod: string;
  date: string | null;
  status: SystemRow['status'];
  amount: number;
}
export type ImportRow = SystemRow | PaymentRow;
interface SystemImportBase extends Base {
  kind: 'system';
  sourceFile?: InboxSource;
  attachment?: string;
  originalExtension?: 'csv' | 'xlsx';
  replacesId?: string;
  name: string;
  area: Area;
  sourceId: string;
  from: string;
  to: string;
  fileHash: string;
  canonicalKey: string;
  basis: 'net' | 'gross' | 'unknown';
  currency: string;
}
export type SystemImport = SystemImportBase &
  (
    | { purpose: 'sales' | 'menuOrders'; rows: SystemRow[]; recipes: Recipe[] }
    | { purpose: 'payments'; rows: PaymentRow[]; recipes: []; basis: 'unknown' }
  );
export interface BillLink extends Base, BillRelations {
  kind: 'billLink';
  billId: string;
  area: Area;
  orderIds: string[];
  reason: string;
}
export interface AllocationLedger extends Base {
  kind: 'allocation';
  area: Area;
  entries: Array<{ planId: string; articleId: string; date: string; stockUse: number; incomingUse: number }>;
}
export interface DeliverySlip extends Base {
  kind: 'deliverySlip';
  area: Area;
  orderId: string;
  deliveryId?: string;
  name: string;
  fileHash: string;
  extension: SlipExtension;
  attachment?: string;
}
export type WwDocument =
  | DeliverySlip
  | AllocationLedger
  | BillLink
  | Slot
  | Rule
  | Template
  | PriceList
  | Recipe
  | Plan
  | EquipmentItem
  | Movement
  | Bill
  | Profile
  | SystemImport;
export interface WwState {
  ready: boolean;
  records: Stored<WwDocument>[];
}
export const immutableKinds = new Set<WwDocument['kind']>([
  'prices',
  'recipe',
  'bill',
  'movement',
  'system',
  'billLink',
  'deliverySlip'
]);
export function withOriginal(value: { kind: string }): value is Bill | SystemImport | DeliverySlip {
  return value.kind === 'bill' || value.kind === 'system' || value.kind === 'deliverySlip';
}
export function documents<T extends WwDocument['kind']>(
  state: WwState | undefined,
  kind: T
): Array<
  Extract<
    WwDocument,
    {
      kind: T;
    }
  >
> {
  return (state?.records || [])
    .map(r => r.value)
    .filter(
      (
        r
      ): r is Extract<
        WwDocument,
        {
          kind: T;
        }
      > => r.kind === kind
    );
}
