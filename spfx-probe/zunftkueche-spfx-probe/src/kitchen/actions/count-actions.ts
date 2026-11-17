// Abendabschluss: Zählen, Prüfen, Speichern.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { fieldNumber } from '../field-errors.ts';
import { articleAvailable } from '../model.ts';
import { nextUsePlans } from '../ww/operations-view.ts';
import type { InventorySession } from '../model';
import { parseDecimal } from '../domain.ts';
import { h, n, button } from '../markup.ts';
import { unitName } from '../units.ts';
import { countQuantity, validateInventory, latestCounts } from '../operations.ts';
import { countProgress, countShare } from '../operation-forms.ts';
import type { KitchenView } from '../view';
import { uuid } from '../view-support.ts';

/** Plus und Minus neben einem Mengenfeld. Leer bleibt leer, bis jemand zählt: Minus auf leer ergibt 0, Plus ergibt 1. */
export function countStep(app: KitchenView, id: string): void {
  const [name, step] = id.split('|'),
    input = app.root.querySelector<HTMLInputElement>(
      'form[data-form="inventory"] input[name="' + name.replace(/["\\]/g, '\\$&') + '"]'
    );
  if (!input) return;
  let current = 0;
  try {
    current = parseDecimal(input.value) ?? 0;
  } catch {
    current = 0;
  }
  input.value = n(Math.max(0, Math.round((current + Number(step)) * 10000) / 10000));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Schließt den offenen Artikel und öffnet den nächsten sichtbaren, zuerst einen noch nicht gezählten. */
export function countNext(app: KitchenView, id: string): void {
  const form = app.root.querySelector<HTMLFormElement>('form[data-form="inventory"]');
  if (!form) return;
  const lines = Array.from(form.querySelectorAll<HTMLElement>('.count-line')).filter(
    line => !line.hidden && !line.closest<HTMLElement>('[data-count-group]')?.hidden
  );
  const at = lines.findIndex(line => line.querySelector('[data-count-total]')?.getAttribute('data-count-total') === id),
    after = [...lines.slice(at + 1), ...lines.slice(0, Math.max(at, 0))];
  const open = (line: HTMLElement): boolean =>
    line.querySelector<HTMLElement>('[data-count-total]')?.dataset.state === 'open';
  const next = after.find(open) || (at >= 0 && at < lines.length - 1 ? lines[at + 1] : undefined);
  for (const item of Array.from(form.querySelectorAll<HTMLDetailsElement>('details.count-item[open]')))
    item.open = false;
  if (!next) {
    form.querySelector<HTMLElement>('[data-action="inventory-finish"]')?.focus();
    return;
  }
  const item = next.querySelector<HTMLDetailsElement>('details.count-item');
  if (item) item.open = true;
  next.querySelector<HTMLElement>('.count-field input')?.focus();
}

/** Abendabschluss. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function inventoryAction(
  app: KitchenView,
  action: string,
  id: string,
  target?: HTMLElement
): Promise<boolean> {
  if (!app.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if (action === 'inventory-setup') {
    await app.run(() => app.store.initialize(), 'Abendabschluss eingerichtet.');
    return true;
  }
  if (action === 'inventory-new' || action === 'inventory-edit') {
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    if (app.state.inventoriesReady === false) throw new Error('Bitte zuerst im Bestand den Abendabschluss einrichten.');
    if (!app.canLeave()) return true;
    const old = app.state.inventories?.find(r => r.value.id === id);
    if (
      action === 'inventory-edit' &&
      (!old || old.value.status !== 'Entwurf' || old.value.seasonId !== app.seasonId || old.value.area !== app.area)
    )
      throw new Error('Entwurf nicht gefunden.');
    app.clearEditor();
    app.query = '';
    app.view = 'stock';
    app.inventoryPrevious = old;
    app.inventory = old
      ? structuredClone(old.value)
      : {
          id: uuid(),
          seasonId: app.seasonId,
          area: app.area,
          status: 'Entwurf',
          createdAt: new Date().toISOString(),
          completedAt: null,
          countedBy: app.user,
          lines: app.state.articles
            .filter(a => articleAvailable(a.value, app.seasonId))
            .sort(
              (a, b) =>
                (a.value.storagePlace || '').localeCompare(b.value.storagePlace || '', 'de') ||
                a.value.name.localeCompare(b.value.name, 'de')
            )
            .map(({ value: a }) => {
              const offer = app.state!.offers.find(o => o.value.active && o.value.articleId === a.id)?.value;
              return {
                articleId: a.id,
                articleName: a.name,
                unit: a.unit,
                packName: offer?.packName || a.unit,
                packSize: offer?.packSize || 1,
                packs: null,
                loose: null,
                assessment: 'ok',
                note: ''
              };
            })
        };
    if (!app.inventory.lines.length) {
      app.clearEditor();
      throw new Error('Bitte zuerst Artikel anlegen.');
    }
    app.render();
    return true;
  }
  if (action === 'inventory-review-back') {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form=inventory]');
    if (form) {
      delete form.dataset.review;
      form.querySelector('[data-inventory-review]')?.replaceChildren();
    }
    return true;
  }
  if (action === 'inventory-finish' || action === 'inventory-confirm') {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form="inventory"]');
    if (form) await saveInventory(app, form, true, action === 'inventory-confirm');
    return true;
  }
  return false;
}

export function readInventory(app: KitchenView, form: HTMLFormElement): InventorySession {
  const data = new FormData(form),
    session = app.inventory!;
  return {
    ...session,
    lines: session.lines.map(l => {
      const packs = fieldNumber(form, 'packs_' + l.articleId, { integer: true }),
        loose = fieldNumber(form, 'loose_' + l.articleId);
      const quantity = countQuantity(packs, loose, l.packSize),
        old = countQuantity(l.packs, l.loose, l.packSize);
      const renewed = app.countEdits.get(l.articleId) || (quantity !== old ? new Date().toISOString() : undefined);
      const line = {
        ...l,
        note: String(data.get('countnote_' + l.articleId) || '').trim(),
        packs,
        loose,
        assessment: String(data.get('assessment_' + l.articleId) || 'ok') as 'ok' | 'reorder' | 'surplus'
      };
      if (quantity === null) {
        delete line.countedAt;
        delete line.countedBy;
      } else {
        line.countedAt = renewed || l.countedAt || session.createdAt;
        line.countedBy = renewed ? app.user : l.countedBy || session.countedBy;
      }
      return line;
    })
  };
}

export function updateCountTotals(app: KitchenView): void {
  const form = app.root.querySelector<HTMLFormElement>('form[data-form="inventory"]');
  if (!form || !app.inventory) return;
  const data = new FormData(form);
  let counted = 0;
  const visible = new Set(
    app.inventory.lines
      .filter(
        l =>
          form.querySelector('[data-count-total="' + l.articleId + '"]')?.closest<HTMLElement>('.count-line')
            ?.hidden !== true
      )
      .map(l => l.articleId)
  );
  for (const l of app.inventory.lines) {
    const el = form.querySelector<HTMLElement>('[data-count-total="' + l.articleId + '"]');
    try {
      const quantity = countQuantity(
        parseDecimal(String(data.get('packs_' + l.articleId) || '')),
        parseDecimal(String(data.get('loose_' + l.articleId) || '')),
        l.packSize
      );
      if (quantity !== null && visible.has(l.articleId)) counted++;
      if (el) {
        el.textContent = quantity === null ? 'offen' : n(quantity) + ' ' + unitName(l.unit, quantity);
        el.dataset.state = quantity === null ? 'open' : 'counted';
      }
    } catch {
      if (el) {
        el.textContent = 'Menge bitte prüfen';
        el.dataset.state = 'error';
      }
    }
  }
  const progress = form.querySelector('[data-count-progress]');
  if (progress) progress.innerHTML = countProgress(counted, visible.size, app.inventory.lines.length);
  const bar = form.querySelector<HTMLElement>('[data-count-bar]');
  if (bar) bar.style.width = countShare(counted, visible.size) + '%';
  const review = form.querySelector('[data-inventory-review]');
  if (review) review.replaceChildren();
}

export async function saveInventory(
  app: KitchenView,
  form: HTMLFormElement,
  finish: boolean,
  confirmed = false
): Promise<void> {
  const value = readInventory(app, form);
  value.status = finish ? 'Abgeschlossen' : 'Entwurf';
  value.completedAt = finish ? new Date().toISOString() : null;
  value.countedBy = app.user;
  validateInventory(value);
  if (finish && !confirmed) {
    const previous = latestCounts(app.state!, app.seasonId, app.area);
    const changes = value.lines.filter(l => {
      const old = previous.find(c => c.articleId === l.articleId),
        q = countQuantity(l.packs, l.loose, l.packSize);
      return old && q !== null && old.quantity > 0 && Math.abs(q - old.quantity) / old.quantity > 0.5;
    });
    const counted = value.lines.filter(l => countQuantity(l.packs, l.loose, l.packSize) !== null).length;
    const open = value.lines.length - counted;
    const review = form.querySelector('[data-inventory-review]')!;
    form.dataset.review = 'true';
    const marked = value.lines.filter(
      l => countQuantity(l.packs, l.loose, l.packSize) !== null && (l.assessment !== 'ok' || !!l.note)
    );
    const notes = marked
      .map(
        l =>
          '<li><strong>' +
          h(l.articleName) +
          '</strong> · ' +
          n(countQuantity(l.packs, l.loose, l.packSize)) +
          ' ' +
          h(unitName(l.unit)) +
          ' · ' +
          (l.assessment === 'reorder' ? 'Nachbestellen' : l.assessment === 'surplus' ? 'Überhang' : 'Übergabe') +
          (l.note ? ' · ' + h(l.note) : '') +
          '</li>'
      )
      .join('');
    review.innerHTML =
      '<section class="warning"><h2>Abendabschluss prüfen</h2><p>' +
      counted +
      ' Artikel gezählt. ' +
      (open
        ? open +
          ' Artikel ' +
          (open === 1 ? 'bleibt' : 'bleiben') +
          ' ungeprüft. Leere Felder werden nicht als null übernommen.'
        : 'Alle Artikel sind erfasst.') +
      '</p>' +
      (notes ? '<h3>Für das Team</h3><ul>' + notes + '</ul>' : '<p>Keine Engpässe oder Überhänge markiert.</p>') +
      (changes.length
        ? '<details><summary>Auffällige Veränderungen (' +
          changes.length +
          ')</summary><ul>' +
          changes
            .map(
              l =>
                '<li>' +
                h(l.articleName) +
                ': zuletzt ' +
                n(previous.find(c => c.articleId === l.articleId)!.quantity) +
                ' → jetzt ' +
                n(countQuantity(l.packs, l.loose, l.packSize)) +
                ' ' +
                h(unitName(l.unit)) +
                '</li>'
            )
            .join('') +
          '</ul><p>Abweichung über 50 %. Kann durch Verbrauch oder Lieferung erklärbar sein; bitte kurz prüfen.</p></details>'
        : '') +
      '<div class="calm-actions">' +
      button('inventory-review-back', 'Weiter zählen') +
      button('inventory-confirm', open ? 'Trotzdem abschließen' : 'Abschließen', '', true) +
      '</div></section>';
    review.scrollIntoView?.({ block: 'nearest' });
    return;
  }
  const previous = app.inventoryPrevious;
  await app.run(
    () => app.store.saveInventory(value, previous, app.operationId),
    finish
      ? 'Abendabschluss abgeschlossen.'
      : 'Entwurf gespeichert. Ihr könnt den Abendabschluss im Bestand fortsetzen.',
    () => {
      app.view = 'stock';
      if (finish && nextUsePlans(app.state!, value.seasonId, value.area).length) app.wwUI.screen = 'next-use';
    }
  );
}
