// Stammdaten: Saison, Lieferanten, Artikel, Liefergebinde, Einzelzählung.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { icon } from '../icons.ts';
import { supplierHint } from '../review-status.ts';
import { documents } from '../ww/model.ts';
import { effectiveOffer } from '../ww/domain.ts';
import { h, n, euro, button, emptyAction, moreMenu, suppliersTabs, segmented } from '../markup.ts';
import type { Article, Supplier } from '../model';
import { unitName, packLabel } from '../units.ts';
import { searchField, displayDate } from '../workspace.ts';
import type { KitchenView } from '../view';
import { uuid } from '../view-support.ts';
import { readOrder } from './order-actions.ts';

/** Kategorien der Artikel in fester Reihenfolge: nach Namen, „Ohne Kategorie“ zuletzt. */
export function articleCategories(names: string[]): string[] {
  return [...new Set(names.map(name => name.trim()))].sort(
    (a, b) => Number(!a) - Number(!b) || a.localeCompare(b, 'de')
  );
}
export function articles(app: KitchenView): string {
  const state = app.state!;
  const priceLists = documents(state.ww, 'prices');
  const date =
    documents(state.ww, 'slot')
      .map(slot => slot.date)
      .sort()[0] || new Date().toISOString().slice(0, 10);
  const supplierName = (id: string): string =>
    state.suppliers.find(row => row.value.id === id)?.value.name || 'Lieferant fehlt';
  const row = (article: Article): string => {
    const offers = state.offers.filter(o => o.value.articleId === article.id);
    const current = offers.filter(o => o.value.active);
    const suppliers = [...new Set(current.map(o => supplierName(o.value.supplierId)))];
    const keywords = [
      article.name,
      article.category,
      article.unit,
      ...offers.map(o => supplierName(o.value.supplierId))
    ].join(' ');
    const offerRows = offers
      .map(({ value: offer }) => {
        const supplier = supplierName(offer.supplierId);
        const price = effectiveOffer(offer, priceLists, date);
        const amount = price.priceNet === null ? 'Preis offen' : euro(price.priceNet) + ' netto';
        return `<tr><td><strong>${h(supplier)}</strong>${offer.active ? '' : '<small>Inaktiv</small>'}</td>
   <td>${h(packLabel(offer.packName, offer.packSize, article.unit, n(offer.packSize)))}</td>
   <td>${h(amount)}${price.priceDate ? '<small>Stand ' + h(displayDate(price.priceDate)) + '</small>' : ''}</td>
   <td><button type="button" data-action="offer-edit" data-id="${h(offer.id)}" aria-label="Gebinde und Preis bei ${h(supplier)} bearbeiten">Bearbeiten</button></td></tr>`;
      })
      .join('');
    const comparison = offerRows
      ? `<table class="article-offers" aria-label="Lieferanten für ${h(article.name)}"><thead><tr><th scope="col">Lieferant</th>
   <th scope="col">Gebinde</th><th scope="col">Preis je Gebinde</th><th scope="col"><span class="sr-only">Aktion</span></th></tr></thead>
   <tbody>${offerRows}</tbody></table>`
      : '<p class="muted">Noch bei keinem Lieferanten hinterlegt.</p>';
    return `<details class="article-list-row" data-search="${h(keywords)}" data-category="${h(article.category.trim())}"><summary><span class="article-name">${icon('chevron')}
  <span><strong>${h(article.name)}</strong>${article.active ? '' : ' <small>Inaktiv</small>'}</span></span>
  <span>${h(unitName(article.unit, 1))}</span>
  <span>${suppliers.length ? h(suppliers.join(', ')) : 'Kein Lieferant'}<span class="sr-only"> ansehen</span></span></summary>
  <div class="article-detail">${comparison}<div class="actions">${button('article-edit', 'Artikel bearbeiten', article.id)}
  ${article.active ? button('offer-new', 'Weiteren Lieferanten hinzufügen', article.id) : ''}</div></div></details>`;
  };
  const all = state.articles.map(a => a.value);
  const categories = articleCategories(all.map(a => a.category));
  const groups = categories
    .map(category => {
      const members = all
        .filter(a => a.category.trim() === category)
        .sort((a, b) => Number(!a.active) - Number(!b.active) || a.name.localeCompare(b.name, 'de'));
      return `<section class="article-group" data-count-group data-category="${h(category)}"><h2>${h(category || 'Ohne Kategorie')} <small data-group-count>${members.length}</small></h2><div class="article-list">${members.map(row).join('')}</div></section>`;
    })
    .join('');
  const filter =
    categories.length > 1
      ? segmented(
          'articleCategory',
          'Kategorie',
          [['', 'Alle'], ...categories.map(c => [c || '-', c || 'Ohne Kategorie'] as [string, string])],
          app.articleCategory
        )
      : '';
  return `<div class="page-heading"><div><h1>Artikel</h1><p>Alles, was ihr bestellt und zählt. Gilt für alle Bereiche.</p></div><div class="actions">${moreMenu([button('import', 'Artikel aus CSV einlesen …', 'articles')])}${button('article-new', 'Artikel anlegen', '', true)}</div></div>${suppliersTabs('articles')}<div class="toolbar article-toolbar">${searchField(app.query, 'Artikel oder Lieferanten suchen')}${filter}</div><div class="article-groups" aria-label="Artikel nach Kategorien">${groups || emptyAction('Noch keine Artikel angelegt.', 'article-new', 'Ersten Artikel anlegen')}</div><p data-filter-empty hidden>Keine passenden Artikel.</p>`;
}

/** Preisliste eines Lieferanten: ein Preis je Artikel und Gebinde, mit dem Tag, seit dem er gilt. */
function priceList(app: KitchenView, supplierId: string): string {
  const s = app.state!;
  const lists = documents(s.ww, 'prices');
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const name = (articleId: string): string => s.articles.find(a => a.value.id === articleId)?.value.name || 'Artikel';
  const category = (articleId: string): string =>
    (s.articles.find(a => a.value.id === articleId)?.value.category || '').trim();
  const own = s.offers.filter(o => o.value.supplierId === supplierId && o.value.active);
  /* Zwischenüberschriften nur, wenn der Lieferant Artikel aus mehreren Kategorien hat. */
  const mixed = new Set(own.map(o => category(o.value.articleId))).size > 1;
  const rows = own
    .sort(
      (a, b) =>
        category(a.value.articleId).localeCompare(category(b.value.articleId), 'de') ||
        name(a.value.articleId).localeCompare(name(b.value.articleId), 'de')
    )
    .map(({ value: offer }, index, sorted) => {
      const article = s.articles.find(a => a.value.id === offer.articleId)?.value;
      const group = category(offer.articleId);
      const head =
        mixed && (index === 0 || category(sorted[index - 1].value.articleId) !== group)
          ? `<tr class="price-group"><th scope="colgroup" colspan="5">${h(group || 'Ohne Kategorie')}</th></tr>`
          : '';
      let current = offer;
      try {
        current = effectiveOffer(offer, lists, day);
      } catch {
        /* Gebinde seit der letzten Preisliste geändert: Preis am Artikel zeigen */
      }
      return `${head}<tr><th scope="row">${h(article?.name || 'Artikel')}</th><td>${h(packLabel(offer.packName, offer.packSize, article?.unit || '', n(offer.packSize)))}</td><td class="num">${current.priceNet === null ? '<span class="muted">offen</span>' : h(euro(current.priceNet))}</td><td>${current.priceNet !== null && current.priceDate ? h(displayDate(current.priceDate)) : ''}</td><td><button type="button" class="link-button" data-action="offer-edit" data-id="${h(offer.id)}" aria-label="${h(article?.name || 'Artikel')} bearbeiten">Bearbeiten</button></td></tr>`;
    })
    .join('');
  return rows
    ? `<div class="table-scroll"><table class="price-table"><thead><tr><th scope="col">Artikel</th><th scope="col">Gebinde</th><th scope="col" class="num">Preis netto</th><th scope="col">Stand</th><th scope="col"><span class="sr-only">Aktion</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p>Noch keine Artikel bei diesem Lieferanten.</p>';
}

export function suppliers(app: KitchenView): string {
  const s = app.state!;
  const count = (id: string): number => s.offers.filter(o => o.value.supplierId === id && o.value.active).length;
  const profile = (v: Supplier): string => {
    const articles = count(v.id);
    const merged = v.mergedInto ? s.suppliers.find(r => r.value.id === v.mergedInto)?.value.name : '';
    const facts = [
      v.active ? v.method : merged ? 'Zusammengelegt mit ' + merged : 'Inaktiv',
      v.active ? supplierHint(v) : '',
      articles + ' Artikel'
    ].filter(Boolean);
    return `<details class="supplier-profile" data-search="${h([v.name, v.contactPerson || '', v.address || '', v.phone, v.email].join(' '))}"><summary><span><strong>${h(v.name)}</strong><small>${h(facts.join(' · '))}</small></span><span>Profil öffnen</span></summary><div class="profile-content"><dl><div><dt>Ansprechpartner</dt><dd>${h(v.contactPerson || 'Nicht hinterlegt')}</dd></div><div><dt>Adresse</dt><dd>${h(v.address || 'Nicht hinterlegt')}</dd></div><div><dt>Telefon</dt><dd>${h(v.phone || 'Nicht hinterlegt')}</dd></div><div><dt>E-Mail</dt><dd>${h(v.email || 'Nicht hinterlegt')}</dd></div><div><dt>Bestellweg</dt><dd>${h(v.method)}</dd></div><div><dt>Kundennummer</dt><dd>${h(v.customerNumber || 'Nicht hinterlegt')}</dd></div></dl><h2>Notizen und Absprachen</h2><p>${h(v.note || 'Keine Notizen hinterlegt.')}</p><div class="actions">${button('supplier-edit', 'Profil bearbeiten', v.id, 'tinted')}${v.active && s.suppliers.filter(r => r.value.active).length > 1 ? moreMenu([button('supplier-merge', 'Mit anderem Lieferanten zusammenlegen …', v.id)]) : ''}</div><h2>Artikel und Preise</h2>${priceList(app, v.id)}${v.active ? `<div class="actions">${button('supplier-prices', 'Preise ändern', v.id)}${button('article-new', 'Artikel hinzufügen', 'supplier:' + v.id)}${button('supplier-rules', 'Bestellschluss und Liefertage', v.id)}</div>` : ''}<h2>Bestellungen dieser Saison</h2>${
      s.orders
        .filter(o => o.value.supplierId === v.id && o.value.seasonId === app.seasonId && o.value.area === app.area)
        .map(
          o =>
            '<div class="review-row"><span>' +
            h(o.value.occasion) +
            ' · ' +
            h(o.value.status) +
            '</span>' +
            button('order-open', 'Bestellung öffnen', o.value.id) +
            '</div>'
        )
        .join('') || '<p>Noch keine Bestellung.</p>'
    }</div></details>`;
  };
  const sorted = s.suppliers.map(r => r.value).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const active = sorted.filter(v => v.active),
    inactive = sorted.filter(v => !v.active);
  return `<div class="page-heading"><div><h1>Lieferanten</h1><p>Kontakte, Artikel und Preise an einem Ort.</p></div><div class="actions">${moreMenu([button('ww-price-import', 'Preisliste aus Excel einlesen …'), button('ww-open', 'Frühere Preise', 'prices'), button('import', 'Lieferanten aus CSV einlesen …', 'suppliers')])}${button('supplier-new', 'Lieferant anlegen', '', true)}</div></div>${suppliersTabs('suppliers')}<div class="toolbar">${searchField(app.query, 'Lieferanten suchen')}</div><section class="supplier-list">${
    active.map(profile).join('') ||
    (inactive.length
      ? ''
      : emptyAction('Noch keine Lieferanten angelegt.', 'supplier-new', 'Ersten Lieferanten anlegen'))
  }</section>${inactive.length ? `<details class="inactive-suppliers" data-section-key="inactive-suppliers"><summary>Inaktive Lieferanten <small>${inactive.length}</small></summary><section class="supplier-list">${inactive.map(profile).join('')}</section></details>` : ''}<p data-filter-empty hidden>Keine passenden Lieferanten.</p>`;
}

/** Saison, Lieferanten, Artikel, Liefergebinde und Einzelzählung. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function masterAction(
  app: KitchenView,
  action: string,
  id: string,
  target?: HTMLElement
): Promise<boolean> {
  if (!app.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if (action === 'season-new' || action === 'season-edit') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    const old = app.state.seasons.find(s => s.value.id === id)?.value;
    const year = new Date().getFullYear() + 1;
    app.editing = {
      kind: 'seasons',
      id: old?.id || '',
      value: old ? structuredClone(old) : { id: uuid(), name: 'Fasnet ' + year, year, archived: false }
    };
    app.render();
    return true;
  }
  if (action === 'supplier-new' || action === 'supplier-edit') {
    if (app.draft) {
      app.draft = readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!);
    } else app.clearEditor();
    const old = app.state.suppliers.find(s => s.value.id === id)?.value;
    app.editing = {
      kind: 'suppliers',
      id: old?.id || '',
      value: old
        ? structuredClone(old)
        : {
            id: uuid(),
            name: '',
            phone: '',
            email: '',
            method: 'Telefon',
            customerNumber: '',
            note: '',
            active: true
          }
    };
    app.render();
    return true;
  }
  if (action === 'article-new' || action === 'article-edit') {
    app.clearEditor();
    const old = app.state.articles.find(a => a.value.id === id)?.value;
    app.editing = {
      kind: 'articles',
      id: old?.id || '',
      value: old ? structuredClone(old) : { id: uuid(), name: '', unit: '', category: '', active: true },
      supplierId: id.startsWith('supplier:') ? id.slice(9) : undefined
    };
    app.render();
    return true;
  }
  if (action === 'offer-new' || action === 'offer-edit') {
    app.clearEditor();
    const old = app.state.offers.find(o => o.value.id === id)?.value;
    app.editing = {
      kind: 'offers',
      id: old?.id || '',
      value: old
        ? structuredClone(old)
        : {
            id: uuid(),
            articleId: id,
            supplierId: '',
            code: '',
            packName: '',
            packSize: 1,
            priceNet: null,
            priceDate: null,
            deposit: null,
            note: '',
            active: true
          }
    };
    app.render();
    return true;
  }
  if (action === 'count-new') {
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    app.clearEditor();
    app.editing = {
      kind: 'counts',
      id: '',
      value: {
        id: uuid(),
        seasonId: app.seasonId,
        area: app.area,
        articleId: '',
        articleName: '',
        unit: '',
        quantity: 0,
        countedAt: '',
        countedBy: app.user,
        note: '',
        reorder: false
      }
    };
    app.render();
    return true;
  }
  return false;
}
