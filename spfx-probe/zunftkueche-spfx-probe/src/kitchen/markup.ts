/* eslint-disable @rushstack/no-new-null -- Persisted unknown quantities and prices are explicitly nullable. */
export function h(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
}
export function n(value: number | null | undefined): string {
  return value === null || value === undefined
    ? ''
    : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4, useGrouping: false }).format(value);
}
export function money(value: number | null): string {
  return value === null
    ? 'Preis offen'
    : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 }).format(value);
}
export function field(
  name: string,
  label: string,
  value: unknown = '',
  required = false,
  type = 'text',
  extra = ''
): string {
  return `<label>${h(label)}<input name="${h(name)}" type="${type}" value="${h(value)}" ${/\blist=/.test(extra) ? '' : 'autocomplete="off"'} ${required ? 'required' : ''} ${extra} /></label>`;
}
export function note(name: string, label: string, value: string): string {
  return `<label>${h(label)}<textarea name="${h(name)}" rows="3" maxlength="1000">${h(value)}</textarea></label>`;
}
export function select(
  name: string,
  label: string,
  options: Array<[string, string]>,
  value: string,
  extra = ''
): string {
  return `<label>${h(label)}<select name="${h(name)}" ${extra}>${options.map(([id, title]) => `<option value="${h(id)}" ${id === value ? 'selected' : ''}>${h(title)}</option>`).join('')}</select></label>`;
}
export function segmented(
  name: string,
  label: string,
  options: Array<[string, string, string?]>,
  value: string
): string {
  return `<fieldset class="segmented"><legend class="sr-only">${h(label)}</legend>${options.map(([id, title, spoken]) => `<label><input type="radio" name="${h(name)}" value="${h(id)}" ${spoken ? 'aria-label="' + h(spoken) + '"' : ''} ${id === value ? 'checked' : ''} /><span>${h(title)}</span></label>`).join('')}</fieldset>`;
}
export function check(name: string, label: string, checked: boolean): string {
  return `<label class="check"><input type="checkbox" name="${h(name)}" ${checked ? 'checked' : ''} />${h(label)}</label>`;
}
export function button(action: string, label: string, id = '', primary = false): string {
  return `<button type="button" data-action="${action}" data-id="${h(id)}" class="${primary ? 'primary' : ''}">${h(label)}</button>`;
}
export function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${h(title)}</h2>${body}</section>`;
}
export function empty(text: string): string {
  return `<p class="empty">${h(text)}</p>`;
}

/** Abschnitte innerhalb eines Tabs, zum Beispiel Lieferanten | Artikel. */
export function segments(action: string, items: Array<[string, string]>, active: string, label: string): string {
  return `<nav class="seg-tabs" aria-label="${h(label)}">${items.map(([id, title]) => `<button type="button" data-action="${action}" data-id="${h(id)}" aria-current="${id === active ? 'page' : 'false'}">${h(title)}</button>`).join('')}</nav>`;
}
export const ordersTabs = (active: 'list' | 'days' | 'bills'): string =>
  segments(
    'orders-tab',
    [
      ['list', 'Nach Lieferant'],
      ['days', 'Nach Liefertag'],
      ['bills', 'Rechnungen']
    ],
    active,
    'Ansicht der Bestellungen'
  );
export const suppliersTabs = (active: 'suppliers' | 'articles'): string =>
  segments(
    'nav',
    [
      ['suppliers', 'Lieferanten'],
      ['articles', 'Artikel']
    ],
    active,
    'Lieferanten und Artikel'
  );
export const reportsTabs = (active: 'reports' | 'stock'): string =>
  segments(
    'nav',
    [
      ['reports', 'Zahlen'],
      ['stock', 'Bestand']
    ],
    active,
    'Auswertung und Bestand'
  );
export const planningTabs = (active: 'recipes' | 'plans'): string =>
  segments(
    'ww-open',
    [
      ['recipes', 'Rezepte'],
      ['plans', 'Portionen']
    ],
    active,
    'Rezepte und Portionen'
  );
/** Seltene Aktionen hinter einem Knopf „Mehr“, damit je Seite ein Hauptknopf bleibt. */
export function moreMenu(buttons: string[]): string {
  const items = buttons.filter(Boolean);
  return items.length
    ? `<details class="more-menu"><summary>Mehr</summary><div class="more-menu-list">${items.join('')}</div></details>`
    : '';
}
/** Zurück steht immer oben links und nennt das Ziel. */
export function backLink(action: string, target: string, id = ''): string {
  return `<button type="button" class="back-link" data-action="${action}" data-id="${h(id)}"><span aria-hidden="true">‹</span> ${h(target)}</button>`;
}
