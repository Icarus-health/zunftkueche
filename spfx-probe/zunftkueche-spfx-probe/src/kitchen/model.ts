/* eslint-disable @rushstack/no-new-null -- Null is the persisted, explicit unknown value in the approved data model. */
export type Area = 'Küche' | 'Zunftscheuer';
export type Method = 'Telefon' | 'E-Mail' | 'Onlineshop' | 'Abholung';
export interface Season { id: string; name: string; year: number; archived: boolean }
export interface Supplier { id: string; name: string; phone: string; email: string; method: Method; customerNumber: string; note: string; active: boolean }
export interface Article { id: string; name: string; unit: string; category: string; active: boolean }
export interface Offer { id: string; articleId: string; supplierId: string; code: string; packName: string; packSize: number; priceNet: number | null; priceDate: string | null; deposit: number | null; note: string; active: boolean }
export interface OrderLine { id: string; articleId: string; offerId: string; articleName: string; code: string; unit: string; packName: string; packSize: number; quantity: number | null; priceNet: number | null; priorPriceNet: number | null; priceYear: number | null; reviewed: boolean }
export interface Receipt { id: string; receivedAt: string; receivedBy: string; note: string; lines: Array<{lineId: string; quantity: number}> }
export interface Order { id: string; seasonId: string; area: Area; supplierId: string; supplierName: string; status: 'Entwurf' | 'Bestellt' | 'Abgeschlossen' | 'Storniert'; occasion: string; deliveryDate: string | null; method: Method; note: string; sourceId: string | null; sourceYear: number | null; recordedBy: string | null; recordedAt: string | null; lines: OrderLine[]; receipts?: Receipt[] }
export interface Count { id: string; seasonId: string; area: Area; articleId: string; articleName: string; unit: string; quantity: number; countedAt: string; countedBy: string; note: string; reorder: boolean; surplus?: boolean }
export interface InventoryLine { articleId: string; articleName: string; unit: string; packName: string; packSize: number; packs: number | null; loose: number | null; assessment: 'ok' | 'reorder' | 'surplus'; note: string }
export interface InventorySession { id: string; seasonId: string; area: Area; status: 'Entwurf' | 'Abgeschlossen'; createdAt: string; completedAt: string | null; countedBy: string; lines: InventoryLine[] }
export interface EntityMap { seasons: Season; suppliers: Supplier; articles: Article; offers: Offer; counts: Count }
export type MasterKind = keyof EntityMap;
export type Master = EntityMap[MasterKind];
export interface Stored<T> { itemId: number; etag: string; operationId: string; value: T }
export interface Catalog { seasons: Season[]; suppliers: Supplier[]; articles: Article[]; offers: Offer[] }
export interface Workspace { seasons: Stored<Season>[]; suppliers: Stored<Supplier>[]; articles: Stored<Article>[]; offers: Stored<Offer>[]; orders: Stored<Order>[]; counts: Stored<Count>[]; inventories?: Stored<InventorySession>[]; inventoriesReady?: boolean }
export const METHODS: Method[] = ['Telefon', 'E-Mail', 'Onlineshop', 'Abholung'];
export function catalog(state: Workspace): Catalog { return { seasons: state.seasons.map(x => x.value), suppliers: state.suppliers.map(x => x.value), articles: state.articles.map(x => x.value), offers: state.offers.map(x => x.value) }; }
