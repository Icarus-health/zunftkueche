// Bestellungen: Bestellblatt, Prüfen, Versand, Lieferungen, Nachbestellung.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { readSheetOrder } from '../order-sheet.ts';
import { scheduledOrder, withSchedule } from '../supplier-orders.ts';
import { supplierPdf } from '../supplier-pdf.ts';
import { supplierMail, supplierOrderText } from '../order-mail.ts';
import { deliveryMatrix, deliverySummary, orderGuidance, priceReview } from '../supplier-forms.ts';
import { documents } from '../ww/model.ts';
import { effectiveOffer } from '../ww/domain.ts';
import { priceSuggestion } from '../order-guidance.ts';
import type { Order, Stored, Supplier } from '../model';
import { catalog } from '../model.ts';
import { saveFile } from '../save-file.ts';
import { validateOrder, orderTotal } from '../domain.ts';
import { h, n, money, select, button, empty, ordersTabs, moreMenu, backLink } from '../markup.ts';
import { orderOverview } from '../order-overview.ts';
import { articleAvailable } from '../model.ts';
import { deliveryState, receivedQuantity, latestCounts } from '../operations.ts';
import { searchField, badge, stamp, displayDate } from '../workspace.ts';
import { deliverySlipsView } from '../operation-forms.ts';
import { sha256 } from '../imports/identity.ts';
import type { KitchenView } from '../view';
import { dayLabel } from '../ww/common.ts';
import { uuid } from '../view-support.ts';

const orderedQuestion =
  '<p>Ist die Bestellung beim Lieferanten aufgegeben? Danach sind die Mengen fest. Änderungen gehen dann über eine Nachbestellung.</p>';
export function orders(app: KitchenView): string {
  const season = app.season();
  const rows = app.state!.orders.filter(o => o.value.seasonId === app.seasonId && o.value.area === app.area);
  const days = app.overviewPicker;
  const heading = `<div class="page-heading"><div><h1>Bestellungen</h1><p>${h(season?.name || 'Bitte Saison wählen')} · ${h(app.area)}</p></div><div class="actions">${moreMenu([app.writable() ? button('copy-list', 'Aus Vorjahr übernehmen') : '', app.writable() && app.state!.ww?.ready ? button('ww-open', 'Vorlage laden', 'templates') : '', button('overview-pdf', 'Lieferplan als PDF')])}${app.writable() ? button('order-new', 'Neue Bestellung', '', true) : ''}</div></div>${ordersTabs(days ? 'days' : 'list')}`;
  if (days) return heading + orderOverview(app.state!, season, app.area, true);
  /* Lieferanten mit Artikeln, für die es in dieser Saison noch keine Bestellung gibt. */
  const started = new Set(
    rows
      .filter(o => o.value.status !== 'Storniert' && !/^historisch(?:e|er|es)?\b/i.test(o.value.occasion.trim()))
      .map(o => o.value.supplierId)
  );
  const open =
    season && app.writable()
      ? app
          .state!.suppliers.filter(x => x.value.active && !started.has(x.value.id))
          .map(x => ({
            supplier: x.value,
            count: app.state!.offers.filter(
              o =>
                o.value.active &&
                o.value.supplierId === x.value.id &&
                app.state!.articles.some(a => a.value.id === o.value.articleId && articleAvailable(a.value, season.id))
            ).length
          }))
          .filter(x => x.count > 0)
          .sort((a, b) => a.supplier.name.localeCompare(b.supplier.name, 'de'))
      : [];
  const pending = open.length
    ? `<section class="order-pending" aria-labelledby="order-pending-title"><h2 id="order-pending-title">Noch ohne Bestellung</h2>${open.map(x => `<div class="listrow"><div><strong>${h(x.supplier.name)}</strong><small>${x.count} Artikel</small></div>${button('order-new', 'Bestellung beginnen', x.supplier.id)}</div>`).join('')}</section>`
    : '';
  return (
    heading +
    `<div class="toolbar order-list-tools">${searchField(app.query, 'Bestellungen suchen')}${select(
      'orderStatus',
      'Status',
      [
        ['', 'Alle'],
        ['open', 'Offen'],
        ['ordered', 'Bestellt'],
        ['done', 'Erledigt']
      ],
      app.statusFilter
    )}</div><section class="order-table"><div class="order-table-head"><span>Lieferant</span><span>Liefertag</span><span>Status</span><span>Warenwert netto</span></div>${rows.map(({ value: o }) => `<div class="order-table-row" data-search="${h(o.supplierName + ' ' + o.occasion + ' ' + o.lines.map(l => l.articleName).join(' '))}" data-order-status="${h(o.status)}" data-order-current="${!/^historisch(?:e|er|es)?\b/i.test(o.occasion.trim())}" data-order-open="${o.status === 'Bestellt' && deliveryState(o) !== 'Vollständig geliefert'}"><div><button type="button" class="order-supplier" data-action="order-open" data-id="${h(o.id)}" aria-label="Bestellung von ${h(o.supplierName)} öffnen">${h(o.supplierName)}</button><small>${h(o.occasion || 'Ohne Anlass')} · ${o.lines.length} ${o.lines.length === 1 ? 'Position' : 'Positionen'}</small></div><span>${o.deliveries ? o.deliveries.length + (o.deliveries.length === 1 ? ' Liefertag · ' : ' Liefertage · ') + h(o.deliveryDate ? displayDate(o.deliveryDate) : 'Daten offen') : h(o.deliveryDate ? displayDate(o.deliveryDate) : 'Noch offen')}</span><span>${badge(o.receipts?.length ? deliveryState(o) : o.status, o.status === 'Entwurf' ? 'warning' : deliveryState(o) === 'Vollständig geliefert' ? 'success' : 'neutral')}</span><strong>${orderTotal(o) === null ? 'Preise offen' : money(orderTotal(o))}</strong></div>`).join('') || empty('Noch keine Bestellungen. Einen Entwurf anlegen oder aus einem Vorjahr übernehmen.')}</section><p data-filter-empty hidden>Keine passenden Bestellungen.</p>` +
    pending
  );
}

export function orderDetail(app: KitchenView, row?: Stored<Order>): string {
  if (!row) return empty('Bestellung nicht gefunden. Bitte neu laden.');
  const o = row.value,
    total = orderTotal(o),
    received = !!o.receipts?.length;
  const slips = documents(app.state!.ww, 'deliverySlip').filter(
    slip => slip.confirmed && slip.orderId === o.id && slip.scope === o.seasonId && slip.area === o.area
  );
  const canAttach =
    !!app.state!.ww?.ready &&
    app.writable() &&
    o.seasonId === app.seasonId &&
    o.area === app.area &&
    ['Bestellt', 'Abgeschlossen'].includes(o.status);
  return `<section class="panel">${backLink('cancel', 'Bestellungen')}<div class="row"><div><h1>${h(o.supplierName)}</h1><p>${h(o.occasion || 'Bestellung')}</p></div></div><div class="detail-meta">${badge(o.status, o.status === 'Entwurf' ? 'warning' : 'neutral')}${badge(deliveryState(o), deliveryState(o) === 'Vollständig geliefert' ? 'success' : 'neutral')}<span>${h(o.method)} · ${h(o.deliveryDate ? 'erste Lieferung ' + displayDate(o.deliveryDate) : 'Liefertag noch offen')}</span></div>${o.recordedAt ? `<p class="muted">Bestellung dokumentiert am ${h(stamp(o.recordedAt))} · ${h(o.recordedBy)}</p>` : ''}${o.sourceYear ? `<p class="muted">Übernommen aus Saison ${o.sourceYear}. Die Ausgangsbestellung bleibt erhalten.</p>` : ''}${o.deliveries ? deliverySummary(o) + deliveryMatrix(o, false) : ''}<div class="detail-lines" ${o.deliveries ? 'hidden' : ''}>${o.lines.map(l => `<div class="detail-line"><div><strong>${h(l.articleName)}</strong><small>${h(l.code)} · 1 ${h(l.packName)} = ${n(l.packSize)} ${h(l.unit)}</small>${received ? `<small>Geliefert ${n(receivedQuantity(o, l.id))} ${h(l.packName)} · offen ${n(Math.max(0, (l.quantity || 0) - receivedQuantity(o, l.id)))} ${h(l.packName)}</small>` : ''}</div><strong>${l.quantity === null ? 'Menge offen' : n(l.quantity) + ' ' + h(l.packName)}</strong><span>${l.quantity === null ? '' : n(l.quantity * l.packSize) + ' ' + h(l.unit)}</span><span>${money(l.priceNet)} netto / ${h(l.packName)}</span></div>`).join('')}</div><p class="total">${total === null ? 'Gesamtsumme offen · Preise oder Mengen fehlen' : 'Warenwert netto: ' + money(total) + ' · ohne Pfand'}</p>${o.note ? `<p>${h(o.note)}</p>` : ''}<div class="actions">${app.writable() && o.status === 'Bestellt' && !o.deliveries && deliveryState(o) !== 'Vollständig geliefert' ? button('receipt-new', 'Lieferung prüfen', o.id, true) : ''}${app.writable() && o.status === 'Entwurf' ? button('order-edit', 'Entwurf bearbeiten', o.id) + button('order-mail', 'PDF und E-Mail-Text', o.id) + button('order-mark', 'Als bestellt markieren', o.id, true) : button('order-pdf', 'PDF herunterladen', o.id) + (o.status === 'Entwurf' ? '' : button('order-bill', 'Rechnung zuordnen', o.id))}${o.deliveries ? o.deliveries.map(d => '<div class="delivery-summary"><strong>' + h(d.date ? dayLabel(d.date) : 'Datum offen') + '</strong><span>' + h([d.time, d.place].filter(Boolean).join(' · ')) + '</span>' + (app.writable() && o.status === 'Bestellt' ? button('receipt-new', 'Lieferung prüfen', o.id + '|' + d.id) : '') + '</div>').join('') : button('order-text', 'Bestelltext anzeigen', o.id)}${app.writable() && o.status === 'Bestellt' ? button('order-follow', 'Nachbestellung anlegen', o.id) + button('order-close', 'Vorgang abschließen', o.id) : ''}</div><div data-order-text class="ordertext" hidden></div>${o.deliveryNotes?.length ? `<details class="receipt-history" open><summary>Ausgefallene Lieferungen (${o.deliveryNotes.length})</summary>${o.deliveryNotes.map(x => `<div><strong>Keine Lieferung · ${h(stamp(x.recordedAt))}</strong><p>${h(x.recordedBy)} · ${h(displayDate(o.deliveries?.find(d => d.id === x.deliveryId)?.date || '') || 'Termin offen')}</p><p>${h(x.note)}</p></div>`).join('')}</details>` : ''}${
    received
      ? `<details class="receipt-history"><summary>Lieferhistorie (${o.receipts!.length})</summary>${o
          .receipts!.map(
            r =>
              `<div><strong>${h(stamp(r.receivedAt))}</strong><p>${h(r.receivedBy)}</p>${r.lines
                .map(l => {
                  const original = o.lines.find(x => x.id === l.lineId)!;
                  return `<p>${h(original.articleName)} · ${n(l.quantity)} ${h(original.packName)}</p>`;
                })
                .join('')}${r.note ? `<p>${h(r.note)}</p>` : ''}</div>`
          )
          .join('')}</details>`
      : ''
  }${deliverySlipsView(o, slips, canAttach)}</section>`;
}

export function reorderList(app: KitchenView): string {
  const counts = latestCounts(app.state!, app.seasonId, app.area).filter(c => c.reorder);
  return (
    '<section class="panel"><div class="page-heading"><div><h1>Nachbestellbedarf prüfen</h1><p>Die letzte Zählung zeigt einen Hinweis, keine automatisch berechnete Bestellmenge. Bestand und Bedarf vor der Bestellung prüfen.</p></div>' +
    button('cancel', 'Zurück') +
    '</div>' +
    (counts
      .map(c => {
        const offers = app.state!.offers.filter(o => o.value.articleId === c.articleId && o.value.active);
        return (
          '<section class="plain-section"><h2>' +
          h(c.articleName) +
          '</h2><p>Zuletzt gezählt: ' +
          n(c.quantity) +
          ' ' +
          h(c.unit) +
          ' · ' +
          h(stamp(c.countedAt)) +
          (c.note ? ' · ' + h(c.note) : '') +
          '</p>' +
          (offers.length
            ? offers
                .map(o => {
                  const supplier = app.state!.suppliers.find(x => x.value.id === o.value.supplierId)?.value;
                  if (!supplier?.active) return '';
                  const drafts = app.state!.orders.filter(
                    r =>
                      r.value.status === 'Entwurf' &&
                      r.value.supplierId === o.value.supplierId &&
                      r.value.seasonId === app.seasonId &&
                      r.value.area === app.area
                  );
                  return drafts.length
                    ? drafts
                        .map(d =>
                          button(
                            'reorder-existing',
                            'In ' + d.value.supplierName + ' · ' + d.value.occasion + ' vorbereiten',
                            d.value.id + '|' + o.value.id
                          )
                        )
                        .join('')
                    : button('order-reorder', supplier.name + ' · Bestellung vorbereiten', o.value.id);
                })
                .join('')
            : '<p>Kein aktives Lieferangebot hinterlegt.</p>') +
          '</section>'
        );
      })
      .join('') || empty('Aktuell wurde kein Nachbestellbedarf markiert.')) +
    '</section>'
  );
}

/** Bestellungen: Bestellblatt, Prüfen, Versand, Lieferungen, Nachbestellung. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function orderAction(
  app: KitchenView,
  action: string,
  id: string,
  target?: HTMLElement
): Promise<boolean> {
  if (!app.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if (action === 'order-open') {
    app.clearEditor();
    app.view = 'orders';
    app.selectedOrder = id;
    app.render();
    return true;
  }
  if (action === 'order-dates') {
    const block = app.root.querySelector<HTMLDetailsElement>('.sheet-days');
    if (block) {
      block.open = true;
      const input = block.querySelector<HTMLInputElement>('[name="date_' + id + '"]');
      input?.scrollIntoView?.({ block: 'center' });
      input?.focus();
    }
    return true;
  }
  if (action === 'sheet-options-close') {
    const options = app.root.querySelector<HTMLDetailsElement>('.sheet-options');
    if (options) options.open = false;
    return true;
  }
  if (action === 'delivery-day') {
    if (!app.draft) return true;
    const [deliveryId, date] = id.split('|');
    const input = app.root.querySelector<HTMLInputElement>('[name="date_' + deliveryId + '"]');
    if (!input) return true;
    input.value = date;
    app.draft = readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!);
    app.dirty = true;
    app.render();
    app.rememberDraft();
    return true;
  }
  if (action === 'orders-tab') {
    if (id === 'bills') {
      await app.action('ww-open', 'inbox');
      return true;
    }
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'orders';
    app.overviewPicker = id === 'days';
    app.render();
    return true;
  }
  if (action === 'order-review' || action === 'order-edit-sheet') {
    if (!app.draft) return true;
    app.draft = readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!);
    if (action === 'order-review') validateOrder(app.draft, catalog(app.state!));
    app.orderReview = action === 'order-review';
    app.render();
    app.rememberDraft();
    return true;
  }
  if (action === 'order-ingredient') {
    if (!app.draft) return true;
    app.draft = readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!);
    app.quickIngredient = { articleId: uuid(), offerId: uuid(), supplierId: app.draft.supplierId };
    app.render();
    return true;
  }
  if (action === 'ingredient-cancel') {
    app.quickIngredient = undefined;
    app.render();
    return true;
  }
  if (action === 'delivery-list') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'orders';
    app.deliveryPicker = true;
    app.render();
    return true;
  }
  if (action === 'supplier-orders') {
    if (!app.canLeave()) return true;
    const supplier = app.state.suppliers.find(s => s.value.id === id)?.value;
    if (!supplier) throw new Error('Lieferant nicht gefunden.');
    app.clearEditor();
    app.view = 'orders';
    app.query = supplier.name;
    app.statusFilter = '';
    app.render();
    return true;
  }
  if (action === 'order-round') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'orders';
    app.query = '';
    app.statusFilter = '';
    app.render();
    return true;
  }
  if (action === 'reorder-list') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'stock';
    app.reorderPicker = true;
    app.render();
    return true;
  }
  if (action === 'reorder-existing') {
    const [orderId, offerId] = id.split('|');
    const target = app.state.orders.find(
        x =>
          x.value.id === orderId &&
          x.value.status === 'Entwurf' &&
          x.value.seasonId === app.seasonId &&
          x.value.area === app.area
      ),
      offer = app.state.offers.find(x => x.value.id === offerId && x.value.active);
    if (!target || !offer || target.value.supplierId !== offer.value.supplierId)
      throw new Error('Bestellung oder Lieferangebot wurde geändert. Bitte neu laden.');
    await app.action('order-edit', orderId);
    if (!app.draft!.lines.some(l => l.offerId === offerId)) {
      const chooser = app.root.querySelector<HTMLSelectElement>('[name=addOffer]');
      if (!chooser) throw new Error('Lieferangebot nicht verfügbar.');
      chooser.value = offerId;
      if (chooser.value !== offerId) throw new Error('Artikel ist in dieser Saison nicht verfügbar.');
      await app.action('line-add', '');
      const added = app.draft!.lines.find(l => l.offerId === offerId)!;
      added.schedule = Object.fromEntries(app.draft!.deliveries!.map(d => [d.id, null]));
      added.quantity = null;
      app.render();
    }
    app.info = 'Bitte Liefertermin und nachzubestellende Menge prüfen und Entwurf speichern.';
    app.paintStatus();
    return true;
  }
  if (action === 'order-reorder') {
    const offer = app.state.offers.find(o => o.value.id === id)?.value;
    if (!offer) throw new Error('Lieferangebot fehlt.');
    await app.action('order-new', '');
    app.draft!.supplierId = offer.supplierId;
    const supplier = app.state.suppliers.find(s => s.value.id === offer.supplierId)!.value;
    app.draft!.supplierName = supplier.name;
    app.draft!.method = supplier.method;
    app.render();
    app.root.querySelector<HTMLSelectElement>('[name=addOffer]')!.value = id;
    await app.action('line-add', '');
    const added = app.draft!.lines.find(l => l.offerId === id)!;
    added.schedule = Object.fromEntries(app.draft!.deliveries!.map(d => [d.id, null]));
    added.quantity = null;
    app.render();
    app.info = 'Bitte Liefertermin und nachzubestellende Menge prüfen und Entwurf speichern.';
    app.paintStatus();
    return true;
  }
  if (action === 'order-new' || action === 'order-edit' || action === 'order-follow') {
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    app.clearEditor();
    const old = app.state.orders.find(o => o.value.id === id);
    if (action === 'order-edit' && old?.value.status !== 'Entwurf')
      throw new Error('Bestellte Positionen bleiben erhalten. Bitte Nachbestellung anlegen.');
    app.previous = action === 'order-edit' ? old : undefined;
    app.draft = old
      ? structuredClone(old.value)
      : {
          id: uuid(),
          seasonId: app.seasonId,
          area: app.area,
          supplierId: '',
          supplierName: '',
          status: 'Entwurf',
          occasion: '',
          deliveryDate: null,
          method: 'Telefon',
          note: '',
          sourceId: null,
          sourceYear: null,
          recordedBy: null,
          recordedAt: null,
          lines: []
        };
    if (action === 'order-follow' && old) {
      app.draft = {
        ...app.draft,
        id: uuid(),
        status: 'Entwurf',
        sourceId: old.value.id,
        sourceYear: app.season()!.year,
        occasion: ('Nachbestellung · ' + old.value.occasion).slice(0, 160),
        deliveryDate: null,
        recordedAt: null,
        recordedBy: null,
        lines: app.draft.lines.map(l => {
          const clean = { ...l };
          delete clean.sources;
          return {
            ...clean,
            id: uuid(),
            quantity: null,
            reviewed: false,
            ...(l.schedule ? { schedule: Object.fromEntries(Object.keys(l.schedule).map(k => [k, null])) } : {})
          };
        })
      };
    }
    if (action === 'order-follow') {
      delete app.draft.receipts;
      delete app.draft.deliveryNotes;
      delete app.draft.contributions;
    }
    app.draft = withSchedule(
      app.draft,
      action === 'order-new'
        ? documents(app.state.ww, 'slot').map(d => ({ id: d.id, date: d.date, time: d.time, place: d.place }))
        : undefined
    );
    if (action === 'order-new' && id) {
      const chosen = app.state.suppliers.find(s => s.value.id === id && s.value.active)?.value;
      if (!chosen) throw new Error('Lieferant nicht verfügbar. Bitte neu laden.');
      app.draft.supplierId = chosen.id;
      app.draft.supplierName = chosen.name;
      app.draft.method = chosen.method;
    }
    app.draft.occasion ||= app.season()!.name;
    app.render();
    return true;
  }
  if (action === 'delivery-add' || action === 'delivery-remove') {
    if (!app.draft) return true;
    app.draft = readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!);
    if (action === 'delivery-add') {
      if (app.draft.deliveries!.length >= 31) throw new Error('Höchstens 31 Liefertage je Bestellung.');
      const d = { id: uuid(), date: null, time: '', place: app.area };
      app.draft.deliveries!.push(d);
      app.draft.lines.forEach(l => {
        l.schedule![d.id] = 0;
      });
    } else {
      if (app.draft.deliveries!.length === 1) throw new Error('Mindestens einen Liefertag behalten.');
      if (app.draft.lines.some(l => (l.schedule![id] || 0) > 0))
        throw new Error('Dieser Tag enthält Mengen. Bitte zuerst Mengen auf einen anderen Tag verteilen.');
      app.draft.deliveries = app.draft.deliveries!.filter(d => d.id !== id);
      app.draft.lines.forEach(l => {
        delete l.schedule![id];
      });
    }
    app.draft = scheduledOrder(app.draft);
    app.dirty = true;
    app.render();
    return true;
  }
  if (action === 'price-adopt' && app.draft) {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form=order]')!;
    const current = readOrder(app, form),
      line = current.lines.find(l => l.id === id);
    if (!line) throw new Error('Artikel fehlt.');
    const proposal = priceSuggestion(current, line, app.state!);
    if (proposal.price === null) throw new Error(proposal.note);
    const input = form.querySelector<HTMLInputElement>('[name="price_' + id + '"]');
    if (!input) throw new Error('Preisfeld fehlt.');
    input.value = n(proposal.price);
    app.dirty = true;
    app.info = 'Preisvorschlag im Entwurf übernommen. Bitte noch speichern und prüfen.';
    app.paintStatus();
    updateOrderTotals(app);
    return true;
  }
  if (action === 'slip-download') {
    const row = app.state.ww?.records.find(r => r.value.id === id);
    const slip = row?.value;
    if (
      !row ||
      slip?.kind !== 'deliverySlip' ||
      !slip.confirmed ||
      slip.orderId !== app.selectedOrder ||
      slip.scope !== app.seasonId ||
      slip.area !== app.area
    )
      throw new Error('Lieferschein nicht gefunden. Bitte Bestellung erneut öffnen.');
    const bytes = await app.store.ww.readOriginal(row);
    if ((await sha256(bytes)) !== slip.fileHash)
      throw new Error('Die gespeicherte Datei stimmt nicht mit dem Original überein.');
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/octet-stream' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = slip.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  if (action === 'order-pdf' || action === 'order-preview-pdf') {
    const o =
      action === 'order-preview-pdf'
        ? readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!)
        : app.state.orders.find(o => o.value.id === id)!.value;
    downloadPdf(app, o);
    return true;
  }
  if (action === 'order-mail' || action === 'order-preview-mail') {
    const form =
      action === 'order-preview-mail' ? app.root.querySelector<HTMLFormElement>('form[data-form=order]') : null;
    const source = form ? readOrder(app, form) : app.state.orders.find(row => row.value.id === id)?.value;
    if (
      !source ||
      source.status !== 'Entwurf' ||
      !app.writable() ||
      source.seasonId !== app.seasonId ||
      source.area !== app.area
    )
      throw new Error('Bitte einen Bestellentwurf der aktiven Saison wählen.');
    const order = withSchedule(source);
    validateOrder(order, catalog(app.state), true);
    if (form) {
      /* Erst speichern, dann die Versandseite zeigen. Sonst wäre die Seite eine Sackgasse mit ungespeicherten Eingaben. */
      validateOrder(order, catalog(app.state));
      const previous = app.previous;
      await app.run(
        () => app.store.saveOrder(order, previous, app.operationId),
        'Entwurf gespeichert.',
        () => {
          app.selectedOrder = order.id;
          app.mailOrder = app.state?.orders.find(row => row.value.id === order.id)?.value || order;
        }
      );
      app.root.querySelector<HTMLElement>('[data-order-mail] h1')?.focus();
      return true;
    }
    app.selectedOrder = order.id;
    app.mailOrder = order;
    app.render();
    app.root.querySelector<HTMLElement>('[data-order-mail] h1')?.focus();
    return true;
  }
  if (action === 'order-mark' || action === 'order-mark-confirm') {
    const old = app.state.orders.find(row => row.value.id === id);
    if (
      !old ||
      old.value.status !== 'Entwurf' ||
      !app.writable() ||
      old.value.seasonId !== app.seasonId ||
      old.value.area !== app.area
    )
      throw new Error('Bitte einen Bestellentwurf der aktiven Saison wählen.');
    const order = withSchedule({
      ...old.value,
      status: 'Bestellt',
      recordedBy: app.user,
      recordedAt: new Date().toISOString()
    });
    validateOrder(order, catalog(app.state));
    if (action === 'order-mark') {
      app.root.querySelector('[data-order-confirm]')?.remove();
      const box = document.createElement('section');
      box.className = 'warning';
      box.setAttribute('data-order-confirm', '');
      box.setAttribute('aria-label', 'Als bestellt markieren');
      box.innerHTML =
        orderedQuestion +
        '<div class="actions">' +
        button('order-mark-confirm', 'Ja, ist bestellt', id, true) +
        button('order-record-back', 'Noch nicht') +
        '</div>';
      (app.root.querySelector('[data-order-mail], main section.panel') || app.root.querySelector('main')!).append(box);
      box.scrollIntoView?.({ block: 'nearest' });
      return true;
    }
    await app.run(
      () => app.store.saveOrder(order, old, app.operationId),
      'Als bestellt gespeichert. Die Lieferung erscheint jetzt in der Warenannahme.',
      () => {
        app.selectedOrder = order.id;
      }
    );
    return true;
  }
  if (action === 'order-mail-back') {
    app.mailOrder = undefined;
    app.info = '';
    app.error = '';
    app.render();
    app.root.querySelector<HTMLElement>('[data-action=order-mail]')?.focus();
    return true;
  }
  if (action === 'order-dispatch-pdf' && app.mailOrder) {
    downloadPdf(app, app.mailOrder, true);
    return true;
  }
  if (action === 'order-share' && app.mailOrder) {
    await shareOrder(app, app.mailOrder);
    return true;
  }
  if (action === 'order-mail-copy' && app.mailOrder) {
    const field = app.root.querySelector<HTMLTextAreaElement>('[name=orderMailBody]');
    if (!field) return true;
    try {
      const clipboard = app.root.ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error('Zwischenablage nicht verfügbar.');
      await clipboard.writeText(field.value);
      // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
      app.info = 'Bestelltext kopiert.';
    } catch {
      field.focus();
      field.select();
      // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
      app.info = 'Bestelltext markiert. Bitte mit dem Kopierbefehl übernehmen.';
    }
    app.paintStatus();
    return true;
  }
  if (action === 'order-bill') {
    app.wwUI.billForOrder(id);
    app.render();
    return true;
  }
  if (action === 'order-slot' && app.draft) {
    const slot = documents(app.state.ww, 'slot').find(s => s.id === id);
    if (!slot) throw new Error('Liefertermin fehlt.');
    app.draft = readOrder(app, app.root.querySelector<HTMLFormElement>('form[data-form=order]')!);
    app.draft.deliveryDate = slot.date;
    app.draft.note = [app.draft.note, slot.time, slot.place].filter(Boolean).join(' · ');
    app.dirty = true;
    app.render();
    return true;
  }
  if (action === 'line-add' || action === 'line-remove') {
    if (!app.draft) return true;
    const form = app.root.querySelector<HTMLFormElement>('form[data-form="order"]')!;
    const data = new FormData(form);
    app.draft = readOrder(app, form);
    if (action === 'line-remove') app.draft.lines = app.draft.lines.filter(l => l.id !== id);
    else {
      const offer = app.state.offers.find(o => o.value.id === String(data.get('addOffer')))?.value;
      if (!offer) throw new Error('Bitte ein Lieferangebot wählen.');
      if (app.draft.lines.some(l => l.offerId === offer.id))
        throw new Error('Dieser Artikel ist bereits enthalten. Bitte die vorhandene Menge ändern.');
      const article = app.state.articles.find(a => a.value.id === offer.articleId)!.value;
      const quoted = effectiveOffer(
        offer,
        documents(app.state.ww, 'prices'),
        app.draft.deliveryDate || new Date().toISOString().slice(0, 10)
      );
      app.draft.lines.push({
        id: uuid(),
        articleId: article.id,
        offerId: offer.id,
        articleName: article.name,
        code: offer.code,
        unit: article.unit,
        packName: offer.packName,
        packSize: offer.packSize,
        quantity: null,
        priceNet: quoted.priceNet,
        priorPriceNet: null,
        priceYear: null,
        reviewed: false,
        schedule: Object.fromEntries(app.draft.deliveries!.map(d => [d.id, 0]))
      });
    }
    app.dirty = true;
    app.render();
    return true;
  }
  if (action === 'order-record' || action === 'order-record-confirm') {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form="order"]');
    if (form) await saveOrder(app, form, true, action === 'order-record-confirm');
    return true;
  }
  if (action === 'order-record-back') {
    app.root.querySelector('[data-order-confirm]')?.remove();
    return true;
  }
  if (action === 'order-text') {
    const order = app.state.orders.find(row => row.value.id === id)?.value;
    const box = app.root.querySelector<HTMLElement>('[data-order-text]');
    if (!order || !box) throw new Error('Bestellung fehlt.');
    box.hidden = false;
    box.textContent = supplierOrderText(order, supplierFor(app, order));
    return true;
  }
  if (action === 'order-close' || action === 'order-close-confirm') {
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    const old = app.state.orders.find(o => o.value.id === id)!;
    if (action === 'order-close' && deliveryState(old.value) !== 'Vollständig geliefert') {
      const box = document.createElement('section');
      box.className = 'warning';
      box.innerHTML =
        '<p>Es sind noch Liefermengen offen. Soll der Vorgang trotzdem abgeschlossen werden? Die fehlenden Mengen werden nicht als geliefert gebucht.</p>' +
        button('order-close-confirm', 'Trotz Fehlmengen abschließen', id);
      app.root.querySelector('main')!.append(box);
      return true;
    }
    await app.run(
      () => app.store.saveOrder({ ...old.value, status: 'Abgeschlossen' }, old, app.operationId),
      'Abschluss dokumentiert und nachgelesen.'
    );
    return true;
  }
  return false;
}

export function readOrder(app: KitchenView, form: HTMLFormElement, showFieldErrors = true): Order {
  return readSheetOrder(form, app.draft!, app.state!, showFieldErrors);
}

export function updateOrderTotals(app: KitchenView): void {
  try {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form=order]');
    if (!form) return;
    const o = readOrder(app, form, false);
    for (const l of o.lines) {
      const el = form.querySelector('[data-line-total="' + l.id + '"]');
      if (el) el.textContent = n(l.quantity) + ' ' + l.packName;
    }
    const sheetSummary = form.querySelector('[data-sheet-summary]');
    if (sheetSummary) sheetSummary.textContent = o.lines.length ? o.lines.length + ' Artikel' : 'Mengen eintragen';
    const summary = form.querySelector('[data-order-summary]');
    if (summary) summary.innerHTML = deliverySummary(o);
    const guidance = form.querySelector('[data-order-guidance]');
    if (guidance) guidance.innerHTML = orderGuidance(o);
    const prices = form.querySelector('[data-price-review]');
    if (prices) {
      const wasOpen = prices.querySelector('details')?.open;
      prices.innerHTML = priceReview(o, app.state!);
      if (wasOpen === false) prices.querySelector('details')?.removeAttribute('open');
    }
    const total = form.querySelector('[data-order-total]');
    if (total)
      total.textContent =
        orderTotal(o) === null
          ? 'Warenwert offen · Mengen oder Preise fehlen'
          : 'Warenwert gesamt netto: ' + money(orderTotal(o)) + ' · ohne Pfand und Lieferkosten';
  } catch {
    /* Invalid input is explained at save without interrupting typing. */
  }
}

export function supplierFor(app: KitchenView, order: Order): Supplier {
  const supplier = app.state!.suppliers.find(row => row.value.id === order.supplierId)?.value;
  if (!supplier) throw new Error('Bitte Lieferanten wählen.');
  return supplier;
}

export function pdfName(app: KitchenView, order: Order): string {
  return ('Bestellung-' + order.supplierName + '-' + app.season()?.year + '.pdf').replace(
    /[^a-zA-Z0-9äöüÄÖÜß._-]/g,
    '-'
  );
}

export function downloadPdf(app: KitchenView, order: Order, forDispatch = false): void {
  const bytes = supplierPdf(order, supplierFor(app, order), undefined, forDispatch);
  saveFile(
    pdfName(app, order),
    new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }),
    app.root.ownerDocument
  );
}

/** Teilen mit Dateien gibt es auf Telefonen und Tablets, in den meisten Desktop-Browsern nicht. */
export function canShareFiles(app: KitchenView): boolean {
  const nav = app.root.ownerDocument.defaultView?.navigator;
  try {
    return !!nav?.canShare && nav.canShare({ files: [new File(['%PDF'], 'probe.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/** Mit PDF teilen, sonst PDF speichern und das E-Mail-Programm öffnen. Abbrechen im Teilen-Menü ist kein Fehler. */
export async function shareOrder(app: KitchenView, order: Order): Promise<void> {
  const supplier = supplierFor(app, order),
    mail = supplierMail(order, supplier),
    bytes = supplierPdf(order, supplier, undefined, true);
  const nav = app.root.ownerDocument.defaultView?.navigator;
  if (canShareFiles(app) && nav?.share) {
    const file = new File([new Uint8Array(bytes).buffer], pdfName(app, order), { type: 'application/pdf' });
    try {
      await nav.share({ files: [file], title: mail.subject, text: mail.body });
      // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
      app.info = 'Teilen geöffnet. Nach dem Senden die Bestellung als bestellt dokumentieren.';
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') throw error;
      // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
      app.info = 'Teilen abgebrochen. Nichts wurde gesendet.';
    }
    app.paintStatus();
    return;
  }
  saveFile(
    pdfName(app, order),
    new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }),
    app.root.ownerDocument
  );
  if (mail.href) {
    const link = app.root.ownerDocument.createElement('a');
    link.href = mail.href;
    link.click();
  }
  app.info = mail.href
    ? 'PDF gespeichert, E-Mail geöffnet. PDF anhängen und senden, danach als bestellt dokumentieren.'
    : 'PDF gespeichert. Lieferant hat keine E-Mail-Adresse, bitte im E-Mail-Programm eintragen.';
  app.paintStatus();
}

export async function saveOrder(
  app: KitchenView,
  form: HTMLFormElement,
  record: boolean,
  confirmed = false
): Promise<void> {
  const order = readOrder(app, form);
  if (record) {
    order.status = 'Bestellt';
    order.recordedBy = app.user;
    order.recordedAt = new Date().toISOString();
  }
  validateOrder(order, catalog(app.state!));
  if (record && !confirmed) {
    form.querySelector('[data-order-confirm]')?.remove();
    const confirmation = document.createElement('section');
    confirmation.className = 'warning';
    confirmation.setAttribute('data-order-confirm', '');
    confirmation.setAttribute('aria-label', 'Bestellung dokumentieren');
    confirmation.innerHTML =
      orderedQuestion +
      '<div class="actions">' +
      button('order-record-confirm', 'Ja, ist bestellt', '', true) +
      button('order-record-back', 'Noch nicht') +
      '</div>';
    form.append(confirmation);
    confirmation.scrollIntoView({ block: 'nearest' });
    return;
  }
  const previous = app.previous;
  await app.run(
    () => app.store.saveOrder(order, previous, app.operationId),
    record ? 'Als bestellt gespeichert. Die Lieferung erscheint jetzt in der Warenannahme.' : 'Entwurf gespeichert.',
    () => {
      app.selectedOrder = order.id;
    }
  );
}
