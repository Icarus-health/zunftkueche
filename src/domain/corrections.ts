import type { KitchenState, Receipt, ReceiptSnapshot } from "./state.ts";
/** The browser proposes facts; actor/time are added only by the commit server. */
export interface AuditEntry {
  operationId: string;
  revision: number;
  actorId?: string;
  confirmedAt?: string;
}
export interface ValueCorrection extends AuditEntry {
  targetId: string;
  before: number | null;
  after: number;
  reason: string;
}
export function movementQuantity(
  state: KitchenState,
  movement: KitchenState["movements"][number],
): number {
  return (
    state.movementCorrections?.filter((c) => c.targetId === movement.id).at(-1)
      ?.after ?? movement.quantity
  );
}
export function salePrice(
  state: KitchenState,
  sale: KitchenState["sales"][number],
): number | null {
  return (
    state.salePriceCorrections?.filter((c) => c.targetId === sale.id).at(-1)
      ?.after ?? sale.priceCents
  );
}
export function effectiveSales(state: KitchenState) {
  return state.sales.map((s) => ({ ...s, priceCents: salePrice(state, s) }));
}
export function receiptSnapshot(receipt: Receipt): ReceiptSnapshot {
  const {
    sourceBaseline: _baseline,
    corrected: _corrected,
    corrections: _history,
    ...snapshot
  } = structuredClone(receipt);
  return snapshot;
}
