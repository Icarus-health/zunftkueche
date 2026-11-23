// Lieferanten zusammenlegen: Seite mit Vorschau und der Ablauf beim Bestätigen.
// Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import type { KitchenView } from '../view';
import type { Stored, Offer, Order, Supplier } from '../model';
import type { WwDocument } from '../ww/model';
import { planMerge, mergeSummary } from '../supplier-merge.ts';
import type { MergePlan } from '../supplier-merge';
import { stableId } from '../ww/domain.ts';
import { h, button, select } from '../markup.ts';

const today = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const docs = (app: KitchenView): WwDocument[] => (app.state?.ww?.records || []).map(r => r.value);

function names(items: string[], limit = 12): string {
  const shown = items.slice(0, limit).map(h).join(', ');
  return items.length > limit ? shown + ' und ' + (items.length - limit) + ' weitere' : shown;
}
function row(count: number, one: string, many: string, detail = ''): string {
  return count
    ? '<li><strong>' +
        count +
        ' ' +
        h(count === 1 ? one : many) +
        '</strong>' +
        (detail ? '<small>' + detail + '</small>' : '') +
        '</li>'
    : '';
}
function preview(plan: MergePlan): string {
  const target = h(plan.target.name),
    source = h(plan.source.name);
  const moves =
    row(
      plan.moved.length,
      'Artikel wechselt zu ' + plan.target.name,
      'Artikel wechseln zu ' + plan.target.name,
      names(plan.moved.map(m => m.article))
    ) +
    row(
      plan.doubled.length,
      'Artikel gibt es bei ' + plan.target.name + ' schon gleich',
      'Artikel gibt es bei ' + plan.target.name + ' schon gleich',
      names(plan.doubled.map(m => m.article)) + '. Der Eintrag von ' + target + ' bleibt, der alte wird stillgelegt.'
    ) +
    row(
      plan.drafts.length,
      'Bestellentwurf wird auf ' + plan.target.name + ' umgestellt',
      'Bestellentwürfe werden auf ' + plan.target.name + ' umgestellt'
    ) +
    row(plan.templates.length, 'Bestellvorlage wechselt', 'Bestellvorlagen wechseln') +
    (plan.rule ? '<li><strong>Bestellschluss und Liefertage wechseln</strong></li>' : '');
  const stays =
    row(
      plan.fixedOrders,
      'aufgegebene oder abgeschlossene Bestellung',
      'aufgegebene oder abgeschlossene Bestellungen'
    ) +
    row(plan.bills, 'Rechnung dieser Saison', 'Rechnungen dieser Saison') +
    row(
      plan.priceLists,
      'frühere Preisliste',
      'frühere Preislisten',
      'Der heute gültige Preis wandert mit dem Artikel mit.'
    ) +
    row(
      plan.left.length,
      'Gebinde zu inaktiven Artikeln',
      'Gebinde zu inaktiven Artikeln',
      names(plan.left.map(m => m.article))
    ) +
    (plan.ruleStays
      ? '<li><strong>Bestellschluss und Liefertage</strong><small>' +
        target +
        ' hat eigene, sie gelten weiter.</small></li>'
      : '');
  return (
    '<section class="merge-preview"><h2>Das wechselt zu ' +
    target +
    '</h2>' +
    (moves ? '<ul>' + moves + '</ul>' : '<p>Nichts. ' + source + ' hat keine Artikel oder Entwürfe.</p>') +
    '<h2>Das bleibt unter dem alten Namen lesbar</h2>' +
    (stays ? '<ul>' + stays + '</ul>' : '<p>Nichts.</p>') +
    '<p class="merge-note">Danach ist „' +
    source +
    '“ inaktiv und steht nicht mehr in den Auswahllisten. Rückgängig machen geht nur von Hand.</p></section>'
  );
}

/** Seite „Lieferanten zusammenlegen“. */
export function mergeForm(app: KitchenView): string {
  const s = app.state!,
    merging = app.merging!;
  const source = s.suppliers.find(r => r.value.id === merging.sourceId)?.value;
  if (!source)
    return '<section class="panel"><h1>Lieferanten zusammenlegen</h1><p>Lieferant nicht gefunden.</p></section>';
  const options: Array<[string, string]> = [
    ['', 'Bitte wählen'],
    ...s.suppliers
      .map(r => r.value)
      .filter(v => v.active && v.id !== source.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(v => [v.id, v.name] as [string, string])
  ];
  let body = '';
  if (merging.targetId) {
    try {
      body = preview(planMerge(s, docs(app), source.id, merging.targetId, today()));
    } catch (error) {
      body = '<p role="alert">' + h(error instanceof Error ? error.message : String(error)) + '</p>';
    }
  }
  return (
    '<form data-form="merge" class="panel merge-form"><h1>Lieferanten zusammenlegen</h1><p>„' +
    h(source.name) +
    '“ geht in einem anderen Lieferanten auf. Seine Artikel mit Gebinde und Preis und seine Bestellentwürfe wechseln dorthin.</p>' +
    select('mergeTarget', '„' + source.name + '“ zusammenlegen mit', options, merging.targetId, 'required') +
    body +
    '<div class="actions"><button type="submit" class="primary"' +
    (merging.targetId ? '' : ' disabled') +
    '>Zusammenlegen</button>' +
    button('cancel', 'Abbrechen') +
    '</div></form>'
  );
}

/** Öffnet die Seite. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export function mergeAction(app: KitchenView, action: string, id: string): boolean {
  if (action !== 'supplier-merge') return false;
  if (!app.canLeave()) return true;
  if (!app.state?.suppliers.some(s => s.value.id === id)) throw new Error('Lieferant nicht gefunden. Bitte neu laden.');
  app.clearEditor();
  app.view = 'suppliers';
  app.merging = { sourceId: id, targetId: '' };
  app.render();
  return true;
}

/** Führt das Zusammenlegen aus. Jeder Schritt hat eine eigene, feste Kennung: bricht es ab, setzt ein neuer Versuch dort fort. */
export async function saveMerge(app: KitchenView): Promise<void> {
  const s = app.state!,
    merging = app.merging;
  if (!merging?.targetId) throw new Error('Bitte den Lieferanten wählen, mit dem zusammengelegt wird.');
  const plan = planMerge(s, docs(app), merging.sourceId, merging.targetId, today());
  const base = app.operationId;
  const op = (part: string, id: string): string => 'merge-' + stableId(base + '|' + part + '|' + id);
  const offer = (id: string): Stored<Offer> | undefined => s.offers.find(o => o.value.id === id);
  const order = (id: string): Stored<Order> | undefined => s.orders.find(o => o.value.id === id);
  const doc = (id: string): Stored<WwDocument> | undefined => s.ww?.records.find(r => r.value.id === id);
  const supplier = (id: string): Stored<Supplier> | undefined => s.suppliers.find(r => r.value.id === id);
  await app.run(
    async () => {
      for (const m of plan.moved)
        await app.store.saveMaster('offers', m.after, offer(m.before.id), op('move', m.before.id), true);
      for (const d of plan.doubled)
        await app.store.saveMaster('offers', d.after, offer(d.before.id), op('double', d.before.id));
      for (const d of plan.drafts) await app.store.saveOrder(d.after, order(d.before.id), op('order', d.before.id));
      for (const t of plan.templates) await app.store.ww.save(t.after, doc(t.before.id), op('template', t.before.id));
      if (plan.rule)
        await app.store.ww.save(plan.rule.after, doc(plan.rule.before.id), op('rule', plan.rule.before.id));
      await app.store.saveMaster('suppliers', plan.retired, supplier(plan.source.id), op('supplier', plan.source.id));
    },
    mergeSummary(plan),
    () => {
      app.view = 'suppliers';
    }
  );
}
