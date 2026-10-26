import type { Area, Workspace } from '../model';
import type { Movement, Plan, Recipe } from './model';
import { documents } from './model.ts';
import { recipeDemand, stockProjection, round } from './domain.ts';
import { button, field, h, n, money, note, select, empty, check } from '../markup.ts';
import { heading, confirmationActions, dayLabel } from './common.ts';
export function operationLine(kind: 'recipe' | 'plan', s: Workspace, line?: Recipe['ingredients'][number] | Plan['lines'][number]): string {
    const recipes = documents(s.ww, 'recipe').filter(r => r.confirmed);
    return `<div class="ww-line" data-line>${kind === 'recipe' ? select('articleId', 'Zutat', s.articles.filter(r => r.value.active).map(r => [r.value.id, r.value.name + ' · ' + r.value.unit]), line && 'articleId' in line ? line.articleId : '') + field('quantity', 'Zutatenmenge (Einheit bei der Zutat)', line && 'quantity' in line ? n(line.quantity) : '', true, 'text', 'inputmode="decimal"') : select('recipeId', 'Gericht / Getränk', recipes.map(r => [r.id, r.name]), line && 'recipeId' in line ? line.recipeId : '') + field('portions', 'Portionen / Stück', line && 'portions' in line ? n(line.portions) : '', true, 'text', 'inputmode="decimal"')}${button('ww-remove', 'Entfernen')}</div>`;
}
export function operationForm(d: Recipe | Plan | Movement, s: Workspace): string {
    let body = '';
    if (d.kind === 'recipe')
        body = field('name', 'Rezept / Verkaufsprodukt', d.name, true) + field('category', 'Kategorie', d.category) + field('yield', 'Rezept für wie viele Portionen / Stück?', n(d.yield), true, 'text', 'inputmode="decimal"') + field('salePriceGross', 'Verkaufspreis brutto je Portion / Stück', n(d.salePriceGross), false, 'text', 'inputmode="decimal"') + `<p class="ww-full">Zutatenmengen gelten für die gesamte Ausbeute. Die Einheit steht jeweils bei der gewählten Zutat (z. B. kg, l, Flasche).</p><div class="ww-lines">${d.ingredients.map(l => operationLine('recipe', s, l)).join('')}</div>` + button('ww-add', 'Zutat hinzufügen', 'recipe') + button('ww-ingredient','Neue Zutat mit Liefergebinde anlegen') + '<div class="recipe-cost" data-recipe-cost>Zutaten und Mengen ergänzen – der Wareneinsatz wird hier sofort berechnet.</div>' + check('confirmed', 'Rezept geprüft und freigeben (bleibt als Version erhalten)', d.confirmed);
    if (d.kind === 'plan')
        body = field('name', 'Anlass / Plan', d.name, true) + field('date', 'Verwendungstag', d.date, true, 'date') + `<div class="ww-lines">${d.lines.map(l => operationLine('plan', s, l)).join('')}</div>` + button('ww-add', 'Rezept hinzufügen', 'plan') + note('note', 'Hinweise', d.note);
    if (d.kind === 'movement')
        body = select('articleId', 'Artikel', s.articles.filter(r => r.value.active).map(r => [r.value.id, r.value.name + ' · ' + r.value.unit]), d.articleId) + select('type', 'Was ist passiert?', [['incoming', 'Zusätzlicher Wareneingang'], ['return', 'Retoure an Lieferant'], ['waste', 'Verlust / Verderb'], ['internal', 'Eigenverbrauch'], ['transfer', 'Umlagerung'], ['opening', 'Anfangsbestand setzen'], ['count', 'Korrektur durch Zählung']], d.type) + field('quantity', 'Menge in Artikel-Basiseinheit', n(d.quantity), true, 'text', 'inputmode="decimal"') + field('at', 'Zeitpunkt', new Date(Date.parse(d.at) - new Date(d.at).getTimezoneOffset() * 60000).toISOString().slice(0, 23), true, 'datetime-local', 'step="0.001"') + '<details class="ww-full"><summary>Lager und Übergabe (nur bei Bedarf)</summary>' + field('place', 'Ausgangslager (leer = Standardlager)', d.place) + select('toArea', 'Zielbereich (nur Umlagerung)', [['Küche', 'Küche'], ['Zunftscheuer', 'Zunftscheuer']], d.toArea || d.area) + field('toPlace', 'Ziellager (leer = Standardlager)', d.toPlace) + '</details>' + note('note', 'Grund / Belegverweis', d.note) + `<p class="ww-full ww-alert">Bereits über eine Bestellung angenommene Ware hier nicht erneut als Eingang buchen. Eine Buchung ist nach der Bestätigung unveränderlich; Fehler mit einer Gegenbuchung korrigieren.</p>`;
    return `<form data-form="ww-${d.kind}" class="panel ww-editor">${heading(d.kind === 'recipe' ? 'Rezept / Verkaufsprodukt' : d.kind === 'plan' ? 'Portionen planen' : 'Verbrauch oder Übergabe erfassen', 'Einfache Eingabe, nachvollziehbare Mengen.')}<div class="formgrid">${body}</div>${confirmationActions(d.kind === 'movement' ? 'Buchung bestätigen' : 'Speichern')}</form>`;
}
export function operationOverview(page: string, s: Workspace, area: Area, season: string, place = ''): string {
    if (page === 'recipes')
        return heading('Speisen & Getränke', 'Gerichte und Getränke kalkulieren und für die Veranstaltung einplanen.', button('ww-new', 'Rezept anlegen', 'recipe', true)) + `<div class="actions">${button('ww-open', 'Portionen planen', 'plans')}</div><section class="panel">${documents(s.ww, 'recipe').sort((a,b)=>b.at.localeCompare(a.at)).filter((r,i,all)=>all.findIndex(x=>x.familyId===r.familyId)===i).map(r => { const demand = recipeDemand(r, 1, s, documents(s.ww, 'prices')); return `<div class="listrow"><div><h2>${h(r.name)}</h2><p>${h(r.category)} · ${r.confirmed ? 'Freigegeben' : 'Entwurf'} · Ausbeute ${n(r.yield)}</p><small>Wareneinsatz netto je Portion: ${money(demand.costNet)} · Verkauf brutto: ${money(r.salePriceGross)}</small></div>${button('ww-edit', r.confirmed ? 'Rezept bearbeiten' : 'Bearbeiten', r.id)}</div>`; }).join('') || empty('Noch keine Rezepte. Auch Getränke können als Verkaufsprodukt mit einer Zutat angelegt werden.')}</section>`;
    if (page === 'plans')
        return heading('Portionen und Bedarf', 'Verwendungstag planen. Der Einkauf wird anschließend nach Liefertermin vorbereitet.', button('ww-new', 'Plan anlegen', 'plan', true)) + `<div class="actions">${button('ww-open', 'Rezepte pflegen', 'recipes')}${button('ww-open','Kassen- / Menüdatei einlesen','systems')}</div><section class="panel">${documents(s.ww, 'plan').filter(r => r.area === area).map(p => `<div class="listrow"><div><h2>${h(p.name)}</h2><p>${dayLabel(p.date)} · ${p.lines.length} Rezepturen</p></div><div class="actions">${button('ww-demand', 'Zutatenbedarf ansehen', p.id, true)}${button('ww-procure', 'Einkauf vorbereiten', p.id)}${button('ww-edit', 'Bearbeiten', p.id)}</div></div>`).join('') || empty('Noch keine Portionsplanung.')}</section>`;
    if (page === 'journal') {
        const docs = (s.ww?.records || []).map(r => r.value), rows = stockProjection(s, docs, season, area, place);
        const places = [...new Set(['', ...documents(s.ww, 'movement').flatMap(d => [d.place, d.toPlace])])];
        return '<div class="actions">' + places.map(p => button('ww-place', p || 'Standardlager', p)).join('') + '</div>' + heading('Bestandsbewegungen', 'Rechnerischer Bestand ab letzter Zählung · ' + (place || 'Standardlager'), button('ww-new', 'Bewegung buchen', 'movement', true)) + `<p class="ww-alert">Offen bedeutet: Es fehlt ein verlässlicher Anfangsbestand oder eine zeitliche Zuordnung. Abweichungen durch erneutes Zählen klären.</p><section class="panel">${rows.map(r => `<div class="listrow"><div><strong>${h(r.name)}</strong><small>${r.countedAt ? 'Zählgrundlage: ' + h(new Date(r.countedAt).toLocaleString('de-DE')) : 'Noch keine Zählgrundlage'}${r.issues.length ? ' · ' + h(r.issues.join(' ')) : ''}</small></div><strong>${r.quantity === null ? 'Offen' : n(r.quantity) + ' ' + h(r.unit)}</strong></div>`).join('')}</section><h2>Buchungsjournal</h2><section class="panel">${documents(s.ww, 'movement').filter(d => d.area === area || d.toArea === area).sort((a, b) => b.at.localeCompare(a.at)).map(d => `<div class="listrow"><div><strong>${h(s.articles.find(a => a.value.id === d.articleId)?.value.name || d.articleId)}</strong><p>${h(d.type)} · ${n(d.quantity)} ${h(d.unit)} · ${h(d.place || 'Standardlager')}${d.type === 'transfer' ? ' → ' + h(d.toArea) + ' / ' + h(d.toPlace || 'Standardlager') : ''}</p><small>${h(new Date(d.at).toLocaleString('de-DE'))} · ${h(d.by)} · ${h(d.note)}</small></div></div>`).join('') || empty('Noch keine zusätzlichen Bewegungen. Wareneingänge aus Bestellungen werden automatisch berücksichtigt.')}</section>`;
    }
    return '';
}
export function demandView(plan: Plan, s: Workspace): string { const recipes = documents(s.ww, 'recipe'), issues: string[] = [], sum = new Map<string, {
    name: string;
    unit: string;
    quantity: number;
}>(); for (const line of plan.lines) {
    const recipe = recipes.find(r => r.id === line.recipeId);
    if (!recipe) {
        issues.push('Rezeptversion fehlt.');
        continue;
    }
    const demand = recipeDemand(recipe, line.portions, s, documents(s.ww, 'prices'), plan.date);
    issues.push(...demand.issues);
    for (const r of demand.rows) {
        const old = sum.get(r.articleId);
        sum.set(r.articleId, { name: r.name, unit: r.unit, quantity: round((old?.quantity || 0) + r.quantity) });
    }
} return heading('Zutatenbedarf', plan.name + ' · ' + dayLabel(plan.date), button('ww-cancel', 'Zurück')) + `<p>Bruttobedarf aus geplanten Portionen. Vorhandene Bestände und bereits bestellte Mengen vor dem Einkauf gesondert prüfen.</p>${issues.map(i => `<p class="ww-alert">${h(i)}</p>`).join('')}<section class="panel">${[...sum.values()].map(r => `<div class="listrow"><strong>${h(r.name)}</strong><span>${n(r.quantity)} ${h(r.unit)}</span></div>`).join('') || empty('Noch kein berechenbarer Zutatenbedarf.')}</section><div class="actions">${button('ww-procure','Zutaten in Bestellungen übernehmen',plan.id,true)}</div>`; }
