import type { Article, Count, Master, MasterKind, Offer, Season, Supplier, Workspace } from './model';
import { METHODS } from './model.ts';
import { documents } from './ww/model.ts';
import { h, n, field, select, check, note, button } from './markup.ts';
import { unitName } from './units.ts';
export interface Editing {
  kind: MasterKind;
  id: string;
  value: Master;
  /** Vorbelegter Lieferant, wenn ein Artikel aus einem Lieferantenprofil heraus angelegt wird. */
  supplierId?: string;
}
const methods: Array<[string, string]> = METHODS.map(m => [m, m]);
/** Eine Zeile der Einsatztage: Datum per Kalender wählen, Zeile wieder entfernen. */
export function dayRow(day = ''): string {
  return (
    '<div class="day-row"><input type="date" name="operatingDays" value="' +
    h(day) +
    '" aria-label="Einsatztag"><button type="button" class="link-button" data-action="day-remove">Entfernen</button></div>'
  );
}
function dayList(days: string[]): string {
  return (
    '<fieldset class="day-list"><legend>Einsatztage</legend>' +
    '<p>Die Tage, an denen Küche oder Scheuer geöffnet sind. Bestellungen, Portionen und Lieferplan bieten genau diese Tage an.</p>' +
    '<div class="day-rows">' +
    [...days, ''].map(dayRow).join('') +
    '</div>' +
    button('day-add', 'Tag hinzufügen') +
    '</fieldset>'
  );
}
export function masterForm(edit: Editing, state: Workspace): string {
  const v = edit.value;
  let body = '';
  let title = '';
  if (edit.kind === 'seasons') {
    const s = v as Season;
    title = 'Saison';
    body =
      field('name', 'Saisonname', s.name, true) +
      field('year', 'Jahr', s.year, true, 'number', 'min="2000" max="2200"') +
      dayList(s.operatingDays || []) +
      field('contact', 'Ansprechpartner für diese Saison', s.contact || '') +
      '<details class="form-more"><summary>Weitere Angaben: Lieferorte, Lagerorte, Einheiten</summary>' +
      note('deliveryPlaces', 'Lieferorte (ein Ort je Zeile)', (s.deliveryPlaces || []).join('\n')) +
      note('storagePlaces', 'Lagerorte (ein Ort je Zeile)', (s.storagePlaces || []).join('\n')) +
      note('units', 'Übliche Einheiten (eine je Zeile)', (s.units || []).join('\n')) +
      check('archived', 'Saison archivieren (weiterhin einsehbar)', s.archived) +
      '</details>';
  }
  if (edit.kind === 'suppliers') {
    const s = v as Supplier;
    title = 'Lieferantenprofil';
    body =
      field('name', 'Name', s.name, true) +
      field('contactPerson', 'Ansprechpartner', s.contactPerson || '') +
      field('address', 'Adresse', s.address || '') +
      field('phone', 'Telefon', s.phone, false, 'tel') +
      field('email', 'E-Mail', s.email, false, 'email') +
      select('method', 'Bevorzugter Bestellweg', methods, s.method) +
      field('customerNumber', 'Kundennummer', s.customerNumber) +
      note('note', 'Notizen und Absprachen', s.note) +
      check('active', 'Aktiver Lieferant', s.active);
  }
  if (edit.kind === 'articles') {
    const a = v as Article;
    const used =
      state.offers.some(o => o.value.articleId === a.id) || state.counts.some(c => c.value.articleId === a.id);
    const fresh = !edit.id;
    title = fresh ? 'Artikel anlegen' : 'Artikel';
    const more =
      field('storagePlace', 'Hauptlagerort (optional)', a.storagePlace || '', false, 'text', 'list="kitchen-storage"') +
      check('active', 'Aktiver Artikel', a.active) +
      '<fieldset><legend>Für diese Saisons nicht vorgesehen</legend><p>Alte Bestellungen bleiben lesbar und bearbeitbar.</p>' +
      state.seasons
        .map(x => check('unavailable_' + x.value.id, x.value.name, (a.unavailableSeasons || []).includes(x.value.id)))
        .join('') +
      '</fieldset>';
    body =
      field('name', 'Artikelname', a.name, true) +
      field(
        'unit',
        'Einheit zum Zählen, z. B. Flasche, kg oder Stück',
        a.unit,
        true,
        'text',
        used ? 'readonly list="kitchen-units"' : 'list="kitchen-units"'
      ) +
      field('category', 'Kategorie (optional)', a.category, false, 'text', 'list="kitchen-categories"') +
      '<datalist id="kitchen-categories">' +
      [...new Set(state.articles.map(x => x.value.category).filter(Boolean))]
        .sort((x, y) => x.localeCompare(y, 'de'))
        .map(x => '<option value="' + h(x) + '"></option>')
        .join('') +
      '</datalist>' +
      (fresh
        ? '<fieldset class="form-block"><legend>Lieferant und Preis</legend><p>Gleich mit anlegen, dann ist der Artikel sofort bestellbar. Geht auch später.</p>' +
          select(
            'supplierId',
            'Lieferant',
            [
              ['', 'Noch kein Lieferant'],
              ...state.suppliers.filter(x => x.value.active).map(x => [x.value.id, x.value.name] as [string, string])
            ],
            edit.supplierId || ''
          ) +
          field('packName', 'Gebinde, z. B. Kiste, Sack oder Stück', '') +
          field('packSize', 'Anzahl je Gebinde', '1', false, 'text', 'inputmode="decimal"') +
          field('priceNet', 'Preis netto je Gebinde (optional)', '', false, 'text', 'inputmode="decimal"') +
          field('code', 'Artikelnummer beim Lieferanten (optional)', '') +
          '</fieldset><details class="form-more"><summary>Weitere Angaben</summary>' +
          more +
          '</details>'
        : more) +
      (used
        ? '<p class="muted">Die verwendete Einheit bleibt erhalten. Für eine andere Einheit bitte einen neuen Artikel anlegen.</p>'
        : '');
  }
  if (edit.kind === 'offers') {
    const o = v as Offer;
    const article = state.articles.find(a => a.value.id === o.articleId)?.value;
    const listed = documents(state.ww, 'prices').some(p => p.confirmed && p.lines.some(l => l.offerId === o.id));
    title = (article?.name || 'Artikel') + ' · Gebinde und Preis';
    body =
      select(
        'supplierId',
        'Lieferant',
        [
          ['', 'Bitte wählen'],
          ...state.suppliers
            .filter(s => s.value.active || s.value.id === o.supplierId)
            .map(s => [s.value.id, s.value.name] as [string, string])
        ],
        o.supplierId,
        'required'
      ) +
      field('code', 'Artikelnummer beim Lieferanten (optional)', o.code) +
      field('packName', 'Gebinde, z. B. Kiste oder Sack', o.packName, true) +
      field(
        'packSize',
        `Anzahl ${unitName(article?.unit || '') || 'Einheiten'} je Gebinde`,
        n(o.packSize),
        true,
        'text',
        'inputmode="decimal"'
      ) +
      field(
        'priceNet',
        'Preis netto je Gebinde',
        n(o.priceNet),
        false,
        'text',
        'inputmode="decimal" ' + (listed ? 'readonly' : '')
      ) +
      field('deposit', 'Pfand je Gebinde (optional)', n(o.deposit), false, 'text', 'inputmode="decimal"') +
      note('note', 'Hinweise', o.note) +
      check('active', 'Wird bei diesem Lieferanten bestellt', o.active) +
      (listed
        ? '<p>Der Preis steht in der Preisliste des Lieferanten und wird dort geändert.</p>' +
          button('supplier-prices', 'Preise ändern', o.supplierId)
        : '');
  }
  if (edit.kind === 'counts') {
    const c = v as Count;
    title = 'Abendbestand erfassen';
    body =
      select(
        'articleId',
        'Artikel',
        [
          ['', 'Bitte wählen'],
          ...state.articles
            .filter(a => a.value.active)
            .map(a => [a.value.id, a.value.name + ' · ' + unitName(a.value.unit, 1)] as [string, string])
        ],
        c.articleId,
        'required'
      ) +
      field('quantity', 'Gezählte Menge in der angezeigten Zähleinheit', '', true, 'text', 'inputmode="decimal"') +
      select(
        'assessment',
        'Einschätzung',
        [
          ['ok', 'Passt'],
          ['reorder', 'Nachbestellen'],
          ['surplus', 'Überhang']
        ],
        'ok'
      ) +
      note('note', 'Kurzer Hinweis', c.note);
  }
  const configured = state.seasons.flatMap(s => s.value.storagePlaces || []),
    units = state.seasons.flatMap(s => s.value.units || []);
  return `<datalist id="kitchen-storage">${[...new Set(configured)].map(x => '<option value="' + h(x) + '"></option>').join('')}</datalist><datalist id="kitchen-units">${[...new Set(units)].map(x => '<option value="' + h(x) + '"></option>').join('')}</datalist><form data-form="master" class="panel"><h1 class="form-title">${h(title)}</h1><div class="formgrid">${body}</div><div class="actions"><button type="submit" class="primary">${edit.kind === 'counts' ? 'Bestand speichern' : 'Speichern'}</button>${button('cancel', 'Abbrechen')}</div></form>`;
}
export { supplierOrderForm as orderForm, supplierCopyForm as copyForm } from './supplier-forms.ts';
