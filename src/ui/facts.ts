import type { OrderSnapshot } from "../domain/kitchen.ts";
import type { KitchenState, Receipt } from "../domain/state.ts";
export const kitchenDays = ["Freitag", "Samstag"] as const;
export const deliveryDays = [
  "Mittwoch",
  "Freitag",
  "Samstag",
  "Sonntag",
  "Allgemein",
];
export const defaultLocations = [
  "Küche",
  "Bar",
  "Zunftscheuer",
  "Brunnen",
  "Mitwirkende / Aufbau / Probe",
];
export function parseMoney(raw: string, precise = false): number | null {
  const value = raw.trim();
  if (!value) return null;
  const decimals = precise ? 4 : 2;
  if (!new RegExp(`^\\d+(?:[,.]\\d{1,${decimals}})?$`).test(value))
    throw new Error(
      `Betrag mit höchstens ${decimals} Nachkommastellen eingeben (ohne Tausenderpunkt).`,
    );
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed * 100 > 100000000)
    throw new Error("Betrag liegt außerhalb des zulässigen Bereichs.");
  return Math.round(parsed * (precise ? 10000 : 100)) / (precise ? 100 : 1);
}
export function missingDishCells(state: KitchenState) {
  return state.menu.flatMap((menu) =>
    kitchenDays
      .filter(
        (day) =>
          (state.dishPlan ?? []).find(
            (p) => p.menuId === menu.id && p.day === day,
          )?.quantity == null,
      )
      .map((day) => ({ menuId: menu.id, name: menu.name, day })),
  );
}
export function receiptTotals(receipts: Receipt[]) {
  const known = receipts.filter((i) => i.grossCents !== null);
  return {
    knownCents: known.reduce((sum, i) => sum + i.grossCents!, 0),
    known: known.length,
    missing: receipts.length - known.length,
    total: receipts.length,
  };
}
export function receiptOriginalLabel(
  receipt: Receipt,
  mode: "local" | "microsoft",
) {
  if (receipt.documentUrl)
    return receipt.status === "Original vorhanden"
      ? "Original mit SharePoint-Link"
      : "SharePoint-Link · Originalstatus ungeprüft";
  if (receipt.status === "Original vorhanden")
    return mode === "local"
      ? "Original lokal"
      : "Original lokal · hier nicht verfügbar";
  return receipt.status === "Original fehlt"
    ? "Original fehlt"
    : "Erfasst · Original offen";
}
export function articleReferenced(state: KitchenState, id: string) {
  return (
    state.menu.some((m) => m.recipe.some((l) => l.articleId === id)) ||
    state.planLines.some((l) => l.articleId === id) ||
    state.movements.some((m) => m.articleId === id) ||
    state.invoices.some((i) => i.lines.some((l) => l.articleId === id)) ||
    state.orders.some((o) =>
      o.lines.some((l: { articleId: string }) => l.articleId === id),
    )
  );
}
export function eventDate(state: KitchenState, day: string) {
  const value = state.event.dates[day];
  return formatDeliveryDate(value);
}
export function formatDeliveryDate(value: string | null | undefined) {
  return value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("de-DE")
    : "Datum offen";
}

export function deriveReadView(
  state: KitchenState,
  eventId: string | null,
): KitchenState {
  const archived = state.archivedEvents?.find((a) => a.event.id === eventId);
  return archived
    ? {
        ...archived,
        revision: state.revision,
        operationIds: state.operationIds,
        operationRequests: state.operationRequests,
        archivedEvents: state.archivedEvents,
      }
    : state;
}

export function orderPreviewHeader(
  state: KitchenState,
  order: Pick<OrderSnapshot, "context"> & {
    supplierId: string;
    day: string;
    status: string;
  },
) {
  if (order.status === "Vorbereitet" && order.context)
    return { ...order.context, notice: null };
  return {
    supplierName:
      state.suppliers.find((s) => s.id === order.supplierId)?.name ??
      "Lieferant offen",
    eventName: state.event.name,
    eventYear: state.event.year,
    deliveryDate: state.event.dates[order.day] ?? null,
    notice:
      order.status === "Vorbereitet"
        ? "Lieferant, Veranstaltung und Datum wurden in dieser älteren Version nicht gespeichert. Die angezeigten Angaben sind aktuell; der damalige Stand ist unbekannt."
        : null,
  };
}
