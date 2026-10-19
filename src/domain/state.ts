import {buildClosureChecklist} from './event-close.ts';
import { movementQuantity, salePrice, receiptSnapshot } from "./corrections.ts";
import type { ValueCorrection, AuditEntry } from "./corrections.ts";
import { nextOrderStatus } from "./order-status.ts";
import {
  requireActiveLocation,
  requirePurchasingLocation,
  requireReceiptLocation,
} from "./locations.ts";
import { prepareOrder, recipeCost } from "./kitchen.ts";
import type { PlanLine, Source } from "./kitchen.ts";
import { purchasingNeeds } from "./workflow.ts";
export interface Supplier {
  id: string;
  name: string;
  email: string | null;
}
export interface Article {
  id: string;
  name: string;
  supplierId: string;
  unit: string;
  category: string;
  unitPriceCents: number | null;
  packSize?: number | null;
  previousUnitPriceCents?: number | null;
  priceReferenceYear?: number;
}
export interface Menu {
  id: string;
  name: string;
  priceCents: number | null;
  category: string;
  recipe: Array<{ articleId: string; quantity: number | null }>;
  recipeStatus: string;
  supplyMode?: "direct" | "variants" | "manual";
  source?: Source;
}
export interface ReceiptLine {
  articleId?: string;
  name: string;
  quantity: number | null;
  unit: string;
  netCents: number | null;
}
export interface Receipt {
  id: string;
  supplierId: string;
  number: string;
  date?: string | null;
  grossCents: number | null;
  netCents: number | null;
  scope: string;
  status: string;
  documentUrl: string | null;
  source?: Source;
  lines: ReceiptLine[];
  sourceBaseline?: ReceiptSnapshot;
  corrected?: boolean;
  corrections?: Array<
    AuditEntry & {
      operationId: string;
      revision: number;
      before: ReceiptSnapshot;
      after?: ReceiptSnapshot;
      reason?: string;
    }
  >;
}
export type ReceiptSnapshot = Omit<
  Receipt,
  "sourceBaseline" | "corrected" | "corrections"
>;
export interface DishPlan {
  id: string;
  menuId: string;
  day: string;
  quantity: number | null;
}
export interface EconomicEvidence extends AuditEntry {
  operationId: string;
  revision: number;
  eventId: string;
  scope: string;
  sourceRevision: number;
  netRevenueCents: number;
  netConsumptionCents: number;
  sourceReason: string;
  valuationReason: string;
}
export interface KitchenState {
  schemaVersion: number;
  event: {
    id: string;
    name: string;
    year: number;
    status: string;
    dates: Record<string, string | null>;
    deliveryAddress?: string;
    contact?: string;
    purchasingLocation?: string | null;
    locations?: Array<{ name: string; historicalNames: string[] }>;
  };
  suppliers: Supplier[];
  articles: Article[];
  planLines: (PlanLine & { location?: string })[];
  menu: Menu[];
  invoices: Receipt[];
  sales: Array<{
    id: string;
    menuId: string;
    day: string;
    quantity: number | null;
    priceCents: number | null;
  }>;
  movements: Array<{
    id: string;
    articleId: string;
    day: string;
    type: string;
    quantity: number;
    location: string;
    note?: string;
    orderId?: string;
    orderLineId?: string;
    substitutionConfirmed?: boolean;
  }>;
  orders: any[];
  movementCorrections?: ValueCorrection[];
  salePriceCorrections?: ValueCorrection[];
  dishPlan: DishPlan[];
  lessons: any[];
  economicEvidence?: EconomicEvidence[];
  closureHistory?: Array<AuditEntry & {operationId:string;revision:number;action:"close"|"reopen";reason:string;snapshot?:ReturnType<typeof buildClosureChecklist>}>;
  sourceNotice: string;
  revision: number;
  operationIds: string[];
  operationRequests?: Record<string, string>;
  archivedEvents?: EventArchive[];
}
export type EventArchive = Omit<
  KitchenState,
  "archivedEvents" | "revision" | "operationIds" | "operationRequests"
>;
export interface Operation {
  targetEventId?: string;
  id: string;
  baseRevision: number;
  type: string;
  payload: any;
}
export interface CommitResult {
  status: "saved" | "conflict";
  state: KitchenState;
}
function quantity(value: unknown, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 10000000
  )
    throw new Error("Menge ist ungültig.");
  if (
    value !== 0 &&
    (value < 0.0001 ||
      Math.abs(value * 10000 - Math.round(value * 10000)) > 1e-5)
  )
    throw new Error("Menge erlaubt höchstens vier Nachkommastellen.");
  return value;
}
function validDay(day: unknown): string {
  if (
    typeof day !== "string" ||
    !["Mittwoch", "Freitag", "Samstag", "Sonntag", "Allgemein"].includes(day)
  )
    throw new Error("Tag ist ungültig.");
  return day;
}
function text(
  value: unknown,
  label: string,
  max = 200,
  optional = false,
): string {
  if (optional && (value === undefined || value === null)) return "";
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!optional && !value.trim())
  )
    throw new Error(`${label} ist ungültig.`);
  return value.trim();
}
function money(value: unknown, precise = false): number | null {
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100000000 ||
    Math.abs(
      value * (precise ? 100 : 1) - Math.round(value * (precise ? 100 : 1)),
    ) > 1e-6
  )
    throw new Error("Preis ist ungültig.");
  if (value !== 0 && value < (precise ? 0.01 : 1))
    throw new Error("Preis ist ungültig.");
  return value;
}
function date(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error("Datum ist ungültig.");
  return value;
}
function sharepoint(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const url = new URL(text(value, "Link", 2048));
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".sharepoint.com") ||
    url.username ||
    url.password
  )
    throw new Error("Bitte einen Link aus eurem SharePoint verwenden.");
  return url.href;
}
function archive(state: KitchenState): EventArchive {
  const {
    archivedEvents: _archives,
    revision: _revision,
    operationIds: _ids,
    operationRequests: _requests,
    ...snapshot
  } = structuredClone(state);
  return snapshot;
}
function economicFacts(
  receipt: Pick<
    Receipt,
    "supplierId" | "number" | "date" | "grossCents" | "netCents" | "lines"
  >,
): string {
  return JSON.stringify([
    receipt.supplierId,
    receipt.number,
    receipt.date ?? null,
    receipt.grossCents,
    receipt.netCents,
    receipt.lines.map((l) => [
      l.articleId ?? null,
      l.name,
      l.quantity,
      l.unit,
      l.netCents,
    ]),
  ]);
}
function preserveReceiptHistory(receipt: Receipt, op: Operation): void {
  const {
    sourceBaseline: _baseline,
    corrected: _corrected,
    corrections: _history,
    ...before
  } = structuredClone(receipt);
  receipt.sourceBaseline ??= structuredClone(before);
  receipt.corrections = [
    ...(receipt.corrections ?? []),
    {
      operationId: op.id,
      revision: op.baseRevision + 1,
      before,
      reason: text(op.payload.reason, "Korrekturgrund", 1000),
    },
  ];
  receipt.corrected = true;
}
function requestSignature(op: Operation): string {
  const canonical = (value: any, depth = 0): any => {
    if (depth > 20) throw new Error("Vorgang ist zu umfangreich.");
    if (Array.isArray(value)) return value.map((v) => canonical(v, depth + 1));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, canonical(value[k], depth + 1)]),
      );
    return value;
  };
  const result = JSON.stringify(
    canonical({
      type: op.type,
      payload: op.payload,
      ...(op.targetEventId ? { targetEventId: op.targetEventId } : {}),
    }),
  );
  if (result.length > 50000) throw new Error("Vorgang ist zu umfangreich.");
  return result;
}
export function applyOperation(
  state: KitchenState,
  op: Operation,
): CommitResult {
  if (
    typeof op.id !== "string" ||
    !op.id.trim() ||
    op.id.length > 100 ||
    !Number.isInteger(op.baseRevision) ||
    op.baseRevision < 0 ||
    !op.payload ||
    typeof op.payload !== "object"
  )
    throw new Error("Vorgang ist ungültig.");
  const signature = requestSignature(op);
  if ((state.operationIds ?? []).includes(op.id)) {
    if (
      Object.hasOwn(state.operationRequests ?? {}, op.id) &&
      state.operationRequests![op.id] !== signature
    )
      throw new Error("Vorgangs-ID wurde bereits für andere Daten verwendet.");
    return { status: "saved", state };
  }
  if (op.baseRevision !== (state.revision ?? 0))
    return { status: "conflict", state };
  const next = structuredClone(state),
    p = structuredClone(op.payload);
  if (state.event.status === "Abgeschlossen" && !["event.reopen","event.create"].includes(op.type)) throw new Error("Veranstaltung ist abgeschlossen. Zuerst mit Grund wieder öffnen.");
  switch (op.type) {
    case "supplier.save": {
      const id = p.id === undefined ? op.id : text(p.id, "ID", 100),
        name = text(p.name, "Name");
      const email = text(p.email, "E-Mail", 254, true) || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("E-Mail ist ungültig.");
      const item = next.suppliers.find((s) => s.id === id);
      if (item) Object.assign(item, { name, email });
      else next.suppliers.push({ id, name, email });
      break;
    }
    case "article.save": {
      const id = p.id === undefined ? op.id : text(p.id, "ID", 100);
      if (!next.suppliers.some((s) => s.id === p.supplierId))
        throw new Error("Lieferant nicht gefunden.");
      const packSize =
        p.packSize === null || p.packSize === undefined
          ? null
          : quantity(p.packSize);
      if (packSize === 0) throw new Error("Gebindegröße muss positiv sein.");
      const values = {
        name: text(p.name, "Name"),
        supplierId: p.supplierId,
        unit: text(p.unit, "Einheit", 50),
        category: text(p.category, "Kategorie", 100),
        packSize,
        unitPriceCents: money(p.unitPriceCents, true),
      };
      const item = next.articles.find((a) => a.id === id);
      const referenced =
        next.menu.some((m) => m.recipe.some((l) => l.articleId === id)) ||
        next.planLines.some((l) => l.articleId === id) ||
        next.movements.some((m) => m.articleId === id) ||
        next.invoices.some((i) => i.lines.some((l) => l.articleId === id)) ||
        next.orders.some((o) =>
          (o.lines ?? []).some((l: PlanLine) => l.articleId === id),
        );
      if (
        item &&
        referenced &&
        (item.unit !== values.unit || item.supplierId !== values.supplierId)
      )
        throw new Error(
          "Einheit oder Lieferant eines verwendeten Artikels kann nicht geändert werden. Bitte einen neuen Artikel anlegen.",
        );
      if (item) Object.assign(item, values);
      else next.articles.push({ id, ...values });
      for (const line of next.planLines)
        if (line.articleId === id) line.unitPriceCents = values.unitPriceCents;
      break;
    }
    case "menu.save": {
      const id = p.id === undefined ? op.id : text(p.id, "ID", 100),
        values = {
          name: text(p.name, "Name"),
          category: text(p.category, "Kategorie", 100),
          priceCents: money(p.priceCents),
        };
      const item = next.menu.find((m) => m.id === id);
      if (item) Object.assign(item, values);
      else
        next.menu.push({ id, ...values, recipe: [], recipeStatus: "Entwurf" });
      break;
    }
    case "dish.quantity": {
      if (!next.menu.some((m) => m.id === p.menuId))
        throw new Error("Speise/Getränk nicht gefunden.");
      const day = validDay(p.day);
      if (!["Freitag", "Samstag"].includes(day))
        throw new Error("Speisentag ist ungültig.");
      const q = quantity(p.quantity, true);
      if (q !== null && !Number.isInteger(q))
        throw new Error("Speisenmenge muss ganzzahlig sein.");
      next.dishPlan ??= [];
      const item = next.dishPlan.find(
        (d) => d.menuId === p.menuId && d.day === day,
      );
      if (item) item.quantity = q;
      else
        next.dishPlan.push({ id: op.id, menuId: p.menuId, day, quantity: q });
      break;
    }
    case "dish.fillMissing": {
      if (p.quantity !== 0)
        throw new Error(
          "Übrige Speisen können nur ausdrücklich mit 0 erfasst werden.",
        );
      next.dishPlan ??= [];
      for (const menu of next.menu)
        for (const day of ["Freitag", "Samstag"]) {
          const item = next.dishPlan.find(
            (d) => d.menuId === menu.id && d.day === day,
          );
          if (item && item.quantity === null) item.quantity = 0;
          else if (!item)
            next.dishPlan.push({
              id: `${op.id}:${menu.id}:${day}`,
              menuId: menu.id,
              day,
              quantity: 0,
            });
        }
      break;
    }
    case "event.create": {
      const name = text(p.name, "Veranstaltungsname");
      if (
        !Number.isInteger(p.year) ||
        p.year < 1900 ||
        p.year > 2200 ||
        typeof p.copyPlan !== "boolean"
      )
        throw new Error("Veranstaltung ist ungültig.");
      if (
        next.event.id === op.id ||
        next.archivedEvents?.some((a) => a.event.id === op.id)
      )
        throw new Error("Veranstaltungs-ID ist bereits vorhanden.");
      const prior = archive(next);
      next.archivedEvents = [
        ...(next.archivedEvents ?? []).filter(
          (a) => a.event.id !== prior.event.id,
        ),
        prior,
      ];
      next.event = {
        id: op.id,
        name,
        year: p.year,
        status: "Planung",
        dates: {},
      };
      next.sales = [];
      next.movementCorrections = [];
      next.salePriceCorrections = [];
      next.movements = [];
      next.invoices = [];
      next.orders = [];
      next.lessons = [];
      next.closureHistory = [];
      next.economicEvidence = [];
      next.sourceNotice = `Stammdaten und Rezepturen aus ${prior.event.year} übernommen; Einkaufspreise für diese Veranstaltung bitte bestätigen.`;
      next.planLines = p.copyPlan
        ? next.planLines.map((l) => ({
            ...l,
            id: `${op.id}:${l.id}`,
            purchaseGenerated: false,
            unitPriceCents: null,
          }))
        : [];
      next.dishPlan = p.copyPlan
        ? (next.dishPlan ?? []).map((d) => ({ ...d, id: `${op.id}:${d.id}` }))
        : [];
      next.articles = next.articles.map((a) => ({
        ...a,
        previousUnitPriceCents: a.unitPriceCents,
        priceReferenceYear: prior.event.year,
        unitPriceCents: null,
      }));
      break;
    }
    case "event.switch": {
      if (p.id === next.event.id) break;
      const target = next.archivedEvents?.find((a) => a.event.id === p.id);
      if (!target) throw new Error("Veranstaltung nicht gefunden.");
      const archives = [
        ...(next.archivedEvents ?? []).filter(
          (a) => a.event.id !== p.id && a.event.id !== next.event.id,
        ),
        archive(next),
      ];
      Object.assign(next, structuredClone(target));
      next.archivedEvents = archives;
      break;
    }
    case "event.settings": {
      next.event.name = text(p.name, "Veranstaltungsname");
      if (!Number.isInteger(p.year) || p.year < 1900 || p.year > 2200)
        throw new Error("Jahr ist ungültig.");
      next.event.year = p.year;
      next.event.deliveryAddress = text(
        p.deliveryAddress,
        "Lieferadresse",
        1000,
        true,
      );
      next.event.contact = text(p.contact, "Ansprechpartner", 200, true);
      if (!Array.isArray(p.locations) || p.locations.length > 100)
        throw new Error("Orte sind ungültig.");
      const names = new Set<string>(),
        aliases = new Set<string>();
      const historical = new Set(
        [
          ...next.planLines.map((l) => l.location),
          ...next.movements.map((l) => l.location),
          ...next.invoices.map((l) => l.scope),
        ].filter(Boolean),
      );
      next.event.locations = p.locations.map((l: any) => {
        const name = text(l.name, "Ort", 100);
        if (names.has(name) || !Array.isArray(l.historicalNames))
          throw new Error("Orte sind nicht eindeutig.");
        names.add(name);
        const historicalNames = l.historicalNames.map((raw: unknown) => {
          const v = text(raw, "Historischer Ort", 100);
          if (aliases.has(v) || !historical.has(v))
            throw new Error("Historische Zuordnung ist ungültig.");
          aliases.add(v);
          return v;
        });
        return { name, historicalNames };
      });
      for (const location of next.event.locations!)
        if (
          location.historicalNames.some(
            (alias) => alias !== location.name && names.has(alias),
          )
        )
          throw new Error(
            "Historischer Ort ist zugleich ein anderer aktiver Ort.",
          );
      if (Object.hasOwn(p, "purchasingLocation"))
        next.event.purchasingLocation =
          p.purchasingLocation === null
            ? null
            : text(p.purchasingLocation, "Ort", 100);
      if (
        next.event.purchasingLocation != null &&
        !names.has(next.event.purchasingLocation)
      )
        throw new Error("Der Ort für die Küchenplanung muss aktiv sein.");
      // Dates share the same validation as the existing date editor.
    }
    case "event.dates": {
      if (
        !p.dates ||
        typeof p.dates !== "object" ||
        Array.isArray(p.dates) ||
        Object.keys(p.dates).length > 5
      )
        throw new Error("Termine sind ungültig.");
      for (const [day, value] of Object.entries(p.dates))
        next.event.dates[validDay(day)] = date(value);
      break;
    }
    case "delivery.accept": {
      const order = next.orders.find(order => order.id === p.orderId);
      if (!order) throw new Error("Bestellfassung nicht gefunden.");
      const day = validDay(p.day);
      const location = requireActiveLocation(next, text(p.location, "Ort", 100));
      const note = text(p.note, "Abweichungsnotiz", 1000, true);
      if (!Array.isArray(p.lines) || !p.lines.length || p.lines.length > 200
        || new Set(p.lines.map((line: { lineId: string }) => line.lineId)).size !== p.lines.length)
        throw new Error("Annahmepositionen sind ungültig.");
      for (const [index, accepted] of p.lines.entries()) {
        const line = order.lines.find((line: PlanLine) => line.id === accepted.lineId);
        const article = next.articles.find(article => article.id === accepted.articleId);
        if (!line || !article || line.unit !== article.unit)
          throw new Error("Bestellposition oder passende Artikeleinheit fehlt.");
        const received = quantity(accepted.quantity)!;
        const substitute = line.articleId !== article.id;
        if (substitute && (accepted.substitutionConfirmed !== true || !note))
          throw new Error("Ersatzartikel ausdrücklich mit Notiz bestätigen.");
        next.movements.push({
          id: `${op.id}:${index}`, articleId: article.id, day, type: "Lieferung", quantity: received,
          location, note, orderId: order.id, orderLineId: line.id, substitutionConfirmed: substitute,
        });
      }
      break;
    }
    case "plan.allocationQuantity": {
      const parent = next.planLines.find(line => line.allocations?.some(
        (_, index) => `${line.id}:allocation:${index}` === p.id));
      const index = parent?.allocations?.findIndex(
        (_, index) => `${parent.id}:allocation:${index}` === p.id) ?? -1;
      if (!parent || index < 0) throw new Error("Lieferverteilung nicht gefunden.");
      parent.allocations![index].quantity = quantity(p.quantity)!;
      parent.purchaseGenerated = false;
      parent.purchaseForWeekend = true;
      break;
    }
    case "plan.allocate": {
      const line = next.planLines.find(line => line.id === p.id);
      if (!line || !Array.isArray(p.allocations) || p.allocations.length > 20)
        throw new Error("Lieferverteilung ist ungültig.");
      line.allocations = p.allocations.map((allocation: { day: unknown; time: unknown; quantity: unknown }) => {
        const day = validDay(allocation.day);
        const time = text(allocation.time, "Lieferzeit", 5, true) || null;
        if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Lieferzeit ist ungültig.");
        return { day, time, quantity: quantity(allocation.quantity)! };
      });
      line.purchaseGenerated = false;
      line.purchaseForWeekend = true;
      break;
    }
    case "drink.configure": {
      const item = next.menu.find(menu => menu.id === p.menuId);
      if (!item || !["direct", "variants", "manual"].includes(p.mode) || !Array.isArray(p.lines) || p.lines.length > 30)
        throw new Error("Getränkezuordnung ist ungültig.");
      const lines: Array<{ articleId: string; quantity: number }> = p.lines.map((line: { articleId: string; quantity: unknown }) => {
        if (!next.articles.some(article => article.id === line.articleId)) throw new Error("Artikel fehlt.");
        return { articleId: line.articleId, quantity: quantity(line.quantity)! };
      });
      if (new Set(lines.map(line => line.articleId)).size !== lines.length || lines.some(line => line.quantity <= 0))
        throw new Error("Getränkezuordnung ist ungültig.");
      const invalidManual = p.mode === 'manual' && lines.length > 0;
      const invalidDirect = p.mode === 'direct' && (lines.length !== 1 || lines[0].quantity !== 1);
      const invalidVariants = p.mode === 'variants'
        && (!lines.length || Math.abs(lines.reduce((sum, line) => sum + line.quantity, 0) - 1) > 0.00001);
      if (invalidManual || invalidDirect || invalidVariants)
        throw new Error("Direkt: ein Artikel je Stück. Varianten: bestätigte Anteile ergeben genau 1. Manuell: keine Ableitung.");
      item.supplyMode = p.mode;
      item.recipe = lines;
      item.recipeStatus = p.mode === 'manual' ? 'Manuell' : 'Bestätigt';
      break;
    }
    case "event.economics": {
      if (p.eventId !== state.event.id || p.revision !== state.revision)
        throw new Error("Bewertungsstand hat sich geändert.");
      const scope = text(p.scope, "Bewertungsumfang", 100);
      buildClosureChecklist(state, scope);
      const netRevenueCents = money(p.netRevenueCents);
      const netConsumptionCents = money(p.netConsumptionCents);
      if (netRevenueCents === null || netConsumptionCents === null)
        throw new Error("Bestätigte Nettowerte müssen bekannt sein.");
      (next.economicEvidence ??= []).push({
        operationId: op.id,
        revision: op.baseRevision + 1,
        eventId: state.event.id,
        scope,
        sourceRevision: state.revision,
        netRevenueCents,
        netConsumptionCents,
        sourceReason: text(p.sourceReason, "Quelle der Nettoerlöse", 1000),
        valuationReason: text(p.valuationReason, "Quelle und Verbrauchsbewertung", 1000),
      });
      break;
    }
    case "event.close": {
      if (p.eventId !== next.event.id || p.revision !== state.revision || state.event.status === 'Abgeschlossen')
        throw new Error("Abschlussstand hat sich geändert.");
      const reason = text(p.note, "Prüfnotiz", 1000);
      const snapshot = buildClosureChecklist(state, text(p.confirmedScope, "Umfang", 100));
      (next.closureHistory ??= []).push({ operationId: op.id, revision: op.baseRevision + 1, action: 'close', reason, snapshot });
      next.event.status = 'Abgeschlossen';
      break;
    }
    case "event.reopen": {
      if (p.eventId !== next.event.id || state.event.status !== 'Abgeschlossen')
        throw new Error("Veranstaltung ist nicht abgeschlossen.");
      (next.closureHistory ??= []).push({
        operationId: op.id, revision: op.baseRevision + 1, action: 'reopen', reason: text(p.reason, "Öffnungsgrund", 1000),
      });
      next.event.status = 'Offen';
      break;
    }
    case "lesson.add": {
      if (p.eventId !== next.event.id) throw new Error("Falsche Veranstaltung.");
      next.lessons.push({ id: op.id, note: text(p.text, "Erfahrung", 4000), operationId: op.id, revision: op.baseRevision + 1 });
      break;
    }
    case "purchase.apply": {
      if (p.day !== "Gesamt")
        throw new Error("Einkauf bitte gemeinsam unter Gesamt übernehmen.");
      const needs = purchasingNeeds(next, "Gesamt");
      if (!needs.complete) throw new Error("Einkaufsbedarf ist noch offen.");
      // Only derived lines are replaceable; all source/manual lines and snapshots survive.
      for (const row of needs.rows) {
        const article = next.articles.find((a) => a.id === row.articleId)!;
        const existing = next.planLines.find(
          (l) =>
            l.purchaseGenerated &&
            l.articleId === article.id &&
            l.day === "Allgemein",
        );
        const values = {
          articleId: article.id,
          supplierId: article.supplierId,
          name: article.name,
          quantity: row.suggested,
          unit: article.unit,
          day: "Allgemein",
          time: null,
          unitPriceCents: article.unitPriceCents,
          category: article.category,
          location: requirePurchasingLocation(next),
          purchaseGenerated: true,
          purchaseForWeekend: true,
        };
        if (existing) Object.assign(existing, values);
        else if (row.suggested !== 0)
          next.planLines.push({ id: `${op.id}:${article.id}`, ...values });
      }
      for (const line of next.planLines)
        if (
          line.purchaseGenerated &&
          line.day === "Allgemein" &&
          !needs.rows.some((r) => r.articleId === line.articleId)
        )
          line.quantity = 0;
      break;
    }
    case "movement.correct": {
      const original = next.movements.find((m) => m.id === p.movementId);
      if (!original) throw new Error("Buchung nicht gefunden.");
      const after = quantity(p.replacementQuantity)!;
      const before = movementQuantity(next, original);
      if (before === after) throw new Error("Menge ist unverändert.");
      (next.movementCorrections ??= []).push({
        operationId: op.id,
        revision: op.baseRevision + 1,
        targetId: original.id,
        before,
        after,
        reason: text(p.reason, "Korrekturgrund", 1000),
      });
      break;
    }
    case "sales.correctPrice": {
      const original = next.sales.find((s) => s.id === p.saleId);
      if (!original) throw new Error("Verkaufsposition nicht gefunden.");
      const after = money(p.priceCents);
      if (after === null)
        throw new Error("Berichtigter Preis muss bekannt sein.");
      const before = salePrice(next, original);
      if (before === after) throw new Error("Preis ist unverändert.");
      (next.salePriceCorrections ??= []).push({
        operationId: op.id,
        revision: op.baseRevision + 1,
        targetId: original.id,
        before,
        after,
        reason: text(p.reason, "Korrekturgrund", 1000),
      });
      break;
    }
    case "order.mark": {
      const order = next.orders.find((o) => o.id === p.orderId);
      if (!order) throw new Error("Bestellfassung nicht gefunden.");
      nextOrderStatus(order, p.status);
      (order.statusHistory ??= []).push({
        operationId: op.id,
        revision: op.baseRevision + 1,
        status: p.status,
        note: text(p.note, "Notiz", 1000, true),
      });
      order.status = p.status;
      break;
    }
    case "invoice.correct": {
      const existing = next.invoices.find((i) => i.id === p.invoiceId);
      if (!existing) throw new Error("Beleg nicht gefunden.");
      if (
        !p.changes ||
        typeof p.changes !== "object" ||
        Array.isArray(p.changes) ||
        Object.keys(p.changes).some(
          (k) =>
            ![
              "supplierId",
              "number",
              "date",
              "grossCents",
              "netCents",
              "scope",
              "documentUrl",
              "lines",
            ].includes(k),
        )
      )
        throw new Error("Belegänderung ist ungültig.");
      Object.assign(p, {
        ...receiptSnapshot(existing),
        ...p.changes,
        reason: text(p.reason, "Korrekturgrund", 1000),
      });
    }
    case "invoice.save":
    case "invoice.update": {
      const id = p.id === undefined ? op.id : text(p.id, "ID", 100),
        existing = next.invoices.find((i) => i.id === id);
      if (op.type === "invoice.update" && !existing)
        throw new Error("Beleg nicht gefunden.");
      if (!next.suppliers.some((s) => s.id === p.supplierId))
        throw new Error("Lieferant nicht gefunden.");
      const number = text(p.number, "Belegnummer", 100),
        grossCents = money(p.grossCents),
        netCents = money(p.netCents);
      if (grossCents !== null && netCents !== null && netCents > grossCents)
        throw new Error("Netto darf Brutto nicht übersteigen.");
      const sameIdentity =
        existing?.supplierId === p.supplierId &&
        existing?.number.trim().toLocaleLowerCase() ===
          number.toLocaleLowerCase();
      if (
        !sameIdentity &&
        next.invoices.some(
          (i) =>
            i.id !== id &&
            i.supplierId === p.supplierId &&
            i.number.trim().toLocaleLowerCase() === number.toLocaleLowerCase(),
        )
      )
        throw new Error(
          "Diese Belegnummer ist beim Lieferanten bereits vorhanden.",
        );
      const inputLines = p.lines ?? [];
      if (!Array.isArray(inputLines) || inputLines.length > 200)
        throw new Error("Belegpositionen sind ungültig.");
      const lines = inputLines.map((l: any): ReceiptLine => {
        if (!l || typeof l !== "object")
          throw new Error("Belegposition ist ungültig.");
        if (
          l.articleId &&
          !next.articles.some(
            (a) => a.id === l.articleId && a.supplierId === p.supplierId,
          )
        )
          throw new Error("Artikel gehört nicht zu diesem Lieferanten.");
        return {
          ...(l.articleId ? { articleId: l.articleId } : {}),
          name: text(l.name, "Positionsname"),
          quantity: quantity(l.quantity, true),
          unit: text(l.unit, "Einheit", 50),
          netCents: money(l.netCents),
        };
      });
      const values = {
        supplierId: p.supplierId,
        number,
        date: date(p.date),
        grossCents,
        netCents,
        scope: requireReceiptLocation(
          next,
          text(p.scope, "Zuordnung", 100),
          !!existing,
        ),
        documentUrl: sharepoint(p.documentUrl),
        lines,
      };
      if (existing) {
        const changedFacts = economicFacts(existing) !== economicFacts(values);
        const original =
          !!existing.source && existing.status === "Original vorhanden";
        if (original && changedFacts && op.type !== "invoice.correct")
          throw new Error(
            "Wirtschaftliche Angaben des Originalbelegs brauchen eine ausdrückliche Berichtigung mit Grund. Zuordnung und Dokumentlink können ergänzt werden.",
          );
        const changes =
          original && op.type !== "invoice.correct"
            ? { scope: values.scope, documentUrl: values.documentUrl }
            : values;
        const before = receiptSnapshot(existing);
        if (
          JSON.stringify(before) !== JSON.stringify({ ...before, ...changes })
        )
          preserveReceiptHistory(existing, op);
        Object.assign(existing, changes);
        const last = existing.corrections?.at(-1);
        if (last?.operationId === op.id) last.after = receiptSnapshot(existing);
      } else {
        const receipt: Receipt = { id, ...values, status: "Erfasst" };
        receipt.sourceBaseline = receiptSnapshot(receipt);
        next.invoices.push(receipt);
      }
      break;
    }
    case "plan.quantity": {
      const line = next.planLines.find((l) => l.id === p.id);
      if (!line) throw new Error("Planposition nicht gefunden.");
      line.quantity = quantity(p.quantity, true);
      // Explicit edits take ownership: a later calculation must preserve this amount.
      if (line.purchaseGenerated) {
        line.purchaseForWeekend = true;
        line.purchaseGenerated = false;
      }
      break;
    }
    case "plan.schedule": {
      const line = next.planLines.find((l) => l.id === p.id);
      if (!line) throw new Error("Planposition nicht gefunden.");
      const day = validDay(p.day),
        time = text(p.time, "Lieferzeit", 5, true) || null;
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        throw new Error("Lieferzeit ist ungültig.");
      line.day = day;
      line.time = time;
      if (p.note !== undefined) line.note = text(p.note, "Notiz", 1000, true);
      if (line.purchaseGenerated) {
        line.purchaseForWeekend = true;
        line.purchaseGenerated = false;
      }
      break;
    }
    case "plan.add": {
      const article = next.articles.find(
        (a) => a.id === p.articleId && a.supplierId === p.supplierId,
      );
      if (!article)
        throw new Error("Artikel gehört nicht zu diesem Lieferanten.");
      const day = validDay(p.day),
        time = text(p.time, "Lieferzeit", 5, true) || null;
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        throw new Error("Lieferzeit ist ungültig.");
      next.planLines.push({
        id: op.id,
        articleId: article.id,
        supplierId: article.supplierId,
        name: article.name,
        quantity: quantity(p.quantity, true),
        unit: article.unit,
        day,
        time,
        unitPriceCents: article.unitPriceCents,
        note: text(p.note, "Notiz", 1000, true),
        category: article.category,
        location: requirePurchasingLocation(next),
      });
      break;
    }
    case "menu.price":
    case "article.price": {
      const value = money(p.priceCents, op.type === "article.price");
      if (op.type === "menu.price") {
        const item = next.menu.find((m) => m.id === p.menuId);
        if (!item) throw new Error("Speise/Getränk nicht gefunden.");
        item.priceCents = value;
      } else {
        const item = next.articles.find((a) => a.id === p.articleId);
        if (!item) throw new Error("Artikel nicht gefunden.");
        item.unitPriceCents = value;
        for (const line of next.planLines)
          if (line.articleId === item.id) line.unitPriceCents = value;
      }
      break;
    }
    case "order.prepare": {
      const supplier = next.suppliers.find((s) => s.id === p.supplierId);
      if (!supplier) throw new Error("Lieferant nicht gefunden.");
      const day = validDay(p.day),
        snapshot = prepareOrder(next.planLines, p.supplierId, day);
      if (!snapshot.lines.length)
        throw new Error("Bestellung enthält keine Positionen.");
      if (snapshot.lines.some((l) => l.quantity === null))
        throw new Error("Bestellmengen sind noch offen.");
      const knownLines = snapshot.lines.filter(
          (l) => l.unitPriceCents !== null,
        ),
        knownTotal = recipeCost(knownLines).totalCents;
      if (knownLines.length && (knownTotal === null || knownTotal > 100000000))
        throw new Error(
          "Bestellwert überschreitet den zulässigen Höchstbetrag von 1.000.000 Euro. Bitte Mengen und Preise prüfen.",
        );
      next.orders.push({
        id: op.id,
        supplierId: p.supplierId,
        day,
        status: "Vorbereitet",
        createdAt: new Date().toISOString(),
        ...snapshot,
        context: {
          supplierName: supplier.name,
          eventName: next.event.name,
          eventYear: next.event.year,
          deliveryDate: next.event.dates[day] ?? null,
          deliveryAddress: next.event.deliveryAddress ?? "",
          contact: next.event.contact ?? "",
        },
      });
      break;
    }
    case "stock.opening": {
      if (!next.articles.some((a) => a.id === p.articleId))
        throw new Error("Artikel nicht gefunden.");
      next.movements.push({
        id: op.id,
        articleId: p.articleId,
        day: "Allgemein",
        type: "Anfangsbestand",
        quantity: quantity(p.quantity)!,
        location: requireActiveLocation(
          next,
          text(p.location ?? requirePurchasingLocation(next), "Ort", 100),
        ),
      });
      break;
    }
    case "delivery.record":
    case "stock.count":
    case "stock.waste":
    case "stock.return":
    case "stock.consume": {
      if (!next.articles.some((a) => a.id === p.articleId))
        throw new Error("Artikel nicht gefunden.");
      const day = validDay(p.day),
        q = quantity(p.quantity)!;
      const type =
        op.type === "delivery.record"
          ? "Lieferung"
          : op.type === "stock.count"
            ? "Zählung"
            : op.type === "stock.return"
              ? "Rückgabe"
              : op.type === "stock.consume"
                ? "Verbrauch"
                : "Abfall";
      next.movements.push({
        id: op.id,
        articleId: p.articleId,
        day,
        type,
        quantity: q,
        location: requireActiveLocation(
          next,
          text(p.location ?? requirePurchasingLocation(next), "Ort", 100),
        ),
        note: text(p.note, "Notiz", 1000, true),
      });
      break;
    }
    case "sales.quantity": {
      const item = next.menu.find((m) => m.id === p.menuId);
      if (!item) throw new Error("Speise/Getränk nicht gefunden.");
      const day = validDay(p.day),
        q = quantity(p.quantity, true);
      if (q !== null && !Number.isInteger(q))
        throw new Error("Verkaufte Stückzahl muss ganzzahlig sein.");
      const existing = next.sales.find(
        (s) => s.menuId === p.menuId && s.day === day,
      );
      if (existing) existing.quantity = q;
      else
        next.sales.push({
          id: op.id,
          menuId: p.menuId,
          day,
          quantity: q,
          priceCents: item.priceCents,
        });
      break;
    }
    case "sales.price": {
      const sale = next.sales.find(
        (s) => s.menuId === p.menuId && s.day === p.day,
      );
      if (!sale) throw new Error("Verkaufsposition nicht gefunden.");
      if (
        sale.priceCents !== null ||
        next.salePriceCorrections?.some((c) => c.targetId === sale.id)
      )
        throw new Error("Bereits erfasster Verkaufspreis bleibt erhalten.");
      if (
        typeof p.priceCents !== "number" ||
        !Number.isInteger(p.priceCents) ||
        p.priceCents < 0 ||
        p.priceCents > 100000000
      )
        throw new Error("Verkaufspreis ist ungültig.");
      sale.priceCents = p.priceCents;
      break;
    }
    case "recipe.save": {
      const item = next.menu.find((m) => m.id === p.menuId);
      if (!item) throw new Error("Speise/Getränk nicht gefunden.");
      if (
        !Array.isArray(p.lines) ||
        p.lines.length > 30 ||
        typeof p.confirmed !== "boolean"
      )
        throw new Error("Rezeptur ist ungültig.");
      if (
        new Set(p.lines.map((l: any) => l?.articleId)).size !== p.lines.length
      )
        throw new Error("Rezeptur enthält doppelte Artikel.");
      delete item.supplyMode;
      item.recipe = p.lines.map((l: any) => {
        if (!l || typeof l !== "object")
          throw new Error("Rezeptur ist ungültig.");
        if (!next.articles.some((a) => a.id === l.articleId))
          throw new Error("Artikel nicht gefunden.");
        return { articleId: l.articleId, quantity: quantity(l.quantity, true) };
      });
      if (
        p.confirmed &&
        (!item.recipe.length ||
          item.recipe.some((l) => l.quantity === null || l.quantity <= 0))
      )
        throw new Error(
          "Bestätigung braucht positive vollständige Rezeptmengen.",
        );
      item.recipeStatus =
        p.confirmed &&
        item.recipe.length &&
        item.recipe.every((l) => l.quantity !== null)
          ? "Bestätigt"
          : "Entwurf";
      break;
    }
    case "invoice.link": {
      const receipt = next.invoices.find((i) => i.id === p.id);
      if (!receipt) throw new Error("Beleg nicht gefunden.");
      const url = sharepoint(p.url);
      if (!url) throw new Error("Link fehlt.");
      if (receipt.documentUrl !== url) preserveReceiptHistory(receipt, op);
      receipt.documentUrl = url;
      if (receipt.corrections?.at(-1)?.operationId === op.id)
        receipt.corrections.at(-1)!.after = receiptSnapshot(receipt);
      break;
    }
    default:
      throw new Error("Unbekannter Vorgang.");
  }
  next.revision = (state.revision ?? 0) + 1;
  next.operationIds = [...(state.operationIds ?? []), op.id];
  next.operationRequests = {
    ...(state.operationRequests ?? {}),
    [op.id]: signature,
  };
  return { status: "saved", state: next };
}
export function importCheck(state: KitchenState): {
  planLines: number;
  fridayWiggen: number;
  originalReceipts: number;
  originalTotalCents: number;
} {
  const originals = state.invoices.filter(
    (i) => i.status === "Original vorhanden",
  );
  return {
    planLines: state.planLines.length,
    fridayWiggen: state.planLines.filter(
      (l) => l.supplierId === "s-wiggenhauser" && l.day === "Freitag",
    ).length,
    originalReceipts: originals.length,
    originalTotalCents: originals.reduce(
      (sum, i) => sum + (i.grossCents ?? 0),
      0,
    ),
  };
}
