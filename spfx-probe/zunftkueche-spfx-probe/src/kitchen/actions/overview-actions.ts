// Gesamtbestellung: Seite öffnen, Lieferplan als PDF, Liefertermine der Entwürfe speichern.
import type { KitchenView } from '../view';
import { overviewChanges, overviewPdf } from '../order-overview.ts';
import { saveFile } from '../save-file.ts';

export function overviewAction(app: KitchenView, action: string): boolean {
  if (action === 'order-overview') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'orders';
    app.overviewPicker = true;
    app.render();
    return true;
  }
  if (action === 'overview-pdf') {
    const season = app.season();
    if (!season || !app.state) return true;
    saveFile(
      'Lieferplan-' + season.name.replace(/[^\p{L}\p{N}]+/gu, '-') + '-' + app.area + '.pdf',
      new Blob([new Uint8Array(overviewPdf(app.state, season, app.area)).buffer], { type: 'application/pdf' }),
      app.root.ownerDocument
    );
    return true;
  }
  return false;
}

export async function saveOverview(app: KitchenView, form: HTMLFormElement): Promise<void> {
  if (!app.state || !app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
  const changes = overviewChanges(form, app.state, app.seasonId, app.area);
  if (!changes.length) {
    app.info = 'Keine geänderten Liefertermine.';
    app.paintStatus();
    return;
  }
  const operationId = app.operationId;
  await app.run(
    async () => {
      for (const [i, change] of changes.entries())
        await app.store.saveOrder(change.order, change.previous, operationId + '-' + i);
    },
    changes.length === 1
      ? 'Liefertage einer Bestellung gespeichert.'
      : 'Liefertage von ' + changes.length + ' Bestellungen gespeichert.',
    () => {
      app.view = 'orders';
      app.overviewPicker = true;
    }
  );
}
