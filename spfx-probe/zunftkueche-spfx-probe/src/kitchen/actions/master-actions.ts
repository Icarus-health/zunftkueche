// Stammdaten: Saison, Lieferanten, Artikel, Liefergebinde, Einzelzählung.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { icon } from '../icons.ts';
import { supplierHint } from '../review-status.ts';
import { documents } from '../ww/model.ts';
import { effectiveOffer } from '../ww/domain.ts';
import { h, n, euro, button, emptyAction, moreMenu, suppliersTabs } from '../markup.ts';
import { unitName, packLabel } from '../units.ts';
import { searchField, displayDate } from '../workspace.ts';
import type { KitchenView } from '../view';
import { uuid } from '../view-support.ts';
import { readOrder } from './order-actions.ts';

export function articles(app: KitchenView): string {
  const state = app.state!;
  const priceLists = documents(state.ww, 'prices');
  const date =
    documents(state.ww, 'slot')
      .map(slot => slot.date)
      .sort()[0] || new Date().toISOString().slice(0, 10);
  const rows = state.articles
    .map(({ value: article }) => {
      const offers = state.offers.filter(row => row.value.articleId === article.id);
      const supplierName = (id: string): string =>
        state.suppliers.find(row => row.value.id === id)?.value.name || 'Lieferant fehlt';
      const keywords = [
        article.name,
        article.category,
        article.unit,
        ...offers.map(({ value: offer }) => supplierName(offer.supplierId))
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
      return `<details class="article-list-row" data-search="${h(keywords)}"><summary><span class="article-name">${icon('chevron')}
  <span><strong>${h(article.name)}</strong>${article.active ? '' : ' <small>Inaktiv</small>'}</span></span>
  <span>${h(article.category || 'Ohne Kategorie')}</span><span>${h(unitName(article.unit, 1))}</span>
  <span>${offers.length ? offers.length + ' ' + (offers.length === 1 ? 'Lieferant' : 'Lieferanten') : 'Kein Lieferant'}<span class="sr-only"> ansehen</span></span></summary>
  <div class="article-detail">${comparison}<div class="actions">${button('article-edit', 'Artikel bearbeiten', article.id)}
  ${article.active ? button('offer-new', 'Weiteren Lieferanten hinzufügen', article.id) : ''}</div></div></details>`;
    })
    .join('');
  return `<div class="page-heading"><div><h1>Artikel</h1><p>Alles, was ihr bestellt und zählt. Gilt für alle Bereiche.</p></div><div class="actions">${moreMenu([button('import', 'Artikel aus CSV einlesen', 'articles')])}${button('article-new', 'Artikel anlegen', '', true)}</div></div>${suppliersTabs('articles')}<div class="toolbar">${searchField(app.query, 'Artikel oder Lieferanten suchen')}</div><section class="article-list" aria-label="Artikelliste"><div class="article-list-head"><span>Artikel</span><span>Kategorie</span><span>Einheit</span><span>Lieferanten</span></div>${rows || emptyAction('Noch keine Artikel angelegt.', 'article-new', 'Ersten Artikel anlegen')}</section><p data-filter-empty hidden>Keine passenden Artikel.</p>`;
}

/** Preisliste eines Lieferanten: ein Preis je Artikel und Gebinde, mit dem Tag, seit dem er gilt. */
function priceList(app: KitchenView, supplierId: string): string {
  const s = app.state!;
  const lists = documents(s.ww, 'prices');
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const name = (articleId: string): string => s.articles.find(a => a.value.id === articleId)?.value.name || 'Artikel';
  const rows = s.offers
    .filter(o => o.value.supplierId === supplierId && o.value.active)
    .sort((a, b) => name(a.value.articleId).localeCompare(name(b.value.articleId), 'de'))
    .map(({ value: offer }) => {
      const article = s.articles.find(a => a.value.id === offer.articleId)?.value;
      let current = offer;
      try {
        current = effectiveOffer(offer, lists, day);
      } catch {
        /* Gebinde seit der letzten Preisliste geändert: Preis am Artikel zeigen */
      }
      return `<tr><th scope="row">${h(article?.name || 'Artikel')}</th><td>${h(packLabel(offer.packName, offer.packSize, article?.unit || '', n(offer.packSize)))}</td><td class="num">${current.priceNet === null ? '<span class="muted">offen</span>' : h(euro(current.priceNet))}</td><td>${current.priceNet !== null && current.priceDate ? h(displayDate(current.priceDate)) : ''}</td><td><button type="button" class="link-button" data-action="offer-edit" data-id="${h(offer.id)}" aria-label="${h(article?.name || 'Artikel')} bearbeiten">Bearbeiten</button></td></tr>`;
    })
    .join('');
  return rows
    ? `<div class="table-scroll"><table class="price-table"><thead><tr><th scope="col">Artikel</th><th scope="col">Gebinde</th><th scope="col" class="num">Preis netto</th><th scope="col">Stand</th><th scope="col"><span class="sr-only">Aktion</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p>Noch keine Artikel bei diesem Lieferanten.</p>';
}

export function suppliers(app: KitchenView): string {
  const s = app.state!;
  return `<div class="page-heading"><div><h1>Lieferanten</h1><p>Kontakte, Artikel und Preise an einem Ort.</p></div><div class="actions">${moreMenu([button('ww-price-import', 'Preisliste aus Excel einlesen'), button('ww-open', 'Frühere Preise', 'prices'), button('import', 'Lieferanten aus CSV einlesen', 'suppliers')])}${button('supplier-new', 'Lieferant anlegen', '', true)}</div></div>${suppliersTabs('suppliers')}<div class="toolbar">${searchField(app.query, 'Lieferanten suchen')}</div><section class="supplier-list">${
    s.suppliers
      .map(
        ({ value: v }) =>
          `<details class="supplier-profile" data-search="${h([v.name, v.contactPerson || '', v.address || '', v.phone, v.email].join(' '))}"><summary><span><strong>${h(v.name)}</strong><small>${v.active ? h(v.method) : 'Inaktiv'}${v.active && supplierHint(v) ? ' · ' + h(supplierHint(v)) : ''}</small></span><span>Profil öffnen</span></summary><div class="profile-content"><dl><div><dt>Ansprechpartner</dt><dd>${h(v.contactPerson || 'Nicht hinterlegt')}</dd></div><div><dt>Adresse</dt><dd>${h(v.address || 'Nicht hinterlegt')}</dd></div><div><dt>Telefon</dt><dd>${h(v.phone || 'Nicht hinterlegt')}</dd></div><div><dt>E-Mail</dt><dd>${h(v.email || 'Nicht hinterlegt')}</dd></div><div><dt>Bestellweg</dt><dd>${h(v.method)}</dd></div><div><dt>Kundennummer</dt><dd>${h(v.customerNumber || 'Nicht hinterlegt')}</dd></div></dl><h2>Notizen und Absprachen</h2><p>${h(v.note || 'Keine Notizen hinterlegt.')}</p>${button('supplier-edit', 'Profil bearbeiten', v.id, 'tinted')}<h2>Artikel und Preise</h2>${priceList(app, v.id)}<div class="actions">${button('supplier-prices', 'Preise ändern', v.id)}${button('article-new', 'Artikel hinzufügen', 'supplier:' + v.id)}${button('supplier-rules', 'Bestellschluss und Liefertage', v.id)}</div><h2>Bestellungen dieser Saison</h2>${
            s.orders
              .filter(
                o => o.value.supplierId === v.id && o.value.seasonId === app.seasonId && o.value.area === app.area
              )
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
          }</div></details>`
      )
      .join('') || emptyAction('Noch keine Lieferanten angelegt.', 'supplier-new', 'Ersten Lieferanten anlegen')
  }</section><p data-filter-empty hidden>Keine passenden Lieferanten.</p>`;
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
