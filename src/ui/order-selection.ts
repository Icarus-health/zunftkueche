import type {KitchenState} from '../domain/state.ts';

type SavedOrder = KitchenState['orders'][number];
export function ordersForContext(state: KitchenState, supplierId: string, day: string): SavedOrder[] {
  return state.orders.filter(order => order.supplierId === supplierId && order.day === day);
}
export function savedSupplierLabel(state: KitchenState, order: SavedOrder): string {
  if (order.context?.supplierName) return `${order.context.supplierName} · gespeicherter Name`;
  const current = state.suppliers.find(supplier => supplier.id === order.supplierId)?.name;
  return current ? `${current} · heutiger Name, historisch nicht gespeichert` : 'Historischer Lieferant · Name nicht gespeichert';
}
export function receivingSuppliers(state: KitchenState) {
  const ids = [...new Set([...state.suppliers.map(supplier => supplier.id), ...state.orders.map(order => order.supplierId)])];
  return ids.map(id => {
    const latest = state.orders.filter(order => order.supplierId === id).at(-1);
    return {id, label: latest ? savedSupplierLabel(state, latest) : `${state.suppliers.find(supplier => supplier.id === id)!.name} · aktuell`};
  });
}
export type ReceivingSelection = {supplierId: string; day: string; orderId: string};
/** Resolve against the chosen supplier/day every render, so a stale ID never selects a foreign order. */
export function receivingSelection(state: KitchenState, requested: ReceivingSelection) {
  const suppliers = receivingSuppliers(state);
  const supplierId = suppliers.some(supplier => supplier.id === requested.supplierId)
    ? requested.supplierId : (state.orders.at(-1)?.supplierId ?? suppliers[0]?.id ?? '');
  const days = [...new Set(state.orders.filter(order => order.supplierId === supplierId).map(order => order.day))];
  const day = days.includes(requested.day) ? requested.day : (days.includes('Freitag') ? 'Freitag' : days[0] ?? 'Freitag');
  const orders = ordersForContext(state, supplierId, day);
  const orderId = orders.some(order => order.id === requested.orderId) ? requested.orderId : (orders.at(-1)?.id ?? '');
  return {supplierId, day, orderId, suppliers, days, orders};
}
