import type { Area, Workspace } from '../model';
import { areaOptions, articleAvailable } from '../model.ts';
import type { EquipmentItem, Movement, Plan, Recipe } from './model';
import { documents } from './model.ts';
import { planDemand, recipeDemand, stockProjection } from './domain.ts';
import type { StockRow } from './domain';
import { button, field, h, n, money, note, select, empty, check } from '../markup.ts';
import { heading, confirmationActions, dayLabel, today } from './common.ts';
import { planAlreadyOrdered } from './plan-procurement.ts';

export function nextUsePlans(s: Workspace, season: string, area: Area, from = today()): Plan[] {
  return documents(s.ww, 'plan')
    .filter(p => p.scope === season && p.area === area && p.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, 'de'));
}

export function preparedOrdersView(s: Workspace, ids: string[]): string {
  const orders = s.orders.map(row => row.value).filter(order => ids.includes(order.id));
  return (
    heading('Bestellungen prüfen', 'Entwürfe aus der Portionsplanung', button('ww-open', 'Weitere Einsätze', 'plans')) +
    '<section class="workflow-starts">' +
    orders
      .map(
        order =>
          '<div class="workflow-start"><div><h2>' +
          h(order.supplierName) +
          '</h2><p>' +
          h(order.occasion) +
          '</p></div>' +
          button(
            order.status === 'Entwurf' ? 'order-edit' : 'order-open',
            order.status === 'Entwurf' ? 'Entwurf prüfen' : 'Ansehen',
            order.id
          ) +
          '</div>'
      )
      .join('') +
    '</section>'
  );
}
export function operationLine(
  kind: 'recipe' | 'plan',
  s: Workspace,
  line?: Recipe['ingredients'][number] | Plan['lines'][number]
): string {
  const recipes = documents(s.ww, 'recipe').filter(r => r.confirmed);
  return `<div class="ww-line" data-line>${kind === 'recipe' ? select('articleId', 'Zutat', [['', 'Zutat auswählen'], ...s.articles.filter(r => r.value.active).map(r => [r.value.id, r.value.name + ' · ' + r.value.unit] as [string, string])], line && 'articleId' in line ? line.articleId : '', 'required') + field('quantity', 'Zutatenmenge (Einheit bei der Zutat)', line && 'quantity' in line ? n(line.quantity) : '', true, 'text', 'inputmode="decimal"') : select('recipeId', 'Gericht / Getränk', [['', 'Gericht auswählen'], ...recipes.map(r => [r.id, r.name] as [string, string])], line && 'recipeId' in line ? line.recipeId : '', 'required') + field('portions', 'Portionen / Stück', line && 'portions' in line ? n(line.portions) : '', true, 'text', 'inputmode="decimal"')}${button('ww-remove', 'Entfernen')}</div>`;
}
export function materialLine(s: Workspace, season: string, line?: NonNullable<Plan['materials']>[number]): string {
  const articles = s.articles.map(r => r.value).filter(a => articleAvailable(a, season) || a.id === line?.articleId);
  const options: [string, string][] = [
    ['', 'Artikel auswählen'],
    ...articles
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((a): [string, string] => [a.id, a.name + ' · ' + (a.id === line?.articleId ? line.unit : a.unit)])
  ];
  if (line && !articles.some(a => a.id === line.articleId))
    options.push([line.articleId, 'Artikel fehlt · ' + line.unit]);
  return (
    '<div class="ww-line" data-material>' +
    select('materialArticleId', 'Artikel', options, line?.articleId ?? '', 'required') +
    field('materialQuantity', 'Menge', line ? n(line.quantity) : '', true, 'text', 'inputmode="decimal"') +
    button('ww-remove', 'Entfernen') +
    '</div>'
  );
}

const equipmentActions: [EquipmentItem['action'], string][] = [
  ['prüfen', 'Prüfen'],
  ['besorgen', 'Besorgen'],
  ['ausleihen', 'Ausleihen']
];

export function operationForm(d: Recipe | Plan | EquipmentItem | Movement, s: Workspace): string {
  let body = '';
  if (d.kind === 'recipe')
    body =
      field('name', 'Rezept / Verkaufsprodukt', d.name, true) +
      field('category', 'Kategorie', d.category) +
      field('yield', 'Rezept für wie viele Portionen / Stück?', n(d.yield), true, 'text', 'inputmode="decimal"') +
      field(
        'salePriceGross',
        'Verkaufspreis brutto je Portion / Stück',
        n(d.salePriceGross),
        false,
        'text',
        'inputmode="decimal"'
      ) +
      `<p class="ww-full">Zutatenmengen gelten für die gesamte Ausbeute. Die Einheit steht jeweils bei der gewählten Zutat (z. B. kg, l, Flasche).</p><div class="ww-lines">${d.ingredients.map(l => operationLine('recipe', s, l)).join('')}</div>` +
      button('ww-add', 'Zutat hinzufügen', 'recipe') +
      button('ww-ingredient', 'Neue Zutat mit Liefergebinde anlegen') +
      '<div class="recipe-cost" data-recipe-cost>Zutaten und Mengen ergänzen – der Wareneinsatz wird hier sofort berechnet.</div>' +
      check('confirmed', 'Rezept geprüft und freigeben (bleibt als Version erhalten)', d.confirmed);
  if (d.kind === 'plan')
    body =
      field('name', 'Einsatz', d.name, true) +
      field('date', 'Verwendungstag', d.date, true, 'date') +
      `<div class="ww-lines">${d.lines.map(l => operationLine('plan', s, l)).join('')}</div>` +
      button('ww-add', 'Gericht / Getränk hinzufügen', 'plan') +
      `<details class="ww-full"${d.materials?.length ? ' open' : ''}><summary>Verbrauchsmaterial</summary>
                <div class="ww-materials">${(d.materials ?? []).map(l => materialLine(s, d.scope, l)).join('')}</div>
                ${button('ww-add-material', 'Material hinzufügen')}</details>` +
      '<details class="ww-full"><summary>Hinweise</summary>' +
      note('note', 'Hinweise', d.note) +
      '</details>';
  if (d.kind === 'equipment')
    body =
      field('name', 'Arbeitsmittel', d.name, true) +
      field('needed', 'Benötigte Stück', n(d.needed), true, 'text', 'inputmode="numeric"') +
      field(
        'available',
        'Vorhandene Stück',
        n(d.available),
        false,
        'text',
        'inputmode="numeric" placeholder="Noch offen"'
      ) +
      select('action', 'Bei Fehlmenge', equipmentActions, d.action) +
      note('note', 'Ort oder kurze Notiz', d.note);
  if (d.kind === 'movement')
    body =
      select(
        'articleId',
        'Artikel',
        s.articles.filter(r => r.value.active).map(r => [r.value.id, r.value.name + ' · ' + r.value.unit]),
        d.articleId
      ) +
      select(
        'type',
        'Was ist passiert?',
        [
          ['incoming', 'Zusätzlicher Wareneingang'],
          ['return', 'Retoure an Lieferant'],
          ['waste', 'Verlust / Verderb'],
          ['internal', 'Eigenverbrauch'],
          ['transfer', 'Übergabe in anderen Bereich oder Lager'],
          ['opening', 'Anfangsbestand setzen'],
          ['count', 'Korrektur durch Zählung']
        ],
        d.type
      ) +
      field('quantity', 'Menge in Artikel-Basiseinheit', n(d.quantity), true, 'text', 'inputmode="decimal"') +
      field(
        'at',
        'Zeitpunkt',
        new Date(Date.parse(d.at) - new Date(d.at).getTimezoneOffset() * 60000).toISOString().slice(0, 23),
        true,
        'datetime-local',
        'step="0.001"'
      ) +
      '<details class="ww-full"' +
      (d.type === 'transfer' ? ' open' : '') +
      '><summary>Lager und Übergabe (nur bei Bedarf)</summary>' +
      field('place', 'Ausgangslager (leer = Standardlager)', d.place) +
      select('toArea', 'Zielbereich (nur Übergabe)', areaOptions(), d.toArea || d.area) +
      field('toPlace', 'Ziellager (leer = Standardlager)', d.toPlace) +
      '</details>' +
      note('note', 'Grund / Belegverweis', d.note) +
      `<p class="ww-full ww-alert">Bereits über eine Bestellung angenommene Ware hier nicht erneut als Eingang buchen. Eine Buchung ist nach der Bestätigung unveränderlich; Fehler mit einer Gegenbuchung korrigieren.</p>`;
  return `<form data-form="ww-${d.kind}" class="panel ww-editor">${heading(d.kind === 'recipe' ? 'Rezept / Verkaufsprodukt' : d.kind === 'plan' ? 'Einsatz planen' : d.kind === 'equipment' ? 'Arbeitsmittel' : 'Verbrauch oder Übergabe erfassen', '')}<div class="formgrid">${body}</div>${confirmationActions(d.kind === 'movement' ? 'Buchung bestätigen' : 'Speichern')}</form>`;
}
export function operationOverview(page: string, s: Workspace, area: Area, season: string, place = ''): string {
  if (page === 'next-use')
    return (
      heading(
        'Nächsten Einsatz prüfen',
        'Wähle, wofür die gezählten Mengen reichen sollen.',
        button('nav', 'Zum Bestand', 'stock')
      ) +
      '<section class="workflow-starts">' +
      (nextUsePlans(s, season, area)
        .map(
          plan =>
            '<div class="workflow-start"><div><h2>' +
            h(plan.name) +
            '</h2><p>' +
            h(dayLabel(plan.date)) +
            '</p></div>' +
            button('ww-next-plan', 'Bedarf prüfen', plan.id) +
            '</div>'
        )
        .join('') || empty('Keine anstehenden Einsätze geplant.')) +
      '</section>'
    );
  if (page === 'recipes')
    return (
      heading(
        'Speisen & Getränke',
        'Gerichte und Getränke kalkulieren und für die Veranstaltung einplanen.',
        button('ww-new', 'Rezept anlegen', 'recipe', true)
      ) +
      `<div class="actions">${button('ww-open', 'Portionen planen', 'plans')}${button('menu-open', 'Preiskarte für den Zunftabend')}</div><section class="data-list recipe-list"><div class="recipe-list-head" aria-hidden="true"><span>Rezept / Verkaufsprodukt</span><span>Status</span><span>Wareneinsatz netto</span><span>Verkauf brutto</span><span>Aktion</span></div>${
        documents(s.ww, 'recipe')
          .sort((a, b) => b.at.localeCompare(a.at))
          .filter((r, i, all) => all.findIndex(x => x.familyId === r.familyId) === i)
          .map(r => {
            const demand = recipeDemand(r, 1, s, documents(s.ww, 'prices'));
            return `<div class="recipe-list-row"><div><strong>${h(r.name)}</strong><small>${h(r.category || 'Ohne Kategorie')} · Ausbeute ${n(r.yield)}</small></div><span><span class="sr-only">Status: </span>${r.confirmed ? 'Freigegeben' : 'Entwurf'}</span><span><span class="sr-only">Wareneinsatz netto: </span>${money(demand.costNet)} <small>je Portion</small></span><span><span class="sr-only">Verkauf brutto: </span>${money(r.salePriceGross)} <small>je Portion</small></span>${button('ww-edit', r.confirmed ? 'Rezept bearbeiten' : 'Bearbeiten', r.id)}</div>`;
          })
          .join('') ||
        empty('Noch keine Rezepte. Auch Getränke können als Verkaufsprodukt mit einer Zutat angelegt werden.')
      }</section>`
    );
  if (page === 'plans') {
    const plans = documents(s.ww, 'plan')
      .filter(plan => plan.scope === season && plan.area === area)
      .sort((a, b) => a.date.localeCompare(b.date));
    return (
      heading(
        'Portionen und Bedarf',
        'Plane die Mengen je Einsatz.',
        button('ww-new', 'Einsatz planen', 'plan', true)
      ) +
      '<div class="actions">' +
      button('ww-open', 'Rezepte', 'recipes') +
      button('ww-open', 'Arbeitsmittel', 'equipment') +
      button('ww-open', 'Kassendaten einlesen', 'systems') +
      '</div>' +
      '<section class="workflow-starts">' +
      (plans
        .map(plan => {
          const ordered = planAlreadyOrdered(plan, s);
          const action = ordered
            ? plan.date >= today()
              ? button('ww-next-plan', 'Nachbestellung prüfen', plan.id)
              : ''
            : button('ww-procure', 'Einkauf vorbereiten', plan.id);
          return (
            '<div class="workflow-start"><div><h2>' +
            h(plan.name) +
            '</h2><p>' +
            h(dayLabel(plan.date)) +
            (plan.lines.length ? ' · ' + plan.lines.length + ' Gerichte / Getränke' : '') +
            (plan.materials?.length ? ' · ' + plan.materials.length + ' Materialpositionen' : '') +
            '</p>' +
            '<details><summary>Plan ansehen oder ändern</summary><div class="actions">' +
            button('ww-demand', 'Bedarf ansehen', plan.id) +
            button('ww-edit', 'Bearbeiten', plan.id) +
            '</div></details></div>' +
            action +
            '</div>'
          );
        })
        .join('') || empty('Noch keine Portionsplanung.')) +
      '</section>'
    );
  }
  if (page === 'equipment') {
    const editable = s.seasons.some(r => r.value.id === season && !r.value.archived);
    const items = documents(s.ww, 'equipment')
      .filter(item => item.scope === season && item.area === area)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return (
      heading(
        'Arbeitsmittel',
        'Vorbereitung · ' + area,
        editable ? button('ww-new', 'Arbeitsmittel hinzufügen', 'equipment', true) : ''
      ) +
      '<div class="actions">' +
      button('ww-open', 'Zu den Einsätzen', 'plans') +
      '</div>' +
      '<section class="data-list">' +
      (items
        .map(item => {
          const missing = item.available === null ? null : Math.max(0, item.needed - item.available);
          const action = equipmentActions.find(([value]) => value === item.action)?.[1];
          const status =
            item.needed === 0
              ? 'Nicht benötigt'
              : missing === null
                ? 'Bestand prüfen'
                : missing === 0
                  ? 'Vorhanden'
                  : missing + (missing === 1 ? ' fehlt · ' : ' fehlen · ') + action;
          return (
            '<div class="listrow"><div><strong>' +
            h(item.name) +
            '</strong><small>' +
            (item.available === null ? 'Bestand offen' : n(item.available) + ' vorhanden') +
            ' · ' +
            n(item.needed) +
            ' benötigt' +
            (item.note ? ' · ' + h(item.note) : '') +
            '</small></div><span>' +
            h(status) +
            '</span>' +
            (editable ? button('ww-edit', 'Bearbeiten', item.id) : '') +
            '</div>'
          );
        })
        .join('') || empty('Für diese Saison sind noch keine Arbeitsmittel erfasst.')) +
      '</section>'
    );
  }
  if (page === 'journal') {
    const docs = (s.ww?.records || []).map(r => r.value),
      rows = seasonStockRows(s, stockProjection(s, docs, season, area, place), season);
    const places = [...new Set(['', ...documents(s.ww, 'movement').flatMap(d => [d.place, d.toPlace])])];
    return (
      '<div class="actions">' +
      places.map(p => button('ww-place', p || 'Standardlager', p)).join('') +
      '</div>' +
      heading(
        'Bestandsbewegungen',
        'Rechnerischer Bestand ab letzter Zählung · ' + (place || 'Standardlager'),
        button('ww-new', 'Bewegung buchen', 'movement', true)
      ) +
      `<p class="ww-alert">Offen bedeutet: Es fehlt ein verlässlicher Anfangsbestand oder eine zeitliche Zuordnung. Abweichungen durch erneutes Zählen klären.</p><section class="panel">${rows.map(r => `<div class="listrow"><div><strong>${h(r.name)}</strong><small>${r.countedAt ? 'Zählgrundlage: ' + h(new Date(r.countedAt).toLocaleString('de-DE')) : 'Noch keine Zählgrundlage'}${r.issues.length ? ' · ' + h(r.issues.join(' ')) : ''}</small></div><strong>${r.quantity === null ? 'Offen' : n(r.quantity) + ' ' + h(r.unit)}</strong></div>`).join('')}</section><h2>Buchungsjournal</h2><section class="panel">${
        documents(s.ww, 'movement')
          .filter(d => d.area === area || d.toArea === area)
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(
            d =>
              `<div class="listrow"><div><strong>${h(s.articles.find(a => a.value.id === d.articleId)?.value.name || d.articleId)}</strong><p>${h({ incoming: 'Wareneingang', return: 'Retoure', waste: 'Verlust / Verderb', internal: 'Eigenverbrauch', transfer: 'Umlagerung', opening: 'Anfangsbestand', count: 'Zählkorrektur' }[d.type])} · ${n(d.quantity)} ${h(d.unit)} · ${h(d.place || 'Standardlager')}${d.type === 'transfer' ? ' → ' + h(d.toArea) + ' / ' + h(d.toPlace || 'Standardlager') : ''}</p><small>${h(new Date(d.at).toLocaleString('de-DE'))} · ${h(d.by)} · ${h(d.note)}</small></div></div>`
          )
          .join('') ||
        empty('Noch keine zusätzlichen Bewegungen. Wareneingänge aus Bestellungen werden automatisch berücksichtigt.')
      }</section>`
    );
  }
  return '';
}
/**
 * Articles of the season, as on the overview, the stock page and the count list.
 * An article outside the season stays listed while stock is still recorded for it, so nothing on the shelf disappears.
 */
export function seasonStockRows(s: Workspace, rows: StockRow[], season: string): StockRow[] {
  const inSeason = new Set(s.articles.filter(a => articleAvailable(a.value, season)).map(a => a.value.id));
  return rows.filter(
    r => inSeason.has(r.articleId) || r.countedAt !== null || r.quantity !== null || r.issues.length > 0
  );
}
export function demandView(plan: Plan, s: Workspace): string {
  const { rows, issues } = planDemand(plan, s);
  const action = planAlreadyOrdered(plan, s)
    ? plan.date >= today()
      ? button('ww-next-plan', 'Nachbestellung prüfen', plan.id, true)
      : ''
    : button('ww-procure', 'Einkauf vorbereiten', plan.id, true);
  return (
    heading('Bedarf', plan.name + ' · ' + dayLabel(plan.date), button('ww-cancel', 'Zurück')) +
    issues.map(i => `<p class="ww-alert">${h(i)}</p>`).join('') +
    '<section class="panel">' +
    (rows
      .map(r => `<div class="listrow"><strong>${h(r.name)}</strong><span>${n(r.quantity)} ${h(r.unit)}</span></div>`)
      .join('') || empty('Noch kein Bedarf erfasst.')) +
    '</section>' +
    (issues.length ? '' : '<div class="actions">' + action + '</div>')
  );
}
