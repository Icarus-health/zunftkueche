import type { KitchenState } from './state.ts';
import { effectiveSales } from './corrections.ts';
import { sameLocation, purchasingLocation, historicalLocations, resolveLocation } from './locations.ts';
import { stockSummary } from './workflow.ts';
import { buildReceivingList } from './receiving.ts';

export interface StockEvidenceTarget {
  articleId: string;
  location: string;
}

/** An article need not have a movement yet to require opening and closing evidence. */
export function requiredStockEvidence(state: KitchenState, scope: string) {
  const targets = new Map<string, StockEvidenceTarget>();
  let unassigned = false;
  const include = (location: string | undefined) =>
    scope === 'Alle' || sameLocation(state, location, scope);
  const add = (articleId: string | undefined, location: string | undefined) => {
    if (!include(location)) return;
    if (!articleId || !location) {
      unassigned = true;
      return;
    }
    const place = resolveLocation(state, location);
    targets.set(JSON.stringify([articleId, place]), { articleId, location: place });
  };

  for (const invoice of state.invoices) {
    if (!include(invoice.scope)) continue;
    if (!invoice.lines.length) unassigned = true;
    for (const line of invoice.lines) add(line.articleId, invoice.scope);
  }
  for (const order of state.orders) {
    for (const line of order.lines) {
      if (line.quantity !== 0) add(line.articleId, line.location ?? 'Küche');
    }
  }
  for (const line of state.planLines) {
    const quantity = line.allocations?.length
      ? line.allocations.reduce((sum, part) => sum + part.quantity, 0)
      : line.quantity;
    if (quantity !== 0) add(line.articleId, line.location ?? 'Küche');
  }
  for (const movement of state.movements) add(movement.articleId, movement.location);

  const kitchen = purchasingLocation(state);
  for (const menu of state.menu) {
    const used = state.sales.some(s => s.menuId === menu.id && s.quantity !== 0);
    if (!used || (scope !== 'Alle' && scope !== kitchen)) continue;
    const unresolved = !kitchen || !menu.recipe.length || menu.recipeStatus !== 'Bestätigt'
      || menu.supplyMode === 'manual'
      || (menu.category.toLowerCase().includes('getränk') && !menu.supplyMode);
    if (unresolved) unassigned = true;
    else for (const line of menu.recipe) add(line.articleId, kitchen!);
  }
  return { targets: [...targets.values()], unassigned };
}

function economicResult(state: KitchenState, scope: string, factIssues: string[]) {
  const evidence = state.economicEvidence?.at(-1);
  let reason: string | null = null;
  if (!evidence) reason = 'Bestätigte Nettoerlöse und bewerteter Nettoverbrauch fehlen.';
  else if (evidence.scope !== scope || scope !== purchasingLocation(state))
    reason = 'Bestätigter Nettoumfang und ausgewählter Küchenumfang sind nicht vergleichbar.';
  else if (evidence.revision !== state.revision)
    reason = `Nettobewertung gilt für Revision ${evidence.revision}; aktuelle Revision ${state.revision} muss neu bestätigt werden.`;
  else if (factIssues.length)
    reason = `Grundlagen unvollständig: ${factIssues.length} offene Prüfpunkte.`;

  return {
    resultCents: reason || !evidence ? null : evidence.netRevenueCents - evidence.netConsumptionCents,
    resultReason: reason ?? 'Bestätigte Nettoerlöse minus bewerteter Nettoverbrauch für denselben Umfang.',
    evidenceIssue: !evidence || evidence.scope !== scope || evidence.revision !== state.revision ? reason : null,
  };
}

export function buildClosureChecklist(state: KitchenState, scope: string) {
  if (scope !== 'Alle' && !historicalLocations(state).includes(scope))
    throw new Error('Abschlussumfang ist ungültig.');
  const open: string[] = [];
  const sales = effectiveSales(state).filter(s => ['Freitag', 'Samstag'].includes(s.day));
  const salesComplete = state.menu.length > 0 && state.menu.every(menu =>
    ['Freitag', 'Samstag'].every(day => sales.some(s =>
      s.menuId === menu.id && s.day === day && s.quantity !== null && s.priceCents !== null)));
  if (!salesComplete) open.push('Verkäufe oder bestätigte Verkaufspreise fehlen.');

  const invoices = state.invoices.filter(i => scope === 'Alle' || sameLocation(state, i.scope, scope));
  if (!invoices.length || invoices.some(i => i.grossCents === null))
    open.push('Bruttobelege fehlen oder sind offen.');
  if (invoices.some(i => i.netCents === null))
    open.push('Nettobeträge sind offen; Brutto ist kein Netto-Wareneinsatz.');
  if (state.invoices.some(i => !i.scope || i.scope === 'Offen'))
    open.push('Belegzuordnungen sind offen.');

  const required = requiredStockEvidence(state, scope);
  if (required.unassigned) open.push('Artikel- oder Ortszuordnung für Bestandsnachweise fehlt.');
  if (!required.targets.length || required.targets.some(target => {
    const stock = stockSummary(state, target.articleId, target.location);
    return stock.opening === null || stock.counted === null;
  })) open.push('Anfangsbestände oder Schlusszählungen fehlen.');

  if (state.orders.some(order => buildReceivingList(state, order.id).some(
    (line: { remaining: number | null }) => line.remaining === null || line.remaining > 0)))
    open.push('Bestellfassungen enthalten offene Liefermengen (einschließlich älterer Fassungen).');
  const comparable = scope !== 'Alle' && scope === purchasingLocation(state);
  if (!comparable) open.push('Kostenumfang und Küchenverkaufsumfang sind nicht vergleichbar.');

  const economics = economicResult(state, scope, open);
  if (economics.evidenceIssue) open.push(economics.evidenceIssue);
  return {
    scope,
    revision: state.revision,
    open,
    complete: open.length === 0,
    revenueCents: salesComplete && comparable
      ? sales.reduce((sum, sale) => sum + sale.quantity! * sale.priceCents!, 0) : null,
    grossReceiptsCents: invoices.length && invoices.every(i => i.grossCents !== null)
      ? invoices.reduce((sum, i) => sum + i.grossCents!, 0) : null,
    netReceiptsCents: invoices.length && invoices.every(i => i.netCents !== null)
      ? invoices.reduce((sum, i) => sum + i.netCents!, 0) : null,
    resultCents: economics.resultCents,
    resultReason: economics.resultReason,
  };
}
