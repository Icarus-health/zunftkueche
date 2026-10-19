import type { KitchenState } from './state.ts';
import type { PlanLine } from './kitchen.ts';
import { movementQuantity } from './corrections.ts';

export function buildReceivingList(state: KitchenState, orderId: string) {
  const order = state.orders.find(order => order.id === orderId);
  if (!order) throw new Error('Bestellfassung nicht gefunden.');
  const lines: Pick<PlanLine, 'id' | 'articleId' | 'name' | 'unit' | 'quantity'>[] = order.lines;
  return lines.map(line => {
    const entries = state.movements.filter(movement => movement.orderId === orderId && movement.orderLineId === line.id);
    const received = entries.reduce((sum, movement) => sum + movementQuantity(state, movement), 0);
    return {
      ...line,
      ordered: line.quantity,
      received: entries.length ? received : null,
      remaining: line.quantity === null ? null : Math.max(0, line.quantity - received),
      deviation: line.quantity === null || !entries.length ? null : received - line.quantity,
      entries,
    };
  });
}
export function allocationSummary(line: { quantity: number | null; allocations?: Array<{ quantity: number }> }) {
  const allocated = (line.allocations ?? []).reduce((sum, allocation) => sum + allocation.quantity, 0);
  return {
    total: line.quantity,
    allocated,
    remaining: line.quantity === null ? null : line.quantity - allocated,
    over: line.quantity === null ? null : Math.max(0, allocated - line.quantity),
  };
}
