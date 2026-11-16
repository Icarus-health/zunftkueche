// Vorjahresübernahme und CSV-Import von Artikeln und Lieferanten.
// Aus view.ts ausgelagert. Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import type { Article, Method, Supplier } from '../model';
import { validateEntity } from '../domain.ts';
import { columns, previewMasters } from '../csv.ts';
import type { ImportKind } from '../csv';
import { h, select, note, button, panel, empty } from '../markup.ts';
import type { KitchenView } from '../view';
import { uuid, message } from '../view-support.ts';
import type { ImportItem } from '../view-support';

export function copyList(app: KitchenView): string {
  const s = app.state!;
  const seasons = s.seasons.filter(x => x.value.id !== app.seasonId);
  if (!app.sourceSeason || !seasons.some(x => x.value.id === app.sourceSeason))
    app.sourceSeason = [...seasons].sort((a, b) => b.value.year - a.value.year)[0]?.value.id || '';
  const rows = s.orders.filter(
    o => o.value.seasonId === app.sourceSeason && o.value.area === app.area && o.value.status !== 'Storniert'
  );
  return panel(
    'Vorjahresbestellung wählen',
    `<div class="row">${select(
      'sourceSeason',
      'Ausgangssaison',
      seasons.map(s => [s.value.id, s.value.name]),
      app.sourceSeason
    )}${button('cancel', 'Zurück')}</div>${rows.length ? rows.map(o => `<div class="listrow"><div><strong>${h(o.value.supplierName)}</strong><p>${h(o.value.occasion || 'Ohne Anlass')} · ${h(o.value.status)} · ${o.value.lines.length} Positionen</p></div>${button('copy-pick', 'Positionen auswählen', o.value.id)}</div>`).join('') : empty('Für diese Ausgangssaison und diesen Bereich sind noch keine übernehmbaren Bestellungen erfasst.')}`
  );
}

export function importForm(app: KitchenView): string {
  const kind = app.importKind!;
  return `<form data-form="import" class="panel"><div class="row"><h1 class="form-title">${kind === 'articles' ? 'Artikel' : 'Lieferanten'} importieren</h1>${button('cancel', 'Zurück')}</div><p>Neue Datensätze ergänzen. Vorhandene Namen werden zur Prüfung gemeldet.</p>${button('template', 'CSV-Vorlage herunterladen', kind)}<label>CSV-Datei<input type="file" name="csvFile" accept=".csv,text/csv,text/plain" /></label>${note('csvText', 'Oder CSV-Text einfügen', app.importText ?? columns[kind].join(';') + '\n')}<div class="actions">${button('import-preview', 'Vorschau prüfen', '', true)}</div>${app.importErrors.length ? `<div role="alert">${app.importErrors.map(e => `<p>${h(e)}</p>`).join('')}</div>` : ''}${app.importItems ? `<h3>${app.importItems.length} Datensätze in der Vorschau</h3>${app.importItems.map(i => `<div class="listrow"><span>${h(i.value.name)}</span><span>${i.done ? 'Gespeichert' : 'Neu'}</span></div>`).join('')}<div class="actions">${button('import-apply', 'Geprüfte Datensätze übernehmen', '', true)}</div>` : ''}</form>`;
}

/** Vorjahresübernahme und CSV-Import. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function importAction(
  app: KitchenView,
  action: string,
  id: string,
  target?: HTMLElement
): Promise<boolean> {
  if (!app.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if (action === 'copy-list') {
    app.clearEditor();
    app.copyPicker = true;
    app.render();
    return true;
  }
  if (action === 'copy-pick') {
    const old = app.state.orders.find(o => o.value.id === id);
    app.clearEditor();
    app.copySource = old;
    app.render();
    return true;
  }
  if (action === 'import') {
    app.clearEditor();
    app.importKind = id as ImportKind;
    app.render();
    return true;
  }
  if (action === 'template') {
    download(app, columns[id as ImportKind].join(';') + '\r\n', 'Zunftkueche-' + id + '-Vorlage.csv');
    return true;
  }
  if (action === 'import-preview') {
    await previewImport(app);
    return true;
  }
  if (action === 'import-apply') {
    await applyImport(app);
    return true;
  }
  return false;
}

export function uniqueName(app: KitchenView, kind: 'articles' | 'suppliers', value: Article | Supplier): void {
  if (
    app.state![kind].some(
      r =>
        r.value.id !== value.id &&
        r.value.name.trim().toLocaleLowerCase('de-DE') === value.name.trim().toLocaleLowerCase('de-DE')
    )
  )
    throw new Error('Dieser Name ist bereits vorhanden. Bitte den vorhandenen Datensatz bearbeiten.');
}

export async function previewImport(app: KitchenView): Promise<void> {
  if (app.importStarted)
    throw new Error('Die laufende Übernahme bitte zuerst abschließen oder ausdrücklich schließen.');
  const kind = app.importKind!;
  const form = app.root.querySelector<HTMLFormElement>('form[data-form="import"]')!;
  const data = new FormData(form);
  const file = form.querySelector<HTMLInputElement>('input[type="file"]')!.files?.[0];
  const raw = file ? await file.text() : String(data.get('csvText') || '');
  // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
  app.importText = raw;
  const preview = previewMasters(
    kind,
    raw,
    app.state![kind].map(s => s.value.name)
  );
  const items: ImportItem[] = preview.rows.map(r => ({
    kind,
    value:
      kind === 'articles'
        ? { id: uuid(), name: r.Name, unit: r.Einheit, category: r.Kategorie || '', active: true }
        : {
            id: uuid(),
            name: r.Name,
            phone: r.Telefon || '',
            email: r['E-Mail'] || '',
            method: (r.Bestellweg || 'Telefon') as Method,
            customerNumber: r.Kundennummer || '',
            note: r.Hinweise || '',
            active: true
          },
    done: false
  }));
  for (const item of items)
    try {
      validateEntity(item.kind, item.value);
    } catch (e) {
      preview.errors.push(item.value.name + ': ' + message(e));
    }
  app.importItems = preview.errors.length ? undefined : items;
  app.importErrors = preview.errors;
  app.render();
}

export async function applyImport(app: KitchenView): Promise<void> {
  const items = app.importItems;
  if (!items?.length) return;
  app.importStarted = true;
  app.lock(true);
  try {
    for (const item of items) {
      if (item.done) continue;
      if (item.kind === 'articles')
        await app.store.saveMaster('articles', item.value as Article, undefined, item.value.id);
      else await app.store.saveMaster('suppliers', item.value as Supplier, undefined, item.value.id);
      item.done = true;
    }
    // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
    app.state = await app.store.load();
    // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
    if (app.store.ww && app.seasonId) app.state.ww = await app.store.ww.load(app.seasonId);
    app.clearEditor();
    app.error = '';
    app.info = items.length + ' Datensätze importiert und durch Lesen bestätigt.';
    app.render();
  } catch (e) {
    app.error =
      items.filter(i => i.done).length +
      ' Datensätze bereits bestätigt. ' +
      message(e) +
      ' Die Übernahme kann für die übrigen Datensätze erneut gestartet werden.';
    app.render();
  } finally {
    app.lock(false);
  }
}

export function download(app: KitchenView, text: string, name: string): void {
  const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
