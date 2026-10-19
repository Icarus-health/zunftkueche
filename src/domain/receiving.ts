import type { KitchenState } from './state.ts';
import { movementQuantity } from './corrections.ts';
export function buildReceivingList(state: KitchenState, orderId: string) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) throw new Error('Bestellfassung nicht gefunden.');
  return order.lines.map((line: {id:string;articleId:string;name:string;unit:string;quantity:number|null}) => {
    const entries = state.movements.filter(m => m.orderId === orderId && m.orderLineId === line.id);
    const received = entries.reduce((sum, m) => sum + movementQuantity(state, m), 0);
    return {...line, ordered:line.quantity, received:entries.length?received:null, remaining:line.quantity === null ? null : Math.max(0,line.quantity-received), deviation:line.quantity === null || !entries.length ? null : received-line.quantity, entries};
  });
}
export function allocationSummary(line: {quantity:number|null;allocations?:Array<{quantity:number}>}) {
 const allocated=(line.allocations??[]).reduce((n,a)=>n+a.quantity,0);
 return {total:line.quantity,allocated,remaining:line.quantity===null?null:line.quantity-allocated,over:line.quantity===null?null:Math.max(0,allocated-line.quantity)};
}
