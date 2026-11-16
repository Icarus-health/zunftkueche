/* eslint-disable @rushstack/no-new-null -- Uncounted inventory remains unknown. */
import { withSchedule, scheduledOrder, validateSchedule } from '../supplier-orders.ts';
import type { Order, Workspace } from '../model';
import { articleAvailable } from '../model.ts';
import type { Plan, Slot, AllocationLedger } from './model';
import { documents } from './model.ts';
import { berlinDay, planDemand, stockProjection, round, stableId, templateOrders } from './domain.ts';
import { receivedQuantity } from '../operations.ts';
import { button, select, field, h, n } from '../markup.ts';
import { heading, confirmationActions, dayLabel, today } from './common.ts';
export interface ProcurementRow {
  articleId: string;
  name: string;
  unit: string;
  required: number;
  stock: number | null;
  incoming: number;
  available?: number;
  issues: string[];
}
export interface Allocation {
  articleId: string;
  offerId: string;
  stockUse: number;
  incomingUse: number;
}

type DatedAllocation = Omit<AllocationLedger['entries'][number], 'date'> & { date?: string };

function areaAllocations(plan: Plan, s: Workspace): DatedAllocation[] {
  const ledger = documents(s.ww, 'allocation').find(l => l.scope === plan.scope && l.area === plan.area);
  if (ledger) return ledger.entries;
  const dates = new Map(
    documents(s.ww, 'plan')
      .filter(p => p.scope === plan.scope && p.area === plan.area)
      .map(p => [p.id, p.date])
  );
  return s.orders
    .filter(o => o.value.seasonId === plan.scope && o.value.area === plan.area && o.value.status !== 'Storniert')
    .flatMap(o => o.value.contributions || [])
    .map(entry => ({ ...entry, date: dates.get(entry.planId) }));
}

function reservedForOtherPlans(
  plan: Plan,
  entries: readonly DatedAllocation[],
  articleId: string,
  countedAt?: string | null
): DatedAllocation[] {
  const countDay = countedAt ? berlinDay(new Date(countedAt)) : '';
  // A physical count on a later day supersedes allocations for finished days.
  // Keep same-day allocations and older records whose use date is unknown.
  return entries.filter(
    entry =>
      entry.planId !== plan.id &&
      entry.articleId === articleId &&
      (!entry.date || !countDay || countDay > plan.date || entry.date >= countDay)
  );
}

export function procurementRows(plan: Plan, s: Workspace): ProcurementRow[] {
  const demand = planDemand(plan, s);
  if (demand.issues.length) throw new Error(demand.issues.join(' '));
  const stocks = stockProjection(
    s,
    (s.ww?.records || []).map(r => r.value),
    plan.scope,
    plan.area,
    ''
  );
  const rows: ProcurementRow[] = demand.rows.map(({ articleId, name, unit, quantity }) => ({
    articleId,
    name,
    unit,
    required: quantity,
    stock: stocks.find(c => c.articleId === articleId)?.quantity ?? null,
    incoming: 0,
    issues: []
  }));
  const allocations = areaAllocations(plan, s);
  for (const row of rows) {
    for (const { value: o } of s.orders.filter(
      o => o.value.area === plan.area && o.value.seasonId === plan.scope && o.value.status === 'Bestellt'
    ))
      for (const l of o.lines.filter(l => l.articleId === row.articleId)) {
        if (
          (!o.deliveries && !o.deliveryDate) ||
          (o.deliveries ? o.deliveries.every(d => !d.date || d.date > plan.date) : o.deliveryDate! > plan.date)
        ) {
          row.issues.push('Offene Lieferung ohne rechtzeitigen Termin.');
          continue;
        }
        if (l.quantity === null || l.unit !== row.unit) {
          row.issues.push('Offene Liefermenge / Einheit prüfen.');
          continue;
        }
        const pending = o.deliveries
          ? o.deliveries
              .filter(d => d.date && d.date <= plan.date)
              .reduce(
                (sum, d) =>
                  sum +
                  Math.max(
                    0,
                    (l.schedule?.[d.id] || 0) -
                      (o.receipts || [])
                        .filter(r => r.deliveryId === d.id)
                        .reduce(
                          (n, r) => n + r.lines.filter(x => x.lineId === l.id).reduce((n, x) => n + x.quantity, 0),
                          0
                        )
                  ),
                0
              )
          : Math.max(0, l.quantity - receivedQuantity(o, l.id));
        row.incoming = round(row.incoming + pending * l.packSize);
      }
    const used = reservedForOtherPlans(
      plan,
      allocations,
      row.articleId,
      stocks.find(stock => stock.articleId === row.articleId)?.countedAt
    );
    row.available = Math.max(
      0,
      round((row.stock || 0) + row.incoming - used.reduce((n, c) => n + c.stockUse + c.incomingUse, 0))
    );
  }
  return rows;
}
export function planOrders(plan: Plan, slot: Slot, s: Workspace, allocations: Allocation[]): Order[] {
  if (slot.scope !== plan.scope || slot.date > plan.date)
    throw new Error('Liefertermin muss in derselben Saison spätestens am Verwendungstag liegen.');
  if (new Set(allocations.map(a => a.articleId)).size !== allocations.length)
    throw new Error('Bestandsmenge darf nicht doppelt angerechnet werden.');
  const groups = new Map<
    string,
    Array<{
      offerId: string;
      quantity: number;
    }>
  >();
  for (const r of procurementRows(plan, s)) {
    const a = allocations.find(a => a.articleId === r.articleId);
    if (!a) throw new Error('Jeden benötigten Artikel zuordnen.');
    if (!Number.isFinite(a.stockUse) || a.stockUse < 0 || a.stockUse > (r.stock ?? 0))
      throw new Error('Angerechneten Bestand oder Zählung bitte prüfen.');
    if (!Number.isFinite(a.incomingUse) || a.incomingUse < 0 || a.incomingUse > r.incoming)
      throw new Error('Angerechnete offene Lieferung bitte prüfen.');
    if (round(a.stockUse + a.incomingUse) > Math.min(r.required, r.available ?? 0))
      throw new Error('Bestand ist bereits in anderen Plänen angerechnet oder übersteigt den Bedarf.');
    const required = round(Math.max(0, r.required - a.stockUse - a.incomingUse));
    const article = s.articles.find(x => x.value.id === r.articleId)?.value;
    if (required && (!article || !articleAvailable(article, plan.scope)))
      throw new Error(r.name + ' ist für diese Saison nicht vorgesehen. Bitte das Artikelprofil prüfen.');
    if (!required) continue;
    const offer = s.offers.find(
      o => o.value.id === a.offerId && o.value.articleId === r.articleId && o.value.active
    )?.value;
    if (!offer) throw new Error('Passendes Lieferangebot auswählen.');
    const lines = groups.get(offer.supplierId) || [];
    lines.push({ offerId: offer.id, quantity: Math.ceil(required / offer.packSize) });
    groups.set(offer.supplierId, lines);
  }
  return [...groups].flatMap(([supplierId, lines]) =>
    templateOrders(
      {
        id: 'plan-' + plan.id,
        kind: 'template',
        scope: 'global',
        at: plan.at,
        by: plan.by,
        confirmed: false,
        name: plan.name,
        supplierId,
        area: plan.area,
        lines,
        note:
          'Bedarf aus Plan ' +
          plan.id +
          '. Bestand und offene Lieferung gemäß geprüfter Anrechnung; keine automatische Reservierung.'
      },
      [slot],
      s,
      documents(s.ww, 'prices')
    ).map(o => ({ ...o, id: o.id + '-' + supplierId, sourceId: null, note: o.note + ' · Verwendung ' + plan.date }))
  );
}
export function procurementReservation(plan: Plan, allocations: Allocation[], s: Workspace): AllocationLedger {
  const current = documents(s.ww, 'allocation').find(l => l.scope === plan.scope && l.area === plan.area);
  const entries = areaAllocations(plan, s).map(entry => ({ ...entry, date: entry.date || plan.date }));
  const unique = new Map(entries.filter(c => c.planId !== plan.id).map(c => [c.planId + ':' + c.articleId, c]));
  for (const a of allocations)
    unique.set(plan.id + ':' + a.articleId, {
      planId: plan.id,
      articleId: a.articleId,
      date: plan.date,
      stockUse: a.stockUse,
      incomingUse: a.incomingUse
    });
  return {
    id: current?.id || 'allocation:' + plan.scope + ':' + (plan.area === 'Küche' ? 'kitchen' : 'bar'),
    kind: 'allocation',
    scope: plan.scope,
    area: plan.area,
    at: new Date().toISOString(),
    by: plan.by,
    confirmed: false,
    entries: [...unique.values()]
  };
}
export type ProcurementMode = 'planning' | 'check' | 'follow-up';

export function ordersForPlan(plan: Plan, s: Workspace): Order[] {
  return s.orders
    .map(row => row.value)
    .filter(
      order =>
        order.seasonId === plan.scope &&
        order.area === plan.area &&
        (order.contributions?.some(c => c.planId === plan.id) ||
          order.lines.some(line => line.sources?.some(c => c.planId === plan.id)))
    );
}

export function planAlreadyOrdered(plan: Plan, s: Workspace): boolean {
  return ordersForPlan(plan, s).some(order => order.status === 'Bestellt' || order.status === 'Abgeschlossen');
}

export function mergePlanOrders(
  plan: Plan,
  slot: Slot,
  s: Workspace,
  allocations: Allocation[],
  targets: Record<string, string>,
  mode: ProcurementMode = 'planning'
): Order[] {
  const related = ordersForPlan(plan, s);
  const placed = related.filter(order => order.status === 'Bestellt' || order.status === 'Abgeschlossen');
  if (placed.length && mode !== 'follow-up')
    throw new Error('Dieser Plan ist bereits bestellt. Bitte eine Nachbestellung vorbereiten.');
  if (!placed.length && mode === 'follow-up')
    throw new Error('Die zugehörige Hauptbestellung fehlt. Bitte den aktuellen Stand laden.');
  const additions = planOrders(plan, slot, s, allocations);
  const linked = related.filter(order => order.status === 'Entwurf');
  const supplierIds = new Set([...additions.map(o => o.supplierId), ...linked.map(o => o.supplierId)]);
  const result: Order[] = [];
  for (const supplierId of supplierIds) {
    const targetId = targets[supplierId];
    if (!targetId) throw new Error('Für jeden Lieferanten die gemeinsame Entwurfsbestellung wählen.');
    const addition = additions.find(o => o.supplierId === supplierId);
    const target = targetId === 'new' ? undefined : s.orders.find(o => o.value.id === targetId)?.value;
    if (
      targetId !== 'new' &&
      (!target ||
        target.supplierId !== supplierId ||
        target.status !== 'Entwurf' ||
        target.seasonId !== plan.scope ||
        target.area !== plan.area)
    )
      throw new Error('Ziel muss eine passende Entwurfsbestellung sein.');
    if (linked.some(o => o.supplierId === supplierId && o.id !== target?.id))
      throw new Error('Dieser Plan ist bereits in einer anderen Bestellung enthalten. Bitte diesen Entwurf auswählen.');
    if (mode === 'follow-up' && target && !linked.some(order => order.id === target.id))
      throw new Error('Bitte einen Nachbestellentwurf dieses Einsatzes wählen.');
    if (!addition && !target) continue;
    const order = target
      ? withSchedule(target)
      : withSchedule(addition!, [{ id: slot.id, date: slot.date, time: slot.time, place: slot.place }]);
    if (!target) {
      order.occasion = plan.name;
      order.note = '';
      order.lines.forEach(l => {
        l.schedule = { [slot.id]: 0 };
        l.sources = [];
      });
    }
    if (mode === 'follow-up' && !target) {
      const previous = related
        .filter(order => order.status !== 'Entwurf')
        .map(order => order.id)
        .sort();
      order.id = 'nachbestellung-' + stableId(JSON.stringify([plan.id, supplierId, previous]));
      const original = placed
        .filter(order => order.supplierId === supplierId)
        .sort((a, b) => (a.recordedAt || '').localeCompare(b.recordedAt || '') || a.id.localeCompare(b.id))[0];
      order.sourceId = original?.id || null;
      order.occasion = ('Nachbestellung · ' + plan.name).slice(0, 160);
    }
    for (const line of order.lines) {
      for (const source of line.sources?.filter(c => c.planId === plan.id) || [])
        line.schedule![source.deliveryId] = round((line.schedule![source.deliveryId] || 0) - source.quantity);
      line.sources = (line.sources || []).filter(c => c.planId !== plan.id);
    }
    let date = order.deliveries!.find(d => d.date === slot.date && d.time === slot.time && d.place === slot.place);
    if (!date) {
      date = { id: slot.id, date: slot.date, time: slot.time, place: slot.place };
      if (order.deliveries!.some(d => d.id === date!.id))
        throw new Error('Liefertermin wurde geändert. Bitte die Termine in der Bestellung prüfen.');
      order.deliveries!.push(date);
      order.lines.forEach(l => {
        l.schedule![date!.id] = 0;
      });
    }
    for (const add of addition?.lines || []) {
      let line = order.lines.find(l => l.offerId === add.offerId);
      if (!line) {
        line = {
          ...add,
          id: crypto.randomUUID(),
          schedule: Object.fromEntries(order.deliveries!.map(d => [d.id, 0])),
          sources: []
        };
        order.lines.push(line);
      }
      if (line.packSize !== add.packSize || line.unit !== add.unit)
        throw new Error('Liefergebinde hat sich geändert. Bitte den Entwurf prüfen.');
      if (line.schedule![date.id] === null)
        throw new Error('Bestehende Menge ist noch offen. Bitte zuerst die manuelle Menge in der Bestellung klären.');
      line.schedule![date.id] = round((line.schedule![date.id] || 0) + (add.quantity || 0));
      line.sources!.push({ planId: plan.id, deliveryId: date.id, quantity: add.quantity || 0 });
      line.reviewed = false;
    }
    order.contributions = (order.contributions || []).filter(c => c.planId !== plan.id);
    for (const a of allocations) {
      const offer = s.offers.find(o => o.value.id === a.offerId)?.value;
      if (offer?.supplierId === supplierId)
        order.contributions.push({
          planId: plan.id,
          articleId: a.articleId,
          stockUse: a.stockUse,
          incomingUse: a.incomingUse
        });
    }
    const merged = scheduledOrder(order);
    validateSchedule(merged);
    result.push(merged);
  }
  return result;
}
export function planProcurementForm(plan: Plan, s: Workspace, mode: ProcurementMode = 'planning'): string {
  const suggestions = procurementSuggestions(plan, s);
  const rows = procurementRows(plan, s);
  const earliest = mode === 'planning' ? '' : today();
  const slots = documents(s.ww, 'slot')
    .filter(slot => slot.scope === plan.scope && slot.date >= earliest && slot.date <= plan.date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const matchingDay = slots.filter(slot => slot.date === plan.date);
  const selectedSlot = slots.length === 1 ? slots[0].id : matchingDay.length === 1 ? matchingDay[0].id : '';
  const saved = areaAllocations(plan, s).filter(entry => entry.planId === plan.id);
  const relatedDrafts = ordersForPlan(plan, s).filter(order => order.status === 'Entwurf');
  const offers = s.offers
    .map(row => row.value)
    .filter(offer => offer.active && s.suppliers.some(row => row.value.active && row.value.id === offer.supplierId));
  const supplierIds = new Set(relatedDrafts.map(order => order.supplierId));
  const articleRows = rows
    .map(row => {
      const proposal = suggestions.find(entry => entry.articleId === row.articleId);
      const old = saved.find(entry => entry.articleId === row.articleId);
      const stockUse = mode === 'planning' ? (old?.stockUse ?? 0) : (proposal?.stockUse ?? 0);
      const incomingUse = mode === 'planning' ? (old?.incomingUse ?? 0) : (proposal?.incomingUse ?? 0);
      const candidates = offers.filter(offer => offer.articleId === row.articleId);
      candidates.forEach(offer => supplierIds.add(offer.supplierId));
      const selectedOffer = candidates.length === 1 ? candidates[0] : undefined;
      const rest = Math.max(0, round(row.required - stockUse - incomingUse));
      const result =
        'Zusätzlich benötigt: ' +
        n(rest) +
        ' ' +
        row.unit +
        (rest && selectedOffer
          ? ' · ' +
            Math.ceil(rest / selectedOffer.packSize) +
            ' Gebinde à ' +
            n(selectedOffer.packSize) +
            ' ' +
            row.unit
          : '');
      const issues = [...row.issues, ...(proposal?.reasons || [])];
      const uncertain =
        mode !== 'planning' && proposal?.reasons.some(reason => reason.startsWith('Bestand nicht aktuell'));
      return (
        '<section data-allocation="' +
        h(row.articleId) +
        '" data-required="' +
        row.required +
        '" class="procurement-row">' +
        '<h2>' +
        h(row.name) +
        '</h2>' +
        '<p>Bedarf: ' +
        n(row.required) +
        ' ' +
        h(row.unit) +
        '<br>Angerechnet: <span data-stock-use>' +
        n(stockUse) +
        '</span> aus Bestand · <span data-incoming-use>' +
        n(incomingUse) +
        '</span> aus offenen Lieferungen</p>' +
        (uncertain ? '<p class="muted">Bestand vor dem Einsatz neu zählen oder prüfen.</p>' : '') +
        '<p data-remaining><strong>' +
        h(result) +
        '</strong></p>' +
        select(
          'offerId',
          'Liefergebinde',
          [
            ['', 'Gebinde wählen'],
            ...candidates.map(
              offer =>
                [
                  offer.id,
                  (s.suppliers.find(row => row.value.id === offer.supplierId)?.value.name || '') +
                    ' · ' +
                    offer.packName +
                    ' à ' +
                    n(offer.packSize) +
                    ' ' +
                    row.unit
                ] as [string, string]
            )
          ],
          selectedOffer?.id || ''
        ) +
        '<details><summary>Anrechnung prüfen' +
        (issues.length ? ' · Hinweis' : '') +
        '</summary>' +
        (issues.length ? '<p class="muted">' + h(issues.join(' ')) + '</p>' : '') +
        '<div class="formgrid">' +
        field('stockUse', 'Aus vorhandenem Bestand', n(stockUse), true, 'text', 'inputmode="decimal"') +
        field('incomingUse', 'Aus erwarteter Lieferung', n(incomingUse), true, 'text', 'inputmode="decimal"') +
        '</div><p class="muted">Noch anrechenbar: ' +
        n(row.available ?? 0) +
        ' ' +
        h(row.unit) +
        '</p></details></section>'
      );
    })
    .join('');
  const targets = s.suppliers
    .filter(row => supplierIds.has(row.value.id))
    .map(({ value: supplier }) => {
      const drafts = (mode === 'follow-up' ? relatedDrafts : s.orders.map(row => row.value)).filter(
        order =>
          order.supplierId === supplier.id &&
          order.seasonId === plan.scope &&
          order.area === plan.area &&
          order.status === 'Entwurf'
      );
      const linked = relatedDrafts.find(order => order.supplierId === supplier.id);
      return select(
        'target_' + supplier.id,
        supplier.name,
        [
          ['', 'Entwurf wählen'],
          ['new', mode === 'follow-up' ? 'Neue Nachbestellung' : 'Neue Lieferantenbestellung'],
          ...drafts.map(order => [order.id, order.occasion] as [string, string])
        ],
        linked?.id || (drafts.length === 1 ? drafts[0].id : drafts.length ? '' : 'new')
      );
    })
    .join('');
  const title =
    mode === 'follow-up'
      ? 'Nachbestellung vorbereiten'
      : mode === 'check'
        ? 'Bedarf für den Einsatz prüfen'
        : 'Einkauf vorbereiten';
  return (
    '<form data-form="ww-procure" class="panel">' +
    heading(title, plan.name + ' · ' + dayLabel(plan.date)) +
    select(
      'slot',
      'Liefertermin',
      [
        ['', 'Termin wählen'],
        ...slots.map(slot => [slot.id, dayLabel(slot.date) + ' · ' + slot.name] as [string, string])
      ],
      selectedSlot,
      'required'
    ) +
    (slots.length
      ? ''
      : '<p>Für diesen Einsatz fehlt ein passender Liefertermin.</p>' +
        button('ww-open', 'Liefertermine öffnen', 'slots')) +
    (mode === 'planning'
      ? '<div class="actions">' + button('ww-procure-suggest', 'Bestand und offene Lieferungen anrechnen') + '</div>'
      : '') +
    '<div class="procurement-rows">' +
    articleRows +
    '</div>' +
    (targets
      ? '<details><summary>Bestellentwürfe zuordnen</summary><div class="formgrid">' + targets + '</div></details>'
      : '') +
    confirmationActions(mode === 'follow-up' ? 'Nachbestellentwurf speichern' : 'Bedarf in Bestellung übernehmen') +
    '</form>'
  );
}

/** Deliberately conservative; the team can change the proposal after checking the physical stock. */
export function procurementSuggestions(
  plan: Plan,
  s: Workspace,
  now = new Date()
): Array<Allocation & { additional: number; packs: number; reasons: string[] }> {
  const today = berlinDay(now),
    rows = procurementRows(plan, s),
    stocks = stockProjection(
      s,
      (s.ww?.records || []).map(r => r.value),
      plan.scope,
      plan.area,
      ''
    );
  const reservations = areaAllocations(plan, s);
  return rows.map(r => {
    const reasons: string[] = [],
      stock = stocks.find(c => c.articleId === r.articleId),
      age = stock?.countedAt ? now.getTime() - Date.parse(stock.countedAt) : Infinity;
    const dayDistance = stock?.countedAt
      ? (Date.parse(plan.date + 'T12:00Z') - Date.parse(berlinDay(new Date(stock.countedAt)) + 'T12:00Z')) / 86400000
      : Infinity;
    const fresh = age >= 0 && age <= 86400000 && dayDistance >= 0 && dayDistance <= 1 && !stock?.issues.length;
    if (!fresh) reasons.push('Bestand nicht aktuell genug für den Vorschlag. Vor Anrechnung erneut prüfen.');
    let timely = 0;
    for (const { value: o } of s.orders.filter(
      o => o.value.status === 'Bestellt' && o.value.seasonId === plan.scope && o.value.area === plan.area
    ))
      for (const l of o.lines.filter(l => l.articleId === r.articleId && l.unit === r.unit)) {
        const deliveries = o.deliveries || [{ id: '', date: o.deliveryDate }];
        for (const d of deliveries) {
          if (
            !d.date ||
            d.date < today ||
            d.date > plan.date ||
            o.deliveryNotes?.some(n => !n.deliveryId || n.deliveryId === d.id)
          )
            continue;
          const q = o.deliveries ? l.schedule?.[d.id] : l.quantity;
          if (q === null || q === undefined) continue;
          const received = o.deliveries
            ? (o.receipts || [])
                .filter(x => x.deliveryId === d.id)
                .flatMap(x => x.lines)
                .filter(x => x.lineId === l.id)
                .reduce((n, x) => n + x.quantity, 0)
            : receivedQuantity(o, l.id);
          timely += Math.max(0, q - received) * l.packSize;
        }
      }
    if (timely < r.incoming) reasons.push('Überfällige, undatierte oder ausgefallene Lieferungen nicht vorgeschlagen.');
    const used = reservedForOtherPlans(plan, reservations, r.articleId, stock?.countedAt),
      freeStock = Math.max(0, (fresh ? r.stock || 0 : 0) - used.reduce((n, c) => n + c.stockUse, 0)),
      freeIncoming = Math.max(0, timely - used.reduce((n, c) => n + c.incomingUse, 0));
    const stockUse = round(Math.min(r.required, freeStock, r.available || 0)),
      incomingUse = round(Math.min(r.required - stockUse, freeIncoming, Math.max(0, (r.available || 0) - stockUse))),
      additional = round(r.required - stockUse - incomingUse);
    const offer = s.offers.find(
      o =>
        o.value.articleId === r.articleId &&
        o.value.active &&
        s.suppliers.some(v => v.value.id === o.value.supplierId && v.value.active)
    )?.value;
    return {
      articleId: r.articleId,
      offerId: offer?.id || '',
      stockUse,
      incomingUse,
      additional,
      packs: offer ? Math.ceil(additional / offer.packSize) : 0,
      reasons
    };
  });
}
