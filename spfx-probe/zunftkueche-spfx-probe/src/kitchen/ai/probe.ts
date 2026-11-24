// KI-Probe: prüft auf dem Gerät, ob Foto, Diktat und der Weg zur KI gehen, und fährt den Messlauf über die Belege.
// Die Seite schreibt nichts nach SharePoint. Der Schlüssel bleibt im Browser dieses Geräts.
// Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import type { KitchenView } from '../view';
import { APP_VERSION } from '../release.ts';
import { h, button, select, field, euro } from '../markup.ts';
import { saveFile } from '../save-file.ts';
import { supportedInboxFile } from '../ww/inbox.ts';
import { AiError, DEFAULT_MODEL, PROVIDER_NAME, reachable } from './provider.ts';
import type { AiFile, Provider } from './provider';
import { costUsd, readBill } from './bill-reader.ts';
import type { BillRead } from './bill-reader';
import { fitPhoto } from './photo.ts';

export interface ProbeEntry {
  file: string;
  size: number;
  ok: boolean;
  error?: string;
  detail?: string;
  read?: BillRead;
}
export interface ProbeState {
  provider: Provider;
  model: string;
  key: string;
  remembered: boolean;
  file?: AiFile;
  /** Wie die Datei kam: Kamera oder Auswahl. */
  fileFrom: string;
  /** Was vor dem Senden mit dem Foto geschah, z. B. verkleinert. Sonst leer. */
  fileNote: string;
  dictation: string;
  reach: Partial<Record<Provider, { ok: boolean; detail: string }>>;
  busy: '' | 'reach' | 'read' | 'run';
  single?: ProbeEntry;
  run?: {
    season: string;
    year: number;
    total: number;
    current: string;
    entries: ProbeEntry[];
    stop: boolean;
    finished: boolean;
    note: string;
  };
  copied: boolean;
}
interface StoredAccess {
  provider: Provider;
  model: string;
  key: string;
}
const PROVIDERS: Provider[] = ['anthropic', 'openrouter', 'openrouter-eu'];
const isProvider = (value: unknown): value is Provider => PROVIDERS.includes(value as Provider);

function initial(app: KitchenView): ProbeState {
  const saved = app.local.read<StoredAccess>('ai');
  const provider = saved && isProvider(saved.provider) ? saved.provider : 'anthropic';
  return {
    provider,
    model: saved?.model || DEFAULT_MODEL[provider],
    key: saved?.key || '',
    remembered: !!saved?.key,
    fileFrom: '',
    fileNote: '',
    dictation: '',
    reach: {},
    busy: '',
    copied: false
  };
}

const size = (bytes: number): string =>
  bytes >= 1048576
    ? (bytes / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
const seconds = (ms: number): string => (ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' s';
const mark = (ok: boolean | undefined): string =>
  ok === undefined
    ? '<span class="probe-open">offen</span>'
    : ok
      ? '<span class="probe-ok">geht</span>'
      : '<span class="probe-bad">geht nicht</span>';

const keptWords = (remembered: boolean): string =>
  remembered ? 'Auf diesem Gerät gemerkt.' : 'Nicht gemerkt: nach dem Schließen der Seite ist der Schlüssel weg.';

/** Was die Rechenprüfung zu einem gelesenen Beleg sagt, in einem Satz. */
export function checkWords(read: BillRead): string {
  const c = read.check;
  const parts = [
    c.header ? 'Nummer und Datum da' : 'Nummer oder Datum fehlt',
    c.totals === 'ok'
      ? 'Netto + Steuer = Brutto'
      : c.totals === 'off'
        ? 'Summen passen nicht zusammen'
        : 'Summen unvollständig',
    !c.lines
      ? 'keine Positionen'
      : c.lineSumMatches === 'net'
        ? 'Zeilen ergeben das Netto'
        : c.lineSumMatches === 'gross'
          ? 'Zeilen ergeben das Brutto'
          : c.lineSumMatches === 'none'
            ? 'Zeilen ergeben die Summe nicht'
            : 'Zeilen unvollständig'
  ];
  return parts.join(' · ');
}
const verified = (read: BillRead): boolean =>
  read.check.header &&
  read.check.totals === 'ok' &&
  (read.check.lineSumMatches === 'net' || read.check.lineSumMatches === 'gross');

function entryView(entry: ProbeEntry): string {
  if (!entry.ok || !entry.read)
    return (
      '<p class="probe-bad" role="alert">' +
      h(entry.error || 'Fehler') +
      (entry.detail ? ' <small>(' + h(entry.detail) + ')</small>' : '') +
      '</p>'
    );
  const r = entry.read.reading,
    c = entry.read.check,
    cost = costUsd(entry.read.result.model, entry.read.result.usage);
  const rows = r.lines
    .slice(0, 60)
    .map(
      l =>
        '<tr><td>' +
        h(l.name) +
        '</td><td>' +
        h([l.quantity, l.unit].filter(Boolean).join(' ')) +
        '</td><td>' +
        h(l.unitPrice) +
        '</td><td>' +
        h(l.discount) +
        '</td><td>' +
        h(l.total) +
        '</td></tr>'
    )
    .join('');
  return (
    '<dl class="probe-facts"><div><dt>Lieferant</dt><dd>' +
    h(r.supplier || 'nicht gelesen') +
    '</dd></div><div><dt>Nummer</dt><dd>' +
    h(r.number || 'nicht gelesen') +
    '</dd></div><div><dt>Datum</dt><dd>' +
    h(r.date ? r.date.split('-').reverse().join('.') : 'nicht gelesen') +
    '</dd></div><div><dt>Netto, Steuer, Brutto</dt><dd>' +
    h([c.net, c.tax, c.gross].map(v => (v === null ? 'offen' : euro(v))).join(' · ')) +
    '</dd></div><div><dt>Positionen</dt><dd>' +
    c.lines +
    (c.lines ? ', davon ' + c.linesOk + ' nachgerechnet' : '') +
    '</dd></div><div><dt>Prüfung</dt><dd class="' +
    (verified(entry.read) ? 'probe-ok' : 'probe-bad') +
    '">' +
    h(checkWords(entry.read)) +
    '</dd></div><div><dt>Dauer und Kosten</dt><dd>' +
    h(seconds(entry.read.result.ms) + ' · ' + entry.read.result.model) +
    (cost === null
      ? ''
      : ' · rund ' + (cost * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' US-Cent') +
    '</dd></div></dl>' +
    (r.unreadable.length ? '<p class="muted">Nicht sicher lesbar: ' + h(r.unreadable.join('; ')) + '</p>' : '') +
    (rows
      ? '<details class="form-more"><summary>Gelesene Positionen ansehen</summary><div class="probe-scroll"><table class="probe-table"><thead><tr><th>Bezeichnung</th><th>Menge</th><th>Preis</th><th>Rabatt</th><th>Betrag</th></tr></thead><tbody>' +
        rows +
        '</tbody></table></div></details>'
      : '')
  );
}

/** Ergebnis der Probe als Text zum Weitergeben. Enthält keinen Schlüssel. */
export function probeSummary(app: KitchenView): string {
  const p = app.probe!;
  const agent = app.root.ownerDocument.defaultView?.navigator.userAgent || 'unbekannt';
  const reach = (provider: Provider): string => {
    const r = p.reach[provider];
    return PROVIDER_NAME[provider] + ': ' + (r ? r.detail : 'nicht geprüft');
  };
  const single = p.single
    ? p.single.ok && p.single.read
      ? 'ok (' +
        p.single.read.result.model +
        ', ' +
        seconds(p.single.read.result.ms) +
        ', ' +
        checkWords(p.single.read) +
        ', ' +
        p.single.read.check.lines +
        ' Positionen)'
      : 'Fehler: ' + (p.single.error || '') + (p.single.detail ? ' (' + p.single.detail + ')' : '')
    : 'nicht geprüft';
  return [
    'Zunftküche KI-Probe ' + APP_VERSION,
    'Gerät: ' + agent,
    'In Teams: ' + (/teams/i.test(agent) ? 'ja' : 'nein'),
    'Foto: ' +
      (p.file
        ? 'ok (' +
          [p.fileFrom, p.file.mediaType, size(p.file.bytes.length), p.fileNote].filter(Boolean).join(', ') +
          ')'
        : 'nicht geprüft'),
    'Diktat: ' + (p.dictation.trim().length >= 10 ? 'ok (' + p.dictation.trim().length + ' Zeichen)' : 'nicht geprüft'),
    'Verbindung ' + reach('anthropic'),
    'Verbindung ' + reach('openrouter'),
    'Verbindung ' + reach('openrouter-eu'),
    'Beleg lesen: ' + single,
    'Messlauf: ' +
      (p.run && p.run.finished
        ? p.run.entries.length +
          ' von ' +
          p.run.total +
          ' gelesen, ' +
          p.run.entries.filter(e => e.read && verified(e.read)).length +
          ' rechnerisch bestätigt (' +
          p.run.season +
          ', ' +
          (p.model || DEFAULT_MODEL[p.provider]) +
          ')' +
          (p.run.note ? ' ' + p.run.note : '')
        : 'nicht gelaufen')
  ].join('\n');
}

/** Seite „KI-Probe“ unter Einstellungen. */
export function probeView(app: KitchenView): string {
  const p = app.probe!;
  const season = app.season();
  const ready = !!p.key.trim() && !p.busy;
  const reachRows = PROVIDERS.map(
    provider =>
      '<li>' +
      h(PROVIDER_NAME[provider]) +
      ': ' +
      (p.reach[provider]
        ? mark(p.reach[provider]!.ok) + ' <small>' + h(p.reach[provider]!.detail) + '</small>'
        : mark(undefined)) +
      '</li>'
  ).join('');
  const run = p.run;
  const runRows = run
    ? run.entries
        .map(
          e =>
            '<tr><td>' +
            h(e.file) +
            '</td><td>' +
            h(e.read?.reading.number || '') +
            '</td><td>' +
            h(e.read?.check.gross === null || !e.read ? '' : euro(e.read.check.gross)) +
            '</td><td>' +
            (e.read ? e.read.check.lines : '') +
            '</td><td class="' +
            (e.read && verified(e.read) ? 'probe-ok' : 'probe-bad') +
            '">' +
            h(e.read ? checkWords(e.read) : e.error || 'Fehler') +
            '</td></tr>'
        )
        .join('')
    : '';
  const good = run ? run.entries.filter(e => e.read && verified(e.read)).length : 0;
  return (
    '<div class="probe" data-probe><div class="page-heading"><div><h1>KI-Probe</h1><p>Prüft, ob Foto, Diktat und der Weg zur KI auf diesem Gerät gehen. Nichts davon wird in SharePoint gespeichert.</p></div><div class="actions">' +
    button('cancel', 'Schließen') +
    '</div></div>' +
    '<section class="settings-section"><div class="settings-heading"><h2>1 Foto</h2><p>Auf dem Telefon sollte beim ersten Feld die Kamera aufgehen.</p></div><div class="settings-row"><div class="probe-fields">' +
    field('probePhoto', 'Foto aufnehmen', '', false, 'file', 'accept="image/*" capture="environment"') +
    field('probeFile', 'Oder Datei wählen (Foto, PDF)', '', false, 'file', 'accept="image/*,application/pdf"') +
    '<p role="status" data-probe-file>' +
    (p.file
      ? mark(true) +
        ' ' +
        h(
          [p.file.name, p.file.mediaType, size(p.file.bytes.length), p.fileFrom, p.fileNote].filter(Boolean).join(' · ')
        )
      : mark(undefined) + ' Noch keine Datei.') +
    '</p></div></div></section>' +
    '<section class="settings-section"><div class="settings-heading"><h2>2 Diktat</h2><p>Ins Feld tippen, dann das Mikrofon der Tastatur nehmen und einen Satz sprechen.</p></div><div class="settings-row"><div class="probe-fields"><label>Diktierfeld<textarea name="probeDictation" rows="3" maxlength="2000" placeholder="Zum Beispiel: Pils noch drei Kästen, Spezi ist leer">' +
    h(p.dictation) +
    '</textarea></label><p role="status" data-probe-dictation>' +
    dictationStatus(p.dictation) +
    '</p></div></div></section>' +
    '<section class="settings-section"><div class="settings-heading"><h2>3 Verbindung</h2><p>Prüft ohne Schlüssel, ob dieses Gerät die Anbieter erreicht.</p></div><div class="settings-row"><div><ul class="probe-list">' +
    reachRows +
    '</ul></div>' +
    button('probe-reach', p.busy === 'reach' ? 'Prüfe …' : 'Verbindung prüfen') +
    '</div></section>' +
    '<section class="settings-section"><div class="settings-heading"><h2>4 Zugang zur KI</h2><p>Der Schlüssel bleibt im Browser dieses Geräts. Bitte einen Schlüssel mit kleinem Guthaben oder Limit nehmen.</p></div><div class="settings-row"><div class="probe-fields">' +
    select(
      'probeProvider',
      'Anbieter',
      PROVIDERS.map(provider => [provider, PROVIDER_NAME[provider]] as [string, string]),
      p.provider
    ) +
    field('probeModel', 'Modell', p.model, false, 'text', 'spellcheck="false" autocapitalize="off"') +
    field('probeKey', 'Schlüssel', p.key, false, 'password', 'spellcheck="false" autocapitalize="off"') +
    '<p class="muted" data-probe-kept>' +
    keptWords(p.remembered) +
    '</p></div><div class="actions">' +
    button('probe-remember', 'Auf diesem Gerät merken') +
    button('probe-forget', 'Schlüssel löschen') +
    '</div></div></section>' +
    '<section class="settings-section"><div class="settings-heading"><h2>5 Einen Beleg lesen</h2><p>Schickt die Datei aus Schritt 1 an das gewählte Modell und rechnet das Ergebnis nach.</p></div><div class="settings-row"><div class="probe-result">' +
    (p.busy === 'read'
      ? '<p role="status">Beleg wird gelesen …</p>'
      : p.single
        ? entryView(p.single)
        : '<p class="muted">Noch nichts gelesen.</p>') +
    '</div>' +
    '<button type="button" data-action="probe-read" data-id=""' +
    (ready && p.file ? '' : ' disabled') +
    '>Datei lesen lassen</button></div></section>' +
    '<section class="settings-section"><div class="settings-heading"><h2>6 Messlauf</h2><p>Schickt alle PDF im Rechnungsordner der gewählten Saison an das gewählte Modell. Am Rechner ausführen. Für die Belege von 2026 oben die Saison Fasnet 2026 wählen. Die Ergebnisdatei geht danach an Claude zum Auswerten.</p></div><div class="settings-row"><div class="probe-result"><p>' +
    (season
      ? 'Saison: ' + h(season.name) + ' · Ordner 03_Rechnungen/' + season.year
      : 'Bitte oben eine Saison wählen.') +
    '</p>' +
    (run
      ? '<p role="status">' +
        h(
          run.finished
            ? run.entries.length +
                ' von ' +
                run.total +
                ' gelesen, ' +
                good +
                ' davon rechnerisch bestätigt.' +
                (run.note ? ' ' + run.note : '')
            : 'Lese ' + (run.entries.length + 1) + ' von ' + run.total + ': ' + run.current
        ) +
        '</p>' +
        (runRows
          ? '<div class="probe-scroll"><table class="probe-table"><thead><tr><th>Datei</th><th>Nummer</th><th>Brutto</th><th>Pos.</th><th>Prüfung</th></tr></thead><tbody>' +
            runRows +
            '</tbody></table></div>'
          : '')
      : '') +
    '</div><div class="actions">' +
    (p.busy === 'run'
      ? button('probe-stop', 'Abbrechen')
      : '<button type="button" data-action="probe-run" data-id=""' +
        (ready && season ? '' : ' disabled') +
        '>Messlauf starten</button>') +
    (run && run.entries.length && p.busy !== 'run'
      ? button('probe-download', 'Ergebnis herunterladen', '', true)
      : '') +
    '</div></div></section>' +
    '<section class="settings-section"><div class="settings-heading"><h2>Ergebnis der Probe</h2><p>Diesen Text an Claude weitergeben. Er enthält keinen Schlüssel.</p></div><div class="settings-row"><div class="probe-fields"><label>Ergebnis<textarea name="probeSummary" rows="9" readonly>' +
    h(probeSummary(app)) +
    '</textarea></label></div>' +
    button('probe-copy', p.copied ? 'Kopiert' : 'Ergebnis kopieren') +
    '</div></section></div>'
  );
}
function dictationStatus(text: string): string {
  const length = text.trim().length;
  return length >= 10 ? mark(true) + ' ' + length + ' Zeichen angekommen.' : mark(undefined) + ' Noch kein Text.';
}

/** Liest Anbieter, Modell und Schlüssel aus den Feldern, bevor neu gezeichnet wird. */
export function probeFields(app: KitchenView): void {
  const p = app.probe;
  if (!p) return;
  const value = (name: string): string | undefined =>
    app.root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      '[data-probe] [name=' + name + ']'
    )?.value;
  const provider = value('probeProvider');
  if (isProvider(provider)) p.provider = provider;
  p.model = (value('probeModel') ?? p.model).trim();
  p.key = (value('probeKey') ?? p.key).trim();
  p.dictation = value('probeDictation') ?? p.dictation;
}

/** Tippen und Diktieren auf der Probe-Seite: Status aktualisieren, ohne die Seite neu zu zeichnen. */
export function probeInput(app: KitchenView, target: HTMLInputElement | HTMLTextAreaElement): void {
  const p = app.probe;
  if (!p) return;
  if (target.name === 'probeDictation') {
    p.dictation = target.value;
    const status = app.root.querySelector<HTMLElement>('[data-probe-dictation]');
    if (status) status.innerHTML = dictationStatus(p.dictation);
  }
  if (target.name === 'probeKey') {
    // Die Knöpfe folgen dem Schlüssel sofort. Neu gezeichnet wird nicht, sonst verliert das Feld den Cursor.
    p.key = target.value.trim();
    p.remembered = false;
    const ready = !!p.key && !p.busy;
    const set = (action: string, on: boolean): void => {
      const control = app.root.querySelector<HTMLButtonElement>('[data-probe] [data-action=' + action + ']');
      if (control) control.disabled = !on;
    };
    set('probe-read', ready && !!p.file);
    set('probe-run', ready && !!app.season());
    const kept = app.root.querySelector<HTMLElement>('[data-probe-kept]');
    if (kept) kept.textContent = keptWords(false);
  }
}

/** Datei gewählt oder Anbieter gewechselt. */
export async function probeChange(app: KitchenView, target: HTMLInputElement | HTMLSelectElement): Promise<void> {
  const p = app.probe;
  if (!p) return;
  if (target.name === 'probeProvider' && isProvider(target.value)) {
    probeFields(app);
    // Das Modell folgt dem Anbieter, solange niemand ein eigenes eingetragen hat.
    if (!p.model || Object.values(DEFAULT_MODEL).includes(p.model)) p.model = DEFAULT_MODEL[target.value];
    p.remembered = false;
    app.render();
    return;
  }
  if (target.name !== 'probePhoto' && target.name !== 'probeFile') return;
  const file = (target as HTMLInputElement).files?.[0];
  if (!file) return;
  probeFields(app);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fit = await fitPhoto(
    {
      name: file.name || (target.name === 'probePhoto' ? 'foto.jpg' : 'datei'),
      mediaType: file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'image/jpeg'),
      bytes
    },
    app.root.ownerDocument
  );
  if (app.probe !== p) return;
  p.file = fit.file;
  p.fileNote = fit.note;
  p.fileFrom = target.name === 'probePhoto' ? 'Kamera' : 'Auswahl';
  p.single = undefined;
  app.render();
}

function entryFor(file: AiFile, error: unknown): ProbeEntry {
  return {
    file: file.name,
    size: file.bytes.length,
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    detail: error instanceof AiError ? error.detail : ''
  };
}

/** Aktionen der Probe-Seite. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function probeAction(app: KitchenView, action: string): Promise<boolean> {
  if (!action.startsWith('probe-')) return false;
  if (action === 'probe-open') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'management';
    app.probe = initial(app);
    app.render();
    return true;
  }
  const p = app.probe;
  if (!p) return true;
  probeFields(app);
  const access = { provider: p.provider, key: p.key, model: p.model || DEFAULT_MODEL[p.provider] };
  if (action === 'probe-stop') {
    if (p.run) p.run.stop = true;
    return true;
  }
  if (action === 'probe-remember') {
    if (!p.key) throw new Error('Bitte zuerst den Schlüssel eintragen.');
    p.remembered = app.local.write('ai', { provider: p.provider, model: access.model, key: p.key });
    if (!p.remembered)
      throw new Error('Dieser Browser lässt das Merken nicht zu. Der Schlüssel gilt, bis die Seite geschlossen wird.');
    app.render();
    return true;
  }
  if (action === 'probe-forget') {
    app.local.remove('ai');
    p.key = '';
    p.remembered = false;
    app.render();
    return true;
  }
  if (action === 'probe-copy') {
    const summary = probeSummary(app);
    try {
      await app.root.ownerDocument.defaultView?.navigator.clipboard?.writeText(summary);
      p.copied = true;
    } catch {
      p.copied = false;
    }
    app.render();
    if (!p.copied) {
      const box = app.root.querySelector<HTMLTextAreaElement>('[data-probe] [name=probeSummary]');
      box?.focus();
      box?.select();
    }
    return true;
  }
  if (action === 'probe-download') {
    if (!p.run) return true;
    const payload = {
      app: APP_VERSION,
      at: new Date().toISOString(),
      provider: p.provider,
      model: access.model,
      season: p.run.season,
      year: p.run.year,
      entries: p.run.entries.map(e => ({
        file: e.file,
        size: e.size,
        ok: e.ok,
        error: e.error || '',
        detail: e.detail || '',
        result: e.read?.result,
        reading: e.read?.reading,
        check: e.read?.check
      }))
    };
    saveFile(
      'zunftkueche-messlauf-' + access.model.replace(/[^a-z0-9.-]+/gi, '-') + '.json',
      new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }),
      app.root.ownerDocument
    );
    return true;
  }
  if (p.busy) return true;
  if (action === 'probe-reach') {
    p.busy = 'reach';
    app.render();
    try {
      for (const provider of PROVIDERS) p.reach[provider] = await reachable(provider);
    } finally {
      p.busy = '';
      if (app.probe === p) app.render();
    }
    return true;
  }
  if (action === 'probe-read') {
    const file = p.file;
    if (!file) throw new Error('Bitte zuerst in Schritt 1 eine Datei wählen.');
    p.busy = 'read';
    app.render();
    try {
      p.single = { file: file.name, size: file.bytes.length, ok: true, read: await readBill(access, file) };
    } catch (error) {
      p.single = entryFor(file, error);
    } finally {
      p.busy = '';
      if (app.probe === p) app.render();
    }
    return true;
  }
  if (action === 'probe-run') {
    const season = app.season(),
      inbox = app.store.inbox;
    if (!season || !inbox) throw new Error('Bitte zuerst eine Saison wählen.');
    p.busy = 'run';
    p.run = {
      season: season.name,
      year: season.year,
      total: 0,
      current: 'Ordner wird gelesen',
      entries: [],
      stop: false,
      finished: false,
      note: ''
    };
    app.render();
    const run = p.run;
    try {
      const folder = await inbox.list('bill', season.year);
      const files = folder.files
        .filter(f => supportedInboxFile('bill', f))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));
      run.total = files.length;
      if (!folder.exists || !files.length)
        run.note = 'Im Ordner liegen keine PDF. Für ein anderes Jahr oben die Saison umstellen.';
      for (const f of files) {
        if (run.stop || app.probe !== p) break;
        run.current = f.name;
        app.render();
        const file: AiFile = { name: f.name, mediaType: 'application/pdf', bytes: new Uint8Array() };
        try {
          file.bytes = await inbox.read('bill', season.year, f);
          run.entries.push({ file: f.name, size: f.size, ok: true, read: await readBill(access, file) });
        } catch (error) {
          run.entries.push({ ...entryFor(file, error), size: f.size });
          // Ohne gültigen Schlüssel oder Guthaben hat der Rest keinen Sinn.
          if (error instanceof AiError && (error.kind === 'key' || error.kind === 'credit')) {
            run.note = 'Abgebrochen: ' + error.message;
            break;
          }
        }
      }
      if (run.stop) run.note = 'Abgebrochen.';
    } catch (error) {
      run.note = error instanceof Error ? error.message : String(error);
    } finally {
      run.finished = true;
      p.busy = '';
      if (app.probe === p) app.render();
    }
    return true;
  }
  return true;
}
