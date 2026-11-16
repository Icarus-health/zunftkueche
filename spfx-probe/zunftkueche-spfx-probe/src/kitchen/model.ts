/* eslint-disable @rushstack/no-new-null -- Null is the persisted, explicit unknown value in the approved data model. */
/** Einsatzbereiche einer Saison. Neue Bereiche nur hier ergänzen, alle Prüfungen lesen diese Liste. */
export const AREAS = ['Küche', 'Zunftscheuer', 'Marktplatz'] as const;
export type Area = (typeof AREAS)[number];
export function isArea(value: unknown): value is Area {
  return (AREAS as readonly unknown[]).includes(value);
}
/** Auswahlliste für Bereichsfelder. */
export const areaOptions = (): Array<[Area, Area]> => AREAS.map(area => [area, area]);
export type Method = 'Telefon' | 'E-Mail' | 'Onlineshop' | 'Abholung';
export interface Season {
  id: string;
  name: string;
  year: number;
  archived: boolean;
  operatingDays?: string[];
  deliveryPlaces?: string[];
  storagePlaces?: string[];
  units?: string[];
  contact?: string;
  copyDates?: Record<string, string>;
}
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  method: Method;
  customerNumber: string;
  note: string;
  active: boolean;
  contactPerson?: string;
  address?: string;
  reviewStatus?: 'offen' | 'geprueft';
  reviewDate?: string;
  reviewReason?: string;
}
export interface Article {
  id: string;
  name: string;
  unit: string;
  category: string;
  active: boolean;
  unavailableSeasons?: string[];
  storagePlace?: string;
}
export interface Offer {
  id: string;
  articleId: string;
  supplierId: string;
  code: string;
  packName: string;
  packSize: number;
  priceNet: number | null;
  priceDate: string | null;
  deposit: number | null;
  note: string;
  active: boolean;
  priceStatus?: 'offen' | 'angefragt' | 'erhalten' | 'geprueft';
}
export interface Delivery {
  id: string;
  date: string | null;
  time: string;
  place: string;
}
export interface PlanContribution {
  planId: string;
  articleId: string;
  stockUse: number;
  incomingUse: number;
}
export interface OrderLine {
  id: string;
  articleId: string;
  offerId: string;
  articleName: string;
  code: string;
  unit: string;
  packName: string;
  packSize: number;
  quantity: number | null;
  priceNet: number | null;
  priorPriceNet: number | null;
  priceYear: number | null;
  reviewed: boolean;
  schedule?: Record<string, number | null>;
  sources?: Array<{ planId: string; deliveryId: string; quantity: number }>;
}
export interface Receipt {
  deliveryId?: string;
  id: string;
  receivedAt: string;
  receivedBy: string;
  note: string;
  lines: Array<{ lineId: string; quantity: number }>;
}
export interface DeliveryNote {
  id: string;
  deliveryId?: string;
  recordedAt: string;
  recordedBy: string;
  note: string;
}
export interface Order {
  id: string;
  seasonId: string;
  area: Area;
  supplierId: string;
  supplierName: string;
  status: 'Entwurf' | 'Bestellt' | 'Abgeschlossen' | 'Storniert';
  occasion: string;
  deliveryDate: string | null;
  method: Method;
  note: string;
  sourceId: string | null;
  sourceYear: number | null;
  recordedBy: string | null;
  recordedAt: string | null;
  lines: OrderLine[];
  receipts?: Receipt[];
  deliveryNotes?: DeliveryNote[];
  deliveries?: Delivery[];
  supplierNote?: string;
  contributions?: PlanContribution[];
}
export interface Count {
  id: string;
  seasonId: string;
  area: Area;
  articleId: string;
  articleName: string;
  unit: string;
  quantity: number;
  countedAt: string;
  countedBy: string;
  note: string;
  reorder: boolean;
  surplus?: boolean;
}
export interface InventoryLine {
  articleId: string;
  articleName: string;
  unit: string;
  packName: string;
  packSize: number;
  packs: number | null;
  loose: number | null;
  assessment: 'ok' | 'reorder' | 'surplus';
  note: string;
  countedAt?: string;
  countedBy?: string;
}
export interface InventorySession {
  id: string;
  seasonId: string;
  area: Area;
  status: 'Entwurf' | 'Abgeschlossen';
  createdAt: string;
  completedAt: string | null;
  countedBy: string;
  lines: InventoryLine[];
}
export interface EntityMap {
  seasons: Season;
  suppliers: Supplier;
  articles: Article;
  offers: Offer;
  counts: Count;
}
export type MasterKind = keyof EntityMap;
export type Master = EntityMap[MasterKind];
export interface Stored<T> {
  itemId: number;
  etag: string;
  operationId: string;
  value: T;
}
export interface Catalog {
  seasons: Season[];
  suppliers: Supplier[];
  articles: Article[];
  offers: Offer[];
}
export interface Workspace {
  ww?: import('./ww/model').WwState;
  seasons: Stored<Season>[];
  suppliers: Stored<Supplier>[];
  articles: Stored<Article>[];
  offers: Stored<Offer>[];
  orders: Stored<Order>[];
  counts: Stored<Count>[];
  inventories?: Stored<InventorySession>[];
  inventoriesReady?: boolean;
}
export const METHODS: Method[] = ['Telefon', 'E-Mail', 'Onlineshop', 'Abholung'];
export function catalog(state: Workspace): Catalog {
  return {
    seasons: state.seasons.map(x => x.value),
    suppliers: state.suppliers.map(x => x.value),
    articles: state.articles.map(x => x.value),
    offers: state.offers.map(x => x.value)
  };
}

/** A missing seasonal setting preserves the legacy availability. */
export function articleAvailable(article: Article, seasonId: string): boolean {
  return article.active && !(article.unavailableSeasons || []).includes(seasonId);
}
