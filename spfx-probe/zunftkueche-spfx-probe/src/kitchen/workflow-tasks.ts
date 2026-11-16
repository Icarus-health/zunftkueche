/* eslint-disable @rushstack/no-new-null -- Null explicitly represents unknown quantities, prices and dates in the persisted domain and DOM APIs. */
import type { Area, Order } from './model';
import { deliveryRemaining } from './supplier-orders.ts';
import { receivedQuantity } from './operations.ts';

export interface DeliveryTask {
  order: Order;
  deliveryId?: string;
  date: string | null;
  place: string;
  time: string;
  label: 'Heute' | 'Überfällig' | 'Termin offen';
}
/** Returns only actionable deliveries; a draft is never an expected delivery. */
export function deliveryTasks(orders: Order[], seasonId: string, area: Area, today: string): DeliveryTask[] {
  const tasks: DeliveryTask[] = [];
  for (const order of orders) {
    if (order.status !== 'Bestellt' || order.seasonId !== seasonId || order.area !== area) continue;
    if (order.deliveries?.length) {
      for (const d of order.deliveries) {
        if (d.date && d.date > today) continue;
        if (
          !order.lines.some(
            l =>
              l.schedule?.[d.id] === null ||
              l.schedule?.[d.id] === undefined ||
              deliveryRemaining(order, l.id, d.id) > 0
          )
        )
          continue;
        tasks.push({
          order,
          deliveryId: d.id,
          date: d.date,
          place: d.place,
          time: d.time,
          label: d.date === today ? 'Heute' : d.date ? 'Überfällig' : 'Termin offen'
        });
      }
    } else if (
      order.lines.some(l => l.quantity !== null && l.quantity > receivedQuantity(order, l.id)) &&
      (!order.deliveryDate || order.deliveryDate <= today)
    ) {
      const date = order.deliveryDate || null;
      tasks.push({
        order,
        date,
        place: order.area,
        time: '',
        label: date === today ? 'Heute' : date ? 'Überfällig' : 'Termin offen'
      });
    }
  }
  const rank = { Heute: 0, Überfällig: 1, 'Termin offen': 2 };
  return tasks.sort(
    (a, b) =>
      rank[a.label] - rank[b.label] ||
      (a.date || '').localeCompare(b.date || '') ||
      a.order.supplierName.localeCompare(b.order.supplierName, 'de')
  );
}

import type { Season, Workspace } from './model';
import { button, empty } from './markup.ts';
import { articleAvailable } from './model.ts';
export function orderRound(state: Workspace, season: Season | undefined, area: Area): string {
  if (!season) return '<h1>Bestellrunde</h1><p>Bitte zuerst eine Saison wählen.</p>';
  const rows = state.suppliers
    .filter(s => s.value.active)
    .sort((a, b) => a.value.name.localeCompare(b.value.name, 'de'))
    .map(({ value: supplier }) => {
      const orders = state.orders.filter(
        o =>
          o.value.seasonId === season.id &&
          o.value.area === area &&
          o.value.supplierId === supplier.id &&
          o.value.status !== 'Storniert' &&
          !/^historisch(?:e|er|es)?\b/i.test(o.value.occasion.trim())
      );
      const drafts = orders.filter(o => o.value.status === 'Entwurf');
      const offerCount = state.offers.filter(
        o =>
          o.value.active &&
          o.value.supplierId === supplier.id &&
          state.articles.some(a => a.value.id === o.value.articleId && articleAvailable(a.value, season.id))
      ).length;
      const action =
          season.archived || drafts.length > 1 ? 'supplier-orders' : drafts.length ? 'order-edit' : 'order-new',
        id = action === 'order-edit' ? drafts[0].value.id : supplier.id;
      return (
        '<div class="supplier-round-row">' +
        button(action, supplier.name, id) +
        '<span>' +
        offerCount +
        ' ' +
        (offerCount === 1 ? 'Liefergebinde' : 'Liefergebinde') +
        '</span><div>' +
        (orders.length
          ? button('supplier-orders', orders.length + ' ' + (orders.length === 1 ? 'Vorgang' : 'Vorgänge'), supplier.id)
          : '<small>Noch nicht begonnen</small>') +
        '</div></div>'
      );
    })
    .join('');
  return (
    '<div class="page-heading"><div><h1>Bestellrunde</h1></div><div class="actions">' +
    (season.archived ? '' : button('copy-list', 'Aus Vorjahr übernehmen')) +
    button('nav', 'Alle Bestellungen', 'orders') +
    '</div></div><section class="supplier-round-list"><div class="supplier-round-head"><span>Lieferant</span><span>Ordersatz</span><span>Bestellungen</span></div>' +
    (rows || empty('Zuerst einen Lieferanten anlegen.')) +
    '</section>'
  );
}

import { documents } from './ww/model.ts';
export function orderDeadlines(
  state: Workspace,
  seasonId: string,
  area: Area
): Array<{ order: Order; delivery: string; deadline: string; overridden: boolean }> {
  return state.orders
    .filter(o => o.value.seasonId === seasonId && o.value.area === area && o.value.status === 'Entwurf')
    .flatMap(({ value: order }) => {
      const rule = documents(state.ww, 'rule')
        .filter(r => r.supplierId === order.supplierId)
        .sort((a, b) => b.at.localeCompare(a.at))[0];
      if (!rule) return [];
      return [...new Set(order.deliveries?.map(d => d.date) || [order.deliveryDate])].flatMap(delivery => {
        if (!delivery) return [];
        const override = rule.deadlineOverrides?.[delivery];
        if (!override && !rule.cutoffTime) return [];
        const day = new Date(delivery + 'T12:00:00Z');
        day.setUTCDate(day.getUTCDate() - rule.leadDays);
        return [
          {
            order,
            delivery,
            deadline: override || day.toISOString().slice(0, 10) + 'T' + rule.cutoffTime,
            overridden: !!override
          }
        ];
      });
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
}
