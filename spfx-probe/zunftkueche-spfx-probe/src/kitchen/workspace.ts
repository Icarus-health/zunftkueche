import { nextUsePlans } from './ww/operations-view.ts';
import { APP_VERSION } from './release.ts';
import type { Area, Season, Workspace } from './model';
import { areaOptions, articleAvailable } from './model.ts';
import { button, empty, h, money, moreMenu, n, reportsTabs, select } from './markup.ts';
import { unitName, count } from './units.ts';
import { deliveryState, latestCounts, receivedQuantity, countQuantity } from './operations.ts';
import { orderTotal } from './domain.ts';
import { stockProjection } from './ww/domain.ts';
import { wwReport } from './ww/reports.ts';
import { icon } from './icons.ts';
import { fasnetReport } from './fasnet-report.ts';

export type WorkspaceView =
  'heute' | 'orders' | 'stock' | 'planning' | 'menu' | 'reports' | 'management' | 'articles' | 'suppliers';
export function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('.') : value;
}
export function stamp(value: string): string {
  return new Date(value).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}
export function badge(text: string, tone = 'neutral'): string {
  return `<span class="badge ${tone}">${h(text)}</span>`;
}
/** Sechs Tabs und das Zahnrad. Artikel gehört zu Lieferanten, Bestand zur Auswertung. */
export function sidebar(season: Season | undefined, view: WorkspaceView): string {
  /* Vierte Angabe: steht am Telefon in der festen Leiste unten. Alles andere liegt dort auf der Seite „Mehr“. */
  const tabs: Array<[WorkspaceView, string, string, boolean, string?]> = [
    ['heute', 'Übersicht', 'home', true],
    ['orders', 'Bestellungen', 'cart', true],
    ['suppliers', 'Lieferanten', 'truck', false],
    ['planning', 'Speisen & Getränke', 'calendar', true, 'Speisen'],
    ['menu', 'Karte', 'card', true],
    ['reports', 'Auswertung', 'chart', false],
    ['management', 'Einstellungen', 'settings', false]
  ];
  const active: WorkspaceView = view === 'articles' ? 'suppliers' : view === 'stock' ? 'reports' : view;
  return `<aside class="sidebar"><div class="sidebar-head"><div class="brand"><span>Zunftküche<small>Schelmenzunft Staufen</small></span></div></div><nav id="kitchen-workspaces" aria-label="Arbeitsbereiche"><h2 class="more-title">Mehr</h2>${tabs.map(([id, label, image, main, short]) => `<button type="button" data-action="nav" data-id="${id}" aria-current="${active === id ? 'page' : 'false'}" data-tab="${main ? 'main' : 'more'}"${id === 'management' ? ' class="nav-settings"' : ''}>${icon(image)}<span${short ? ' class="nav-long"' : ''}>${label}</span>${short ? '<span class="nav-short" aria-hidden="true">' + short + '</span>' : ''}${main ? '' : '<span class="nav-go">' + icon('chevron') + '</span>'}</button>`).join('')}<button type="button" class="nav-reload" data-action="reload" data-tab="more"><span>Aktualisieren</span></button><button type="button" class="nav-more${tabs.some(([id, , , main]) => !main && id === active) ? ' is-current' : ''}" data-action="mobile-menu" aria-expanded="false">${icon('more')}<span>Mehr</span></button></nav><div class="sidebar-foot"><span>Version ${APP_VERSION}${season?.archived ? ' · Archiv' : ''}</span>${button('reload', 'Aktualisieren')}</div></aside>`;
}
/** Bereich und Saison: eine Kapsel zeigt die Auswahl, das kleine Blatt darunter ändert sie. In einer Aufgabe steht dieselbe Angabe als ruhige Zeile. */
export function contextSwitch(
  state: Workspace | undefined,
  season: Season | undefined,
  area: Area,
  seasonId: string
): string {
  const label = area + ' · ' + (season?.name || 'Keine Saison gewählt');
  return `<details class="context-switch"><summary><span class="sr-only">Bereich und Saison: </span><span>${h(label)}</span>${icon('updown')}</summary><div class="context-sheet">${select(
    'areaContext',
    'Bereich',
    areaOptions(),
    area
  )}${select('seasonContext', 'Saison', [['', 'Saison wählen'], ...(state?.seasons || []).map(r => [r.value.id, r.value.name + (r.value.archived ? ' · Archiv' : '')] as [string, string])], seasonId)}</div></details><p class="work-context">${h(label)}</p>`;
}
export { dashboard } from './home.ts';
export function stockOverview(state: Workspace, season: Season | undefined, area: Area, query: string): string {
  const counts = latestCounts(state, season?.id || '', area);
  const drafts = (state.inventories || []).filter(
    r => r.value.seasonId === season?.id && r.value.area === area && r.value.status === 'Entwurf'
  );
  const latest = (state.inventories || [])
    .filter(
      r =>
        r.value.seasonId === season?.id &&
        r.value.area === area &&
        r.value.status === 'Abgeschlossen' &&
        r.value.completedAt
    )
    .sort((a, b) => b.value.completedAt!.localeCompare(a.value.completedAt!))[0]?.value;
  const nextUse =
    season && !season.archived && nextUsePlans(state, season.id, area).length
      ? button('ww-open', 'Nächsten Einsatz prüfen', 'next-use')
      : '';
  const counted = latest?.lines.filter(l => countQuantity(l.packs, l.loose, l.packSize) !== null).length || 0;
  const lastSummary = latest
    ? '<section class="resume"><strong>Letzter Abendabschluss · ' +
      (counted < latest.lines.length ? 'teilweise' : 'vollständig') +
      '</strong><p>' +
      counted +
      ' von ' +
      latest.lines.length +
      ' Artikeln gezählt · ' +
      h(stamp(latest.completedAt!)) +
      '</p></section>'
    : '';
  const ready = state.inventoriesReady !== false;
  const projection = stockProjection(
    state,
    (state.ww?.records || []).map(r => r.value),
    season?.id || '',
    area,
    ''
  );
  const articles = state.articles.filter(a => articleAvailable(a.value, season?.id || '')).map(r => r.value);
  const groupOf = (category: string): string => (category || '').trim();
  const groups = [...new Set(articles.map(a => groupOf(a.category)))].sort((a, b) =>
    a === b ? 0 : a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de')
  );
  const titled = groups.some(Boolean);
  const needs = counts.filter(c => c.reorder && articles.some(a => a.id === c.articleId)).length;
  /* Status als Wort mit Zeichen davor: Punkt, Haken, Pfeil oder Ring. Die Farbe allein trägt keine Bedeutung. */
  const status = (c: (typeof counts)[number] | undefined): string =>
    !c
      ? '<span class="stock-status open"><i aria-hidden="true"></i>Noch nicht gezählt</span>'
      : c.reorder
        ? '<span class="stock-status warning"><i aria-hidden="true"></i>Nachbestellen</span>'
        : c.surplus
          ? '<span class="stock-status info">' + icon('up') + 'Überhang</span>'
          : '<span class="stock-status success">' + icon('check') + 'Gezählt</span>';
  const row = (a: (typeof articles)[number]): string => {
    const c = counts.find(x => x.articleId === a.id);
    return `<div class="inventory-overview-row" data-search="${h(a.name + ' ' + a.category)}"><div><strong>${h(a.name)}</strong>${status(c)}${c?.note ? '<small>' + h(c.note) + '</small>' : ''}</div>${c ? `<div class="stock-value"><strong>${n(c.quantity)} ${h(unitName(c.unit, c.quantity))}</strong>${projection.find(p => p.articleId === a.id)?.quantity !== null ? '<small>Rechnerisch seitdem: ' + n(projection.find(p => p.articleId === a.id)?.quantity ?? null) + ' ' + h(unitName(c.unit, projection.find(p => p.articleId === a.id)?.quantity ?? null)) + '</small>' : ''}<small>${h(stamp(c.countedAt))}</small></div>` : ''}</div>`;
  };
  const list = groups
    .map(
      group =>
        `<section class="stock-group" data-count-group>${titled ? '<h2>' + h(group || 'Ohne Kategorie') + '</h2>' : ''}<div class="stock-rows">${articles
          .filter(a => groupOf(a.category) === group)
          .map(row)
          .join('')}</div></section>`
    )
    .join('');
  const reorder =
    counts.some(c => c.reorder) && season && !season.archived
      ? `<button type="button" class="list-link" data-action="reorder-list" data-id=""><span>Nachbestellbedarf prüfen</span>${needs ? '<span class="count-pill">' + needs + '<span class="sr-only"> Artikel</span></span>' : ''}${icon('chevron')}</button>`
      : '';
  return `<div class="page-heading"><div><h1>Bestand</h1><p>Was zuletzt gezählt wurde und wo es knapp wird.</p></div><div class="actions">${season && !season.archived ? button(ready ? 'inventory-new' : 'inventory-setup', ready ? 'Abendabschluss starten' : 'Abendabschluss einrichten', '', true) : ''}</div></div>${reportsTabs('stock')}${drafts.length ? `<section class="resume"><strong>${drafts.length === 1 ? '1 begonnener Abendabschluss' : drafts.length + ' begonnene Abendabschlüsse'}</strong>${drafts.map(r => `<div class="resume-row"><span>Begonnen ${h(stamp(r.value.createdAt))}</span>${button('inventory-edit', 'Fortsetzen', r.value.id)}</div>`).join('')}</section>` : ''}${lastSummary}<div class="toolbar">${searchField(query, 'Bestände suchen')}${nextUse}</div>${reorder}<section class="data-list stock-list">${list || empty('Zuerst Artikel anlegen.')}</section><p data-filter-empty hidden>Keine passenden Artikel.</p><p class="muted list-footnote">Gezählt ist eine tatsächliche Beobachtung. Rechnerisch werden spätere Lieferungen und gemeldeter Verbrauch ergänzt; ungezählte Artikel bleiben offen.</p><details><summary>Verbrauch, Übergaben und Verlauf</summary>${button('ww-transfer', 'Ware an anderen Bereich übergeben')}${button('ww-new', 'Verlust oder Eigenverbrauch erfassen', 'movement')}${button('ww-open', 'Berechnung und Verlauf ansehen', 'journal')}</details>`;
}
export function searchField(value: string, label = 'Suchen'): string {
  return `<label class="search-label">${icon('search')}<span class="sr-only">${h(label)}</span><input type="search" name="workspaceSearch" aria-label="${h(label)}" placeholder="${h(label)}" value="${h(value)}" autocomplete="off" /></label>`;
}
export function planningOverview(state: Workspace, season: Season | undefined, area: Area): string {
  const previous = state.orders.filter(
    r => r.value.seasonId !== season?.id && r.value.area === area && r.value.status !== 'Storniert'
  );
  return `<div class="page-heading"><div><h1>Planung</h1><p>Bewährte Bestellungen als Ausgangspunkt für die neue Saison.</p></div>${season && !season.archived && previous.length ? button('copy-list', 'Aus Vorjahr übernehmen', '', true) : ''}</div><section class="plain-section"><h2>Vorjahresübernahme</h2><p>Wählt eine frühere Bestellung aus und prüft die Mengen. Termine, Bestellstatus und Lieferungen werden zurückgesetzt. Alte Preise bleiben als Vergleich sichtbar.</p><p>${previous.length} frühere Bestellungen im Bereich ${h(area)} verfügbar.</p>${!previous.length ? empty('Nach der ersten Saison können Bestellungen hier erneut verwendet werden.') : ''}</section><section class="plain-section"><h2>Vorbereitung prüfen</h2><p>${state.articles.filter(a => a.value.active && !state.offers.some(o => o.value.active && o.value.articleId === a.value.id)).length} aktive Artikel ohne Lieferant.</p><p>${state.offers.filter(o => o.value.active && o.value.priceNet === null).length} Artikel mit offenem Preis.</p>${button('nav', 'Artikel und Angebote prüfen', 'articles')}</section>`;
}
export function reportsOverview(state: Workspace, season: Season | undefined, area: Area): string {
  const orders = state.orders
    .filter(
      r =>
        r.value.seasonId === season?.id &&
        r.value.area === area &&
        ['Bestellt', 'Abgeschlossen'].includes(r.value.status)
    )
    .map(r => r.value);
  const complete = orders.filter(o => orderTotal(o) !== null),
    value = complete.reduce((sum, o) => sum + (orderTotal(o) || 0), 0);
  const observations = latestCounts(state, season?.id || '', area);
  return `<div class="page-heading"><div><h1>Auswertung</h1><p>${h(season?.name || 'Bitte Saison wählen')}</p></div><div class="actions">${season ? moreMenu([button('ww-open', 'Kassendateien einlesen', 'inbox-system'), button('ww-open', 'Bestätigte Kassendaten', 'systems'), button('fasnet-export', 'Ganze Saison als CSV')]) : ''}</div></div>${reportsTabs('reports')}${season ? fasnetReport(state, season.id, season.name) : ''}<h2 class="area-detail-title">${h(area)} im Detail</h2><dl class="summary-grid"><div><dt>Dokumentierte Bestellungen</dt><dd>${orders.length}</dd></div><div><dt>Bestellwert netto${complete.length !== orders.length ? ' · nur vollständig bepreiste Vorgänge' : ''}</dt><dd>${money(value)}</dd></div><div><dt>Preise unvollständig</dt><dd>${orders.length - complete.length} Vorgänge</dd></div><div><dt>Artikel mit Zählung</dt><dd>${observations.length}</dd></div></dl><section class="plain-section"><h2>Lieferübersicht</h2>${orders.length ? `<div class="data-list">${orders.map(o => `<div class="report-row"><div><strong>${h(o.supplierName)}</strong><small>${h(o.occasion)}</small></div>${badge(deliveryState(o), deliveryState(o) === 'Vollständig geliefert' ? 'success' : 'warning')}<span>${o.lines.reduce((sum, l) => sum + (receivedQuantity(o, l.id) > 0 ? 1 : 0), 0)} von ${count(o.lines.length, 'Position', 'Positionen')} mit Wareneingang</span>${button('order-open', 'Öffnen', o.id)}</div>`).join('')}</div>` : empty('Noch keine aufgegebenen Bestellungen in dieser Saison.')}</section>${wwReport(state, season?.id || '', area)}`;
}
