// Bedienelemente ohne Speichern: Menü, Plus und Minus, Ausdrucke, unterbrochene Entwürfe.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { exportFasnetRows } from '../fasnet-report.ts';
import { saveFile } from '../save-file.ts';
import { countSheetPdf } from '../count-sheet-pdf.ts';
import type { KitchenView } from '../view';
import { countStep, countNext } from './count-actions.ts';
import { dayRow } from '../forms.ts';

/** Bedienelemente ohne Speichern: Menü, Plus und Minus, Ausdrucke, unterbrochene Entwürfe. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function uiAction(app: KitchenView, action: string, id: string, target?: HTMLElement): Promise<boolean> {
  if (action === 'mobile-menu') {
    const bar = app.root.querySelector<HTMLElement>('.sidebar');
    if (bar) {
      const open = bar.dataset.menuOpen !== 'true';
      bar.dataset.menuOpen = String(open);
      target?.setAttribute('aria-expanded', String(open));
      if (open && app.viaKeyboard) bar.querySelector<HTMLElement>('nav button[data-tab="more"]')?.focus();
      app.syncHistory();
    }
    return true;
  }
  if (action === 'day-add' || action === 'day-remove') {
    const list = target?.closest('.day-list')?.querySelector<HTMLElement>('.day-rows');
    if (!list) return true;
    if (action === 'day-add') {
      list.insertAdjacentHTML('beforeend', dayRow());
      list.querySelector<HTMLInputElement>('.day-row:last-child input')?.focus();
    } else {
      target?.closest('.day-row')?.remove();
      if (!list.children.length) list.insertAdjacentHTML('beforeend', dayRow());
      app.dirty = true;
    }
    return true;
  }
  if (action === 'count-step') {
    countStep(app, id);
    return true;
  }
  if (action === 'count-next') {
    countNext(app, id);
    return true;
  }
  if (action === 'count-sheet' && app.inventory && app.state) {
    const articles = app.state.articles.map(a => a.value);
    saveFile(
      'Abendabschluss-Papier-' + app.area + '-' + (app.season()?.name || '').replace(/[^\p{L}\p{N}]+/gu, '-') + '.pdf',
      new Blob(
        [
          new Uint8Array(
            countSheetPdf(app.inventory, {
              area: app.area,
              seasonName: app.season()?.name || '',
              places: Object.fromEntries(articles.map(a => [a.id, a.storagePlace || ''])),
              categories: Object.fromEntries(articles.map(a => [a.id, a.category || '']))
            })
          ).buffer
        ],
        { type: 'application/pdf' }
      ),
      app.root.ownerDocument
    );
    return true;
  }
  if (action === 'fasnet-export') {
    const season = app.season();
    if (!season || !app.state) return true;
    saveFile(
      'Zunftkueche-' + season.name.replace(/[^\p{L}\p{N}]+/gu, '-') + '-gesamt.csv',
      new Blob([exportFasnetRows(app.state, season.id)], { type: 'text/csv;charset=utf-8' }),
      app.root.ownerDocument
    );
    return true;
  }
  if (action === 'draft-resume') {
    await app.resumeDraft();
    return true;
  }
  if (action === 'draft-discard') {
    app.local.remove('draft');
    app.recovery = undefined;
    app.render();
    return true;
  }
  if (action === 'draft-download' && app.recovery) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(app.recovery, null, 2)], { type: 'application/json' })),
      a = document.createElement('a');
    a.href = url;
    a.download = 'Zunftkueche-lokaler-Entwurf.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  return false;
}
