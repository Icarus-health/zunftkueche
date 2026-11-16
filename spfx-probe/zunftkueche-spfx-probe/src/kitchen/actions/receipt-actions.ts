// Warenannahme und Lieferscheine.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import { fieldNumber } from '../field-errors.ts';
import { deliveryRemaining } from '../supplier-orders.ts';
import type { DeliveryNote, Receipt } from '../model';
import { parseDecimal } from '../domain.ts';
import { n } from '../markup.ts';
import { deliveryState, receivedQuantity, validateReceipt } from '../operations.ts';
import { receiptProgress } from '../operation-forms.ts';
import { slipExtension, slipFileLimit } from '../delivery-slip.ts';
import type { SlipFile } from '../delivery-slip';
import type { KitchenView } from '../view';
import { uuid } from '../view-support.ts';

/** Warenannahme: Fortschritt, Haken bei vollständiger Menge und Hinweis auf einen offenen Rest. */
export function updateReceiptProgress(app: KitchenView): void {
  const form = app.root.querySelector<HTMLFormElement>('form[data-form="receipt"]');
  if (!form) return;
  const lines = Array.from(form.querySelectorAll<HTMLElement>('[data-receipt-line]'));
  let filled = 0;
  for (const line of lines) {
    const input = line.querySelector<HTMLInputElement>('input'),
      rest = line.querySelector<HTMLElement>('[data-receipt-rest]'),
      expected = Number(line.dataset.expected);
    let value: number | null = null;
    try {
      value = parseDecimal(input?.value || '');
    } catch {
      value = null;
    }
    const entered = value !== null && value > 0;
    if (entered) filled++;
    line.dataset.state = !entered ? 'open' : value! >= expected ? 'complete' : 'partial';
    if (rest) {
      rest.hidden = line.dataset.state !== 'partial';
      rest.textContent = rest.hidden ? '' : n(Math.round((expected - value!) * 10000) / 10000) + ' bleiben offen';
    }
  }
  const progress = form.querySelector('[data-receipt-progress]');
  if (progress) progress.textContent = receiptProgress(filled, lines.length);
}

/** Warenannahme. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function receiptAction(
  app: KitchenView,
  action: string,
  id: string,
  target?: HTMLElement
): Promise<boolean> {
  if (!app.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if (action === 'receipt-new') {
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    const [orderId, deliveryId] = id.split('|');
    const previous = app.state.orders.find(o => o.value.id === orderId);
    if (!previous || previous.value.status !== 'Bestellt' || deliveryState(previous.value) === 'Vollständig geliefert')
      throw new Error('Für diese Bestellung ist keine Lieferannahme offen.');
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'orders';
    app.receiving = { previous, id: uuid(), deliveryId: deliveryId || previous.value.deliveries?.[0]?.id };
    app.render();
    return true;
  }
  if (action === 'receipt-missing') {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form=receipt]');
    const entry = app.receiving;
    if (!form || !entry) throw new Error('Bitte zuerst eine Lieferung öffnen.');
    if (form.querySelector<HTMLInputElement>('[name=deliverySlipFile]')?.files?.length)
      throw new Error('Bitte die ausgewählte Datei entfernen, bevor ihr eine ausgefallene Lieferung vermerkt.');
    const data = new FormData(form);
    if (
      entry.previous.value.lines.some(
        l =>
          parseDecimal(String(data.get('received_' + l.id) || '')) !== null &&
          parseDecimal(String(data.get('received_' + l.id) || '')) !== 0
      )
    )
      throw new Error(
        'Es sind Liefermengen eingetragen. Bitte diese als Wareneingang bestätigen oder die Mengen entfernen.'
      );
    const note = String(data.get('note') || '').trim();
    if (!note) throw new Error('Bitte einen kurzen Hinweis zur ausgefallenen Lieferung eingeben.');
    const date = new Date(String(data.get('receivedAt')));
    if (!Number.isFinite(date.getTime())) throw new Error('Bitte den Zeitpunkt prüfen.');
    const value: DeliveryNote = {
      id: entry.id,
      ...(entry.deliveryId ? { deliveryId: entry.deliveryId } : {}),
      recordedAt: date.toISOString(),
      recordedBy: app.user,
      note
    };
    await app.run(
      () => app.store.saveDeliveryNote(entry.previous, value, app.operationId),
      'Ausgefallene Lieferung vermerkt. Die Mengen bleiben offen.',
      () => {
        app.selectedOrder = entry.previous.value.id;
        app.view = 'orders';
      }
    );
    return true;
  }
  if (action === 'receipt-all') {
    const form = app.root.querySelector<HTMLFormElement>('form[data-form=receipt]');
    if (form && app.receiving) {
      const o = app.receiving.previous.value;
      for (const l of o.lines) {
        const input = form.querySelector<HTMLInputElement>('[name=received_' + l.id + ']');
        if (input)
          input.value = n(
            o.deliveries
              ? deliveryRemaining(o, l.id, app.receiving.deliveryId!)
              : Math.max(0, (l.quantity || 0) - receivedQuantity(o, l.id))
          );
      }
      app.dirty = true;
      app.rememberDraft();
      updateReceiptProgress(app);
      app.info = 'Mengen eingetragen. Bitte prüfen und bei Bedarf ändern; noch nicht gespeichert. ' + app.info;
      app.paintStatus();
    }
    return true;
  }
  return false;
}

export async function readSlip(app: KitchenView, form: HTMLFormElement): Promise<SlipFile | undefined> {
  const file = form.querySelector<HTMLInputElement>('[name=deliverySlipFile]')?.files?.[0];
  if (!file) return undefined;
  if (file.size > slipFileLimit) throw new Error('Der Lieferschein darf höchstens 8 MB groß sein.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  slipExtension(bytes);
  return { name: file.name, bytes };
}

export async function saveSlip(app: KitchenView, form: HTMLFormElement): Promise<void> {
  const order = app.state!.orders.find(row => row.value.id === app.selectedOrder)?.value;
  if (!order || !app.writable() || order.seasonId !== app.seasonId || order.area !== app.area)
    throw new Error('Bestellung bitte erneut öffnen.');
  const deliveryId = String(new FormData(form).get('slipDelivery') || '') || undefined;
  const file = await readSlip(app, form);
  if (!file) throw new Error('Bitte zuerst eine Lieferscheindatei auswählen.');
  await app.run(
    () => app.store.saveDeliverySlip(order.id, deliveryId, file, app.user),
    'Lieferschein gespeichert.',
    () => {
      app.selectedOrder = order.id;
    }
  );
}

export async function saveReceipt(app: KitchenView, form: HTMLFormElement): Promise<void> {
  const entry = app.receiving!,
    data = new FormData(form);
  const receipt: Receipt = {
    ...(entry.deliveryId ? { deliveryId: entry.deliveryId } : {}),
    id: entry.id,
    receivedAt: new Date(String(data.get('receivedAt'))).toISOString(),
    receivedBy: app.user,
    note: [String(data.get('deviation') || ''), String(data.get('note') || '').trim()].filter(Boolean).join(' · '),
    lines: entry.previous.value.lines.flatMap(l => {
      const maximum = entry.previous.value.deliveries
        ? deliveryRemaining(entry.previous.value, l.id, entry.deliveryId!)
        : Math.max(0, (l.quantity || 0) - receivedQuantity(entry.previous.value, l.id));
      const quantity = fieldNumber(form, 'received_' + l.id, { maximum });
      return quantity !== null && quantity > 0 ? [{ lineId: l.id, quantity }] : [];
    })
  };
  validateReceipt(entry.previous.value, receipt);
  const operationId = app.operationId,
    file = await readSlip(app, form);
  await app.run(
    async () => {
      if (file) await app.store.saveDeliverySlip(entry.previous.value.id, entry.deliveryId, file, app.user);
      await app.store.saveReceipt(entry.previous, receipt, operationId);
    },
    file ? 'Wareneingang und Lieferschein gespeichert.' : 'Wareneingang gespeichert.',
    () => {
      app.selectedOrder = entry.previous.value.id;
      app.view = 'orders';
    }
  );
}
