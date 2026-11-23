// Lieferanten zusammenlegen: ein Lieferant geht in einem anderen auf.
// Was nach vorn wirkt, wechselt (Artikel mit Gebinde und Preis, Bestellentwürfe, Bestellvorlagen, Bestellschluss).
// Was schon geschehen ist, bleibt, wie es war (aufgegebene Bestellungen, bestätigte Rechnungen, frühere Preislisten).
// Der alte Lieferant wird inaktiv und merkt sich, in wem er aufgegangen ist.
import type { Offer, Order, Supplier, Workspace } from './model';
import type { PriceList, Rule, Template, WwDocument } from './ww/model';
import { effectiveOffer } from './ww/domain.ts';

export interface MergePlan {
  source: Supplier;
  target: Supplier;
  /** Gebinde, die zum Ziel wechseln. Der heute gültige Preis ist eingetragen, weil frühere Preislisten beim alten Lieferanten bleiben. */
  moved: Array<{ before: Offer; after: Offer; article: string }>;
  /** Gebinde, die es beim Ziel schon gleich gibt: der Eintrag des Ziels bleibt, der alte wird stillgelegt. */
  doubled: Array<{ before: Offer; after: Offer; twin: Offer; article: string }>;
  /** Gebinde zu inaktiven Artikeln bleiben, wo sie sind. */
  left: Array<{ offer: Offer; article: string }>;
  /** Bestellentwürfe in offenen Saisons, umgeschrieben auf das Ziel. */
  drafts: Array<{ before: Order; after: Order }>;
  /** Aufgegebene, abgeschlossene oder archivierte Bestellungen: bleiben beim alten Namen. */
  fixedOrders: number;
  templates: Array<{ before: Template; after: Template }>;
  /** Bestellschluss und Liefertage wechseln nur, wenn das Ziel noch keine eigenen hat. */
  rule?: { before: Rule; after: Rule };
  ruleStays: boolean;
  /** Bestätigte Rechnungen und frühere Preislisten der gezeigten Saison, die beim alten Lieferanten bleiben. */
  bills: number;
  priceLists: number;
  /** Der alte Lieferant nach dem Zusammenlegen. */
  retired: Supplier;
}

const samePack = (a: Offer, b: Offer): boolean =>
  a.articleId === b.articleId &&
  a.code.trim().toLowerCase() === b.code.trim().toLowerCase() &&
  a.packName.trim().toLowerCase() === b.packName.trim().toLowerCase() &&
  a.packSize === b.packSize;

/** Rechnet aus, was beim Zusammenlegen geschieht. Ändert nichts. `today` als JJJJ-MM-TT. */
export function planMerge(
  state: Workspace,
  documents: WwDocument[],
  sourceId: string,
  targetId: string,
  today: string
): MergePlan {
  const source = state.suppliers.find(s => s.value.id === sourceId)?.value,
    target = state.suppliers.find(s => s.value.id === targetId)?.value;
  if (!source) throw new Error('Lieferant nicht gefunden. Bitte neu laden.');
  if (!target) throw new Error('Bitte den Lieferanten wählen, mit dem zusammengelegt wird.');
  if (source.id === target.id) throw new Error('Bitte einen anderen Lieferanten wählen.');
  if (!target.active) throw new Error('Der Ziel-Lieferant ist inaktiv. Bitte zuerst wieder aktiv setzen.');
  const lists = documents.filter((d): d is PriceList => d.kind === 'prices');
  const targetOffers = state.offers.map(o => o.value).filter(o => o.supplierId === target.id);
  const plan: MergePlan = {
    source,
    target,
    moved: [],
    doubled: [],
    left: [],
    drafts: [],
    fixedOrders: 0,
    templates: [],
    ruleStays: false,
    bills: documents.filter(d => d.kind === 'bill' && d.supplierId === source.id).length,
    priceLists: lists.filter(p => p.supplierId === source.id).length,
    retired: source
  };
  /** Neue Kennung je altem Gebinde, damit Entwürfe und Vorlagen auf das bleibende Gebinde zeigen. */
  const remap = new Map<string, Offer>();
  for (const offer of state.offers.map(o => o.value).filter(o => o.supplierId === source.id)) {
    const article = state.articles.find(a => a.value.id === offer.articleId)?.value;
    const name = article?.name || 'Artikel';
    const twin = targetOffers.find(o => o.active && samePack(o, offer));
    if (twin) {
      if (offer.active) plan.doubled.push({ before: offer, after: { ...offer, active: false }, twin, article: name });
      remap.set(offer.id, twin);
      continue;
    }
    if (!article?.active) {
      plan.left.push({ offer, article: name });
      continue;
    }
    let price = offer;
    try {
      price = effectiveOffer(offer, lists, today);
    } catch {
      /* Gebinde seit der letzten Preisliste geändert: der Preis am Gebinde gilt. */
    }
    const after: Offer = {
      ...offer,
      supplierId: target.id,
      priceNet: price.priceNet,
      deposit: price.deposit,
      priceDate: price.priceDate
    };
    plan.moved.push({ before: offer, after, article: name });
    remap.set(offer.id, after);
  }
  const openSeasons = new Set(state.seasons.filter(s => !s.value.archived).map(s => s.value.id));
  for (const { value: order } of state.orders.filter(o => o.value.supplierId === source.id)) {
    const movable =
      order.status === 'Entwurf' &&
      openSeasons.has(order.seasonId) &&
      !(order.receipts || []).length &&
      order.lines.every(l => remap.has(l.offerId));
    if (!movable) {
      plan.fixedOrders++;
      continue;
    }
    plan.drafts.push({
      before: order,
      after: {
        ...order,
        supplierId: target.id,
        supplierName: target.name,
        method: target.method,
        lines: order.lines.map(l => {
          const offer = remap.get(l.offerId)!;
          return { ...l, offerId: offer.id, code: offer.code, packName: offer.packName, packSize: offer.packSize };
        })
      }
    });
  }
  for (const doc of documents) {
    if (doc.kind === 'template' && doc.supplierId === source.id)
      plan.templates.push({
        before: doc,
        after: {
          ...doc,
          supplierId: target.id,
          lines: doc.lines.map(l => ({ ...l, offerId: remap.get(l.offerId)?.id || l.offerId }))
        }
      });
    if (doc.kind === 'rule' && doc.supplierId === source.id) {
      if (documents.some(d => d.kind === 'rule' && d.supplierId === target.id)) plan.ruleStays = true;
      else plan.rule = { before: doc, after: { ...doc, supplierId: target.id } };
    }
  }
  const stamp = today.split('-').reverse().join('.');
  plan.retired = {
    ...source,
    active: false,
    mergedInto: target.id,
    note: [source.note.trim(), 'Zusammengelegt mit ' + target.name + ' am ' + stamp + '.'].filter(Boolean).join(' | ')
  };
  return plan;
}

/** Kurzfassung für die Erfolgsmeldung. */
export function mergeSummary(plan: MergePlan): string {
  const n = plan.moved.length;
  return (
    '„' +
    plan.source.name +
    '“ ist in „' +
    plan.target.name +
    '“ aufgegangen: ' +
    n +
    (n === 1 ? ' Artikel gewechselt' : ' Artikel gewechselt') +
    (plan.drafts.length
      ? ', ' + plan.drafts.length + (plan.drafts.length === 1 ? ' Bestellentwurf' : ' Bestellentwürfe') + ' umgestellt'
      : '') +
    '.'
  );
}
