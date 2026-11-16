// Stammdaten: Saison, Lieferanten, Artikel, Liefergebinde, Einzelzählung.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { icon } from '../icons.ts';
import { supplierNeedsReview } from '../review-status.ts';
import { documents } from '../ww/model.ts';
import { effectiveOffer } from '../ww/domain.ts';
import { h, n, money, button, empty } from '../markup.ts';
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
          const amount = price.priceNet === null ? 'Preis offen' : money(price.priceNet) + ' netto';
          return `<tr><td><strong>${h(supplier)}</strong>${offer.active ? '' : '<small>Inaktiv</small>'}</td>
   <td>${h(offer.packName)} à ${n(offer.packSize)} ${h(article.unit)}</td>
   <td>${h(amount)}${price.priceDate ? '<small>Stand ' + h(displayDate(price.priceDate)) + '</small>' : ''}</td>
   <td><button type="button" data-action="offer-edit" data-id="${h(offer.id)}" aria-label="Angebot von ${h(supplier)} bearbeiten">Bearbeiten</button></td></tr>`;
        })
        .join('');
      const comparison = offerRows
        ? `<table class="article-offers" aria-label="Lieferangebote für ${h(article.name)}"><thead><tr><th scope="col">Lieferant</th>
   <th scope="col">Gebinde</th><th scope="col">Preis je Gebinde</th><th scope="col"><span class="sr-only">Aktion</span></th></tr></thead>
   <tbody>${offerRows}</tbody></table>`
        : '<p class="muted">Noch kein Lieferangebot.</p>';
      return `<details class="article-list-row" data-search="${h(keywords)}"><summary><span class="article-name">${icon('chevron')}
  <span><strong>${h(article.name)}</strong>${article.active ? '' : ' <small>Inaktiv</small>'}</span></span>
  <span>${h(article.category || 'Ohne Kategorie')}</span><span>${h(article.unit)}</span>
  <span>${offers.length} ${offers.length === 1 ? 'Angebot' : 'Angebote'}<span class="sr-only">Angebote ansehen</span></span></summary>
  <div class="article-detail">${comparison}<div class="actions">${button('article-edit', 'Artikel bearbeiten', article.id)}
  ${article.active ? button('offer-new', 'Lieferangebot hinzufügen', article.id) : ''}</div></div></details>`;
    })
    .join('');
  return `<div class="page-heading"><div><h1>Artikel</h1><p>Gemeinsame Stammdaten für alle Bereiche.</p></div><div class="actions">${button('import', 'CSV importieren', 'articles')}${button('article-new', 'Artikel anlegen', '', true)}</div></div><div class="toolbar">${searchField(app.query, 'Artikel oder Lieferanten suchen')}</div><section class="article-list" aria-label="Artikelliste"><div class="article-list-head"><span>Artikel</span><span>Kategorie</span><span>Einheit</span><span>Lieferangebote</span></div>${rows || empty('Noch keine Artikel angelegt.')}</section><p data-filter-empty hidden>Keine passenden Artikel.</p>`;
}

export function suppliers(app: KitchenView): string {
  const s = app.state!;
  return `<div class="page-heading"><div><h1>Lieferanten</h1><p>Kontakte und Absprachen an einem Ort.</p></div><div class="actions">${button('supplier-new', 'Lieferant anlegen', '', true)}${button('import', 'CSV importieren', 'suppliers')}</div></div><div class="toolbar">${searchField(app.query, 'Lieferanten suchen')}</div><section class="supplier-list">${
    s.suppliers
      .map(
        ({ value: v }) =>
          `<details class="supplier-profile" data-search="${h([v.name, v.contactPerson || '', v.address || '', v.phone, v.email].join(' '))}"><summary><span><strong>${h(v.name)}</strong><small>${v.active ? h(v.method) : 'Inaktiv'}${v.active && supplierNeedsReview(v) ? ' · Bestellweg / Angaben prüfen' : ''}</small></span><span>Profil öffnen</span></summary><div class="profile-content"><dl><div><dt>Ansprechpartner</dt><dd>${h(v.contactPerson || 'Nicht hinterlegt')}</dd></div><div><dt>Adresse</dt><dd>${h(v.address || 'Nicht hinterlegt')}</dd></div><div><dt>Telefon</dt><dd>${h(v.phone || 'Nicht hinterlegt')}</dd></div><div><dt>E-Mail</dt><dd>${h(v.email || 'Nicht hinterlegt')}</dd></div><div><dt>Bestellweg</dt><dd>${h(v.method)}</dd></div><div><dt>Kundennummer</dt><dd>${h(v.customerNumber || 'Nicht hinterlegt')}</dd></div></dl><p>Prüfstatus: ${h(v.reviewStatus === 'geprueft' ? 'Manuell geprüft' : v.reviewStatus === 'offen' ? 'Klärung erforderlich' : 'Noch nicht festgelegt')}${v.reviewDate ? ' · ' + h(displayDate(v.reviewDate)) : ''}${v.reviewReason ? ' · ' + h(v.reviewReason) : ''}</p><h2>Notizen und Absprachen</h2><p>${h(v.note || 'Keine Notizen hinterlegt.')}</p>${button('supplier-edit', 'Profil bearbeiten', v.id, true)}<h2>Artikel und Gebinde</h2>${
            s.offers
              .filter(o => o.value.supplierId === v.id && o.value.active)
              .map(
                o =>
                  '<div class="review-row"><div><strong>' +
                  h(s.articles.find(a => a.value.id === o.value.articleId)?.value.name || 'Artikel') +
                  '</strong><small>' +
                  h(o.value.packName) +
                  ' à ' +
                  n(o.value.packSize) +
                  ' · ' +
                  money(
                    effectiveOffer(o.value, documents(s.ww, 'prices'), new Date().toISOString().slice(0, 10)).priceNet
                  ) +
                  ' netto</small></div>' +
                  button('offer-edit', 'Angebot bearbeiten', o.value.id) +
                  '</div>'
              )
              .join('') || '<p>Noch keine Lieferangebote.</p>'
          }<div class="actions">${button('supplier-prices', 'Preisstand ergänzen', v.id)}${button('supplier-rules', 'Lieferregeln', v.id)}</div><h2>Bestellungen dieser Saison</h2>${
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
      .join('') || empty('Noch keine Lieferanten angelegt.')
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
      value: old ? structuredClone(old) : { id: uuid(), name: '', unit: '', category: '', active: true }
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
