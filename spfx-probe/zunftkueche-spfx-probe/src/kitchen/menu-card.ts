/* eslint-disable @rushstack/no-new-null -- Offene Preise bleiben ausdrücklich leer. */
// Karte für den Zunftabend: Auswahl aus Speisen & Getränken, Preise anpassen, Reihenfolge festlegen.
// Gespeichert als Warenwirtschaftsvorgang „menu“ je Saison. Ausdruck siehe menu-export.ts.
import type { Season, Workspace } from './model';
import type { MenuCard, MenuLine, MenuSection, Recipe } from './ww/model';
import { documents } from './ww/model.ts';
import { parseDecimal } from './domain.ts';
import { button, h, select } from './markup.ts';
import { icon } from './icons.ts';

export const MENU_SECTIONS: Array<{
  id: MenuSection;
  title: string;
  subtitle: string;
  numbered: boolean;
  producer: boolean;
}> = [
  { id: 'wine', title: 'Wein', subtitle: '0,75 l / 0,25 l Staufener Flaschenweine', numbered: true, producer: true },
  { id: 'sparkling', title: 'Sekt + Secco', subtitle: '0,2 l / 0,75 l Flaschen', numbered: true, producer: true },
  { id: 'drinks', title: 'Bier und alkoholfreie Getränke', subtitle: '', numbered: false, producer: false },
  { id: 'food', title: 'Speisen', subtitle: '', numbered: false, producer: false }
];
export const MENU_FOOTER =
  'Allergene Stoffe können nicht ausgeschlossen werden (Wein und Sekt enthalten Sulfite).\nDie vollständige Liste an Allergenen und Zusatzstoffen kann an der Theke eingesehen werden.';
export const menuId = (seasonId: string): string => 'menu-' + seasonId;
export const menuTitle = (year: number): string => '-Staufener Zunftabend ' + year + '-';

type Seed = [MenuSection, string, string, string, string, string, number | null];
/** Karte 2025 aus der Vorlage „Preislistezunft25 neues Design“. */
const CARD_2025: Seed[] = [
  ['wine', '1', 'Roter Gutedel QbA - feinherb', '', '0,75 l', 'Winzerhof Kerber', 15],
  ['wine', '2', 'Gutedel QbA - trocken', '', '0,75 l', 'Weingut Ulmann', 15],
  ['wine', '3', 'Weißer Burgunder QbA - trocken', '', '0,75 l', 'Weingut Wiesler', 16.5],
  ['wine', '12', 'Grauer Burgunder Landwein - trocken', '', '0,75 l', 'Winzerhof Kerber', 16.5],
  ['wine', '4', 'Riesling Kabinett - trocken', '', '0,75 l', 'Weingut Ulmann', 16.5],
  ['wine', '5', 'Spätburgunder Weißherbst QbA - feinherb', '', '0,75 l', 'Weinhaus Landmann', 16.5],
  ['wine', '6', 'Spätburgunder Rotwein QbA - trocken', '', '0,75 l', 'Weingut Wiesler', 16.5],
  ['wine', '7', 'Gutedel QbA - trocken', '', '0,25 l', 'Weinhaus Landmann', 4.5],
  ['sparkling', '8', 'Piccolo Dr. Faustus', '', '0,20 l', 'Weinhaus Landmann', 6],
  ['sparkling', '9', 'PROSIGI-Secco weiß trocken', '', '0,75 l', 'Winzerhof Kerber', 18],
  ['sparkling', '10', 'Winzersekt Weißer Burgunder -Brut-', '', '0,75 l', 'Weingut Wiesler', 25],
  ['sparkling', '11', 'Winzersekt Pinot Rosé -Brut-', '', '0,75 l', 'Weingut Ulmann', 25],
  ['drinks', '', 'Fürstenberg Pils / Radler', '', '0,33 l', '', 3.5],
  ['drinks', '', 'Alkoholfreies Bier', '', '0,33 l', '', 3.5],
  ['drinks', '', 'Paradies Prickler Apfel-Rose', 'alkoholfreier Piccolo', '0,2 l', '', 4.5],
  ['drinks', '', 'Cola / Mirinda', '', '0,33 l', '', 3],
  ['drinks', '', 'Paulaner Spezi', '', '0,33 l', '', 3],
  ['drinks', '', 'Apfelschorle', '', '0,5 l', '', 4],
  ['drinks', '', 'Mineralwasser', '', '0,5 l', '', 3],
  ['drinks', '', 'Zitronenlimonade', '', '0,5 l', '', 3],
  ['food', '', 'Bauern- oder Bockwurst mit Brot', '', '', '', 5],
  ['food', '', 'Bauern- oder Bockwurst mit Kartoffelsalat', '', '', '', 8],
  ['food', '', 'Schäufele mit Kartoffelsalat', '', '', '', 10],
  ['food', '', 'Baguette mit Schinken oder Baguette mit Käse', '', '', '', 6.5],
  ['food', '', 'Baguette mit Schinken & Käse', '', '', '', 7],
  ['food', '', 'Baguette mit Schnitzel', '', '', '', 7],
  ['food', '', 'Weckle mit Gemüsebratling', '', '', '', 5.5],
  ['food', '', 'Käsewürfel', '', '', '', 6.5],
  ['food', '', 'Pikanter Wurstsalat mit Brot', '', '', '', 8]
];

/** Neueste Fassung je Rezept, ohne interne Verpflegung. */
export function menuRecipes(state: Workspace): Recipe[] {
  const latest = new Map<string, Recipe>();
  for (const r of documents(state.ww, 'recipe')) {
    const known = latest.get(r.familyId);
    if (!known || known.at < r.at) latest.set(r.familyId, r);
  }
  return [...latest.values()].filter(r => !/^intern\b/i.test(r.category) && !/^intern:/i.test(r.name));
}
const PRODUCERS: Array<[RegExp, string]> = [
  [/wiesler/i, 'Weingut Wiesler'],
  [/ulmann/i, 'Weingut Ulmann'],
  [/landmann/i, 'Weinhaus Landmann'],
  [/kerber/i, 'Winzerhof Kerber']
];
export function sectionFor(recipe: Recipe): MenuSection {
  if (!/getränk/i.test(recipe.category)) return 'food';
  if (/prickler|alkoholfrei/i.test(recipe.name)) return 'drinks';
  if (/sekt|secco|piccolo|prosecco|cr[ée]mant/i.test(recipe.name)) return 'sparkling';
  if (/gutedel|burgunder|riesling|weißherbst|rotwein|silvaner|müller|wein|rosé/i.test(recipe.name)) return 'wine';
  return 'drinks';
}
/** Eine Kartenzeile aus einem Rezept: Größe aus dem Namen, Erzeuger aus dem Lieferanten der Zutat. */
export function lineFromRecipe(recipe: Recipe, state: Workspace, id: string): MenuLine {
  const section = sectionFor(recipe);
  const size = recipe.name.match(/(\d+(?:,\d+)?)\s*l\b/i);
  const article = state.articles.find(a => a.value.id === recipe.ingredients[0]?.articleId)?.value;
  const supplierId = state.offers.find(o => o.value.articleId === article?.id && o.value.active)?.value.supplierId;
  const supplier = state.suppliers.find(s => s.value.id === supplierId)?.value.name || '';
  const producer =
    section === 'wine' || section === 'sparkling'
      ? PRODUCERS.find(([p]) => p.test(supplier || article?.name || ''))?.[1] || supplier
      : '';
  return {
    id,
    section,
    recipeId: recipe.id,
    number: '',
    label: recipe.name.replace(/\s*\d+(?:,\d+)?\s*l\b/i, '').trim() || recipe.name,
    detail: '',
    size: size ? size[1] + ' l' : '',
    producer,
    priceGross: recipe.salePriceGross
  };
}
/** Nummern für Wein und Sekt fortlaufend vergeben, vorhandene bleiben. */
export function numberLines(lines: MenuLine[]): MenuLine[] {
  const used = new Set(lines.map(l => l.number).filter(Boolean));
  let next = 1;
  return lines.map(l => {
    if (l.number || (l.section !== 'wine' && l.section !== 'sparkling')) return l;
    while (used.has(String(next))) next++;
    used.add(String(next));
    return { ...l, number: String(next) };
  });
}
export function sortLines(lines: MenuLine[]): MenuLine[] {
  const order = MENU_SECTIONS.map(s => s.id);
  return [...lines].sort((a, b) => order.indexOf(a.section) - order.indexOf(b.section));
}
export function emptyMenu(season: Season, actor: string, now = new Date().toISOString()): MenuCard {
  return {
    id: menuId(season.id),
    kind: 'menu',
    scope: season.id,
    at: now,
    by: actor,
    confirmed: false,
    name: 'Karte ' + season.name,
    title: menuTitle(season.year),
    footer: MENU_FOOTER,
    lines: []
  };
}
export function proposeFromRecipes(state: Workspace, uuid: () => string): MenuLine[] {
  return numberLines(sortLines(menuRecipes(state).map(r => lineFromRecipe(r, state, uuid()))));
}
export function card2025(uuid: () => string): MenuLine[] {
  return CARD_2025.map(([section, number, label, detail, size, producer, priceGross]) => ({
    id: uuid(),
    section,
    recipeId: null,
    number,
    label,
    detail,
    size,
    producer,
    priceGross
  }));
}

const price = (v: number | null): string => (v === null ? '' : v.toFixed(2).replace('.', ','));
const iconButton = (action: string, label: string, id: string, glyph: string, disabled = false): string =>
  `<button type="button" class="menu-icon" data-action="${action}" data-id="${h(id)}" aria-label="${h(label)}" title="${h(label)}"${disabled ? ' disabled' : ''}>${icon(glyph)}</button>`;
function lineRow(l: MenuLine, index: number, count: number, numbered: boolean, producer: boolean): string {
  const f = (name: string, label: string, value: string, extra = ''): string =>
    `<input class="menu-${name}" name="${name}_${h(l.id)}" value="${h(value)}" aria-label="${h(label + ': ' + (l.label || 'Eintrag'))}" ${extra} />`;
  return (
    `<div class="menu-line${numbered ? ' numbered' : ''}${producer ? ' producer' : ''}" data-menu-line="${h(l.id)}"><input type="hidden" name="section_${h(l.id)}" value="${h(l.section)}" /><input type="hidden" name="recipe_${h(l.id)}" value="${h(l.recipeId || '')}" />` +
    `<span class="menu-grip" data-menu-drag="${h(l.id)}" title="Ziehen zum Verschieben" aria-hidden="true">${icon('grip')}</span>` +
    (numbered ? f('number', 'Nr.', l.number, 'maxlength="10" inputmode="numeric"') : '') +
    f('label', 'Bezeichnung', l.label, 'maxlength="160" required') +
    f('detail', 'Zusatz', l.detail, 'maxlength="160" placeholder="optional"') +
    f('size', 'Größe', l.size, 'maxlength="40"') +
    (producer ? f('producer', 'Weingut', l.producer, 'maxlength="80"') : '') +
    f('price', 'Preis in Euro', price(l.priceGross), 'inputmode="decimal" placeholder="offen"') +
    `<div class="menu-line-actions">${iconButton('menu-up', 'Nach oben', l.id, 'up', index === 0)}${iconButton('menu-down', 'Nach unten', l.id, 'arrowdown', index === count - 1)}${iconButton('menu-remove', 'Entfernen', l.id, 'minus')}</div></div>`
  );
}
function columns(numbered: boolean, producer: boolean): string {
  return `<div class="menu-cols${numbered ? ' numbered' : ''}${producer ? ' producer' : ''}" aria-hidden="true"><span></span>${numbered ? '<span>Nr.</span>' : ''}<span>Bezeichnung</span><span>Zusatz (klein darunter)</span><span>Größe</span>${producer ? '<span>Weingut</span>' : ''}<span>Preis €</span><span></span></div>`;
}
/** Bearbeitungsseite der Karte. */
export function menuEditor(card: MenuCard, state: Workspace, saved: boolean): string {
  const recipes = menuRecipes(state);
  const onCard = new Set(card.lines.map(l => l.recipeId).filter(Boolean));
  const sections = MENU_SECTIONS.map(s => {
    const lines = card.lines.filter(l => l.section === s.id);
    const choices = recipes
      .filter(r => (s.id === 'food' ? sectionFor(r) === 'food' : sectionFor(r) !== 'food'))
      .sort(
        (a, b) => Number(sectionFor(b) === s.id) - Number(sectionFor(a) === s.id) || a.name.localeCompare(b.name, 'de')
      )
      .map(
        r =>
          [
            r.id,
            r.name +
              (r.salePriceGross !== null ? ' · ' + price(r.salePriceGross) + ' €' : ' · Preis offen') +
              (onCard.has(r.id) ? ' · schon auf der Karte' : '')
          ] as [string, string]
      );
    return `<section class="menu-section" aria-labelledby="menu-${s.id}"><h2 id="menu-${s.id}">${h(s.title)}${s.subtitle ? ` <small>${h(s.subtitle)}</small>` : ''}</h2>${lines.length ? columns(s.numbered, s.producer) + lines.map((l, i) => lineRow(l, i, lines.length, s.numbered, s.producer)).join('') : '<p class="hint">Noch nichts in dieser Rubrik.</p>'}<div class="menu-add">${select('add_' + s.id, 'Hinzufügen aus Speisen & Getränken', [['', 'Bitte wählen'], ...choices, ['free', 'Eigener Eintrag ohne Rezept']], '')}${button('menu-add', 'Hinzufügen', s.id)}</div></section>`;
  });
  const start = `<details class="menu-start" ${card.lines.length ? '' : 'open'}><summary>${card.lines.length ? 'Neu beginnen' : 'Karte beginnen'}</summary><p>${card.lines.length ? 'Ersetzt die aktuelle Liste. Erst mit Speichern endgültig.' : 'Startpunkt wählen, danach alles anpassbar.'}</p><div class="actions">${button('menu-preset', 'Wie Karte 2025 (Vorlage)', '', !card.lines.length)}${button('menu-propose', 'Aus Speisen & Getränken vorschlagen')}</div></details>`;
  const count = card.lines.length;
  const open = card.lines.filter(l => l.priceGross === null).length;
  return (
    `<div class="page-heading"><div><h1>Karte</h1><p>${h(card.name)} · ${count} ${count === 1 ? 'Eintrag' : 'Einträge'}${open ? ' · ' + open + ' ohne Preis' : ''}${saved ? '' : ' · noch nicht gespeichert'}</p></div><div class="actions">${button('menu-pdf', 'Als PDF')}${button('menu-docx', 'Als Word')}${button('menu-close', 'Zurück')}</div></div>` +
    `<form data-form="menu" class="menu-editor">${start}<div class="menu-head">${'<label>Untertitel im Kopf<input name="title" value="' + h(card.title) + '" maxlength="160" /></label>'}<label>Hinweis unten auf der Karte<textarea name="footer" rows="3" maxlength="600">${h(card.footer)}</textarea></label></div>${sections.join('')}<div class="actions sticky-actions"><button type="submit" class="primary">Karte speichern</button></div></form>`
  );
}
/** Liest die Eingaben in eine neue Fassung der Karte. */
export function readMenu(form: HTMLFormElement | FormData, card: MenuCard): MenuCard {
  const data = form instanceof FormData ? form : new FormData(form);
  const get = (name: string, fallback = ''): string => {
    const v = data.get(name);
    return v === null ? fallback : String(v).trim();
  };
  const lines = card.lines.map(l => {
    const raw = get('price_' + l.id, l.priceGross === null ? '' : String(l.priceGross).replace('.', ','));
    const priceGross = raw ? parseDecimal(raw) : null;
    if (raw && priceGross === null) throw new Error('Preis bei „' + get('label_' + l.id, l.label) + '“ bitte prüfen.');
    return {
      ...l,
      number: get('number_' + l.id, l.number),
      label: get('label_' + l.id, l.label),
      detail: get('detail_' + l.id, l.detail),
      size: get('size_' + l.id, l.size),
      producer: get('producer_' + l.id, l.producer),
      priceGross: priceGross === null ? null : Math.round(priceGross * 100) / 100
    };
  });
  return { ...card, title: get('title', card.title), footer: get('footer', card.footer), lines };
}
/** Reihenfolge innerhalb einer Rubrik ändern. */
export function moveLine(lines: MenuLine[], id: string, step: -1 | 1): MenuLine[] {
  const line = lines.find(l => l.id === id);
  if (!line) return lines;
  const same = lines.filter(l => l.section === line.section);
  const at = same.indexOf(line),
    target = same[at + step];
  if (!target) return lines;
  const result = [...lines];
  const i = result.indexOf(line),
    j = result.indexOf(target);
  [result[i], result[j]] = [result[j], result[i]];
  return result;
}
/** Neue Reihenfolge einer Rubrik nach Ziehen und Ablegen. Andere Rubriken bleiben unverändert, unbekannte Einträge rutschen ans Ende. */
export function reorderSection(lines: MenuLine[], section: MenuSection, ids: string[]): MenuLine[] {
  const order = new Map(ids.map((id, i) => [id, i]));
  const rank = (l: MenuLine): number => order.get(l.id) ?? ids.length;
  const same = lines.filter(l => l.section === section).sort((a, b) => rank(a) - rank(b));
  let k = 0;
  return lines.map(l => (l.section === section ? same[k++] : l));
}
export const formatPrice = price;
