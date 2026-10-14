export type Day =
  | "Mittwoch"
  | "Freitag"
  | "Samstag"
  | "Sonntag"
  | "Allgemein"
  | "Alle Orte"
  | "Halle Küche"
  | "Zunftabende"
  | "Küche"
  | "Mitwirkende/Aufbau/Probe"
  | string;
export interface Source {
  file: string;
  hash: string;
  sheet?: string;
  cells?: string;
  page?: number;
}
export interface PlanLine {
  id: string;
  supplierId: string;
  articleId: string;
  name: string;
  quantity: number | null;
  unit: string;
  day: Day;
  time: string | null;
  unitPriceCents: number | null;
  note?: string;
  lesson?: string;
  category?: string;
  location?: string;
  source?: Source;
  purchaseGenerated?: boolean;
  purchaseForWeekend?: boolean;
}
export interface OrderContext {
  supplierName: string;
  eventName: string;
  eventYear: number;
  deliveryDate: string | null;
}
export interface OrderSnapshot {
  context?: Readonly<OrderContext>;
  lines: ReadonlyArray<Readonly<PlanLine>>;
  groups: Array<{
    time: string | null;
    lines: ReadonlyArray<Readonly<PlanLine>>;
  }>;
  totalCents: number | null;
}
export function parseQuantity(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+(,\d{1,4})?$/.test(value))
    throw new Error("Menge bitte als positive Zahl mit Dezimalkomma eingeben.");
  const quantity = Number(value.replace(",", "."));
  if (!Number.isFinite(quantity) || quantity > 10000000)
    throw new Error("Menge liegt außerhalb des zulässigen Bereichs.");
  return quantity;
}
function roundedCost(
  lines: ReadonlyArray<{
    quantity: number | null;
    unitPriceCents: number | null;
  }>,
): number | null {
  if (
    !lines.length ||
    lines.some((l) => l.quantity === null || l.unitPriceCents === null)
  )
    return null;
  // Inputs allow four quantity decimals and two cent-price decimals. Convert
  // those decimal values before multiplying; products are millionths of a cent.
  const total = lines.reduce(
    (sum, l) =>
      sum +
      BigInt(l.quantity!.toFixed(4).replace(".", "")) *
        BigInt(l.unitPriceCents!.toFixed(2).replace(".", "")),
    0n,
  );
  const cents = (total + 500000n) / 1000000n;
  // The public model uses numbers: do not publish an inexact monetary total.
  return cents > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(cents);
}
export function prepareOrder(
  lines: PlanLine[],
  supplierId: string,
  day: Day,
): OrderSnapshot {
  const selected = lines
    .filter((l) => l.supplierId === supplierId && l.day === day)
    .map((l) => Object.freeze(structuredClone(l)));
  const times = [...new Set(selected.map((l) => l.time))].sort((a, b) =>
    (a ?? "99:99").localeCompare(b ?? "99:99"),
  );
  return {
    lines: Object.freeze(selected),
    groups: times.map((time) => ({
      time,
      lines: Object.freeze(selected.filter((l) => l.time === time)),
    })),
    totalCents: roundedCost(selected),
  };
}
export function recipeCost(
  lines: Array<{ quantity: number | null; unitPriceCents: number | null }>,
): { totalCents: number | null; missing: number } {
  const missing = lines.filter(
    (l) => l.quantity === null || l.unitPriceCents === null,
  ).length;
  return { totalCents: roundedCost(lines), missing };
}
export function stockBalance(
  opening: number | null,
  movements: Array<{ type: string; quantity: number }>,
): number | null {
  if (opening === null) return null;
  return movements.reduce(
    (balance, m) =>
      balance +
      (["Lieferung", "Zugang"].includes(m.type)
        ? m.quantity
        : ["Verbrauch", "Abfall", "Rückgabe"].includes(m.type)
          ? -m.quantity
          : 0),
    opening,
  );
}
export function salesRevenue(
  lines: Array<{ quantity: number | null; priceCents: number | null }>,
): { totalCents: number | null; missing: number } {
  const missing = lines.filter(
    (l) => l.quantity === null || l.priceCents === null,
  ).length;
  return {
    totalCents:
      !lines.length || missing
        ? null
        : lines.reduce(
            (sum, l) => sum + Math.round(l.quantity! * l.priceCents!),
            0,
          ),
    missing,
  };
}
export function summarizeSales(
  lines: Array<{ quantity: number | null; priceCents: number | null }>,
): {
  totalCents: number | null;
  knownCents: number;
  entered: number;
  missingPrices: number;
} {
  const entered = lines.filter((l) => l.quantity !== null),
    missingPrices = entered.filter((l) => l.priceCents === null).length;
  const knownCents = entered
    .filter((l) => l.priceCents !== null)
    .reduce((sum, l) => sum + Math.round(l.quantity! * l.priceCents!), 0);
  return {
    totalCents: !entered.length || missingPrices ? null : knownCents,
    knownCents,
    entered: entered.length,
    missingPrices,
  };
}
export function formatOrderHint(line: Pick<PlanLine, "time" | "note">): string {
  const note = line.note?.trim() ?? "";
  if (line.time && note && !note.includes(line.time))
    return `${line.time} Uhr · ${note}`;
  return note || (line.time ? `${line.time} Uhr` : "—");
}
