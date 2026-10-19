import { prepareOrder } from "./kitchen.ts";
import type { KitchenState } from "./state.ts";
import type { AuditEntry } from "./corrections.ts";
export interface OrderStatusEntry extends AuditEntry {
  status: "bestellt" | "bestaetigt";
  note: string;
}
export function orderPlanningChanged(
  state: KitchenState,
  order: KitchenState["orders"][number],
): boolean {
  const current = prepareOrder(state.planLines, order.supplierId, order.day);
  return (
    JSON.stringify(current.lines) !== JSON.stringify(order.lines) ||
    Boolean(
      order.context &&
      (order.context.deliveryDate !== (state.event.dates[order.day] ?? null) ||
        (order.context.deliveryAddress ?? "") !==
          (state.event.deliveryAddress ?? "") ||
        (order.context.contact ?? "") !== (state.event.contact ?? "")),
    )
  );
}
export function nextOrderStatus(
  order: KitchenState["orders"][number],
  status: unknown,
): asserts status is "bestellt" | "bestaetigt" {
  if (!(
    (order.status === "Vorbereitet" && status === "bestellt") ||
    (order.status === "bestellt" && status === "bestaetigt")
  ))
    throw new Error(
      "Bestellstatus muss auf Vorbereitet → bestellt → bestätigt folgen.",
    );
}
