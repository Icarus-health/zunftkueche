/* eslint-disable @rushstack/no-new-null -- Leere Mengen bleiben ausdrücklich unbekannt, wie im Datenmodell. */
// Eingang: diktieren, tippen oder fotografieren. Die KI schlägt vor, die App prüft, ein Mensch bestätigt.
// Gespeichert wird erst nach „Speichern“ auf der Karte, und nur über die vorhandenen Wege (Bestandsmeldung, Bestellentwurf).
// Erster Parameter `app` ist immer die Ansicht, die Zustand und Dienste hält.
import type { KitchenView } from '../view';
import type { Stored } from '../model';
import type { AiSettings } from '../sharepoint';
import { h, button, select, field, n } from '../markup.ts';
import { parseDecimal } from '../domain.ts';
import { countQuantity } from '../operations.ts';
import { unitName } from '../units.ts';
import { uuid } from '../view-support.ts';
import { AiError, DEFAULT_MODEL, PROVIDER_NAME } from '../ai/provider.ts';
import type { AiFile, Provider } from '../ai/provider';
import { fitPhoto } from '../ai/photo.ts';
import { readIntake } from '../ai/intake.ts';
import type { IntakeArticle, IntakeContext, IntakeLine } from '../ai/intake';
import { buildCounts, buildOrders, intakeContext, reorderMessage } from '../intake-records.ts';
import type { ConfirmedLine } from '../intake-records';

/** Eine Zeile der Karte, so wie sie im Formular steht. */
export interface IntakeEntry {
  id: string;
  kind: 'count' | 'reorder';
  spoken: string;
  articleId: string;
  candidates: string[];
  offerId: string;
  packs: string;
  loose: string;
  reorder: boolean;
  day: string;
  flags: string[];
  checked: boolean;
}
export interface IntakeCard {
  /** Kennung des Speichervorgangs: ein zweiter Versuch legt nichts doppelt an. */
  opId: string;
  entries: IntakeEntry[];
  status: 'open' | 'saved' | 'discarded';
  saved?: { counts: number; lines: string[]; orders: Array<{ id: string; supplier: string; text: string }> };
  copied?: number;
}
export interface IntakeTurn {
  id: string;
  text: string;
  photo: string;
  card?: IntakeCard;
  notes: string[];
  error?: string;
  detail?: string;
}
export interface IntakeState {
  turns: IntakeTurn[];
  text: string;
  photo?: AiFile;
  photoInfo: string;
  busy: boolean;
}
export interface AiSetupState {
  provider: Provider;
  model: string;
  busy: boolean;
  test?: { ok: boolean; text: string; detail?: string };
}
/** Was die Ansicht über die KI weiß. Der Schlüssel selbst wird nie gezeichnet. */
export interface AiStatus {
  /** Liste „Einstellungen“ ist angelegt. */
  ready: boolean;
  row?: Stored<AiSettings>;
  /** Diese Person darf einrichten (Besitzer der Seite). */
  manager: boolean;
}

const PROVIDERS: Provider[] = ['anthropic', 'openrouter', 'openrouter-eu'];
const isProvider = (value: unknown): value is Provider => PROVIDERS.includes(value as Provider);
const today = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const num = (value: number | undefined): string => (value === undefined ? '' : String(value).replace('.', ','));

/** Lädt einmal, ob die KI eingerichtet ist und ob diese Person einrichten darf. Fehler machen die App nicht unbenutzbar. */
export async function loadAi(app: KitchenView, force = false): Promise<AiStatus> {
  if (app.ai && !force) return app.ai;
  let ready = false,
    row: Stored<AiSettings> | undefined;
  try {
    const settings = await app.store.aiSettings();
    ready = settings.ready;
    row = settings.row;
  } catch {
    /* Ohne lesbare Einstellungen bleibt der Eingang zu. */
  }
  let manager = app.managerHint;
  if (!manager)
    try {
      manager = await app.store.canManage();
    } catch {
      manager = false;
    }
  const status: AiStatus = { ready, row, manager };
  // Zwei gleichzeitige Abfragen liefern dasselbe: die spätere Antwort darf die frühere ersetzen.
  // eslint-disable-next-line require-atomic-updates
  app.ai = status;
  return status;
}

/** Hinweis auf der Übersicht. Helfer sehen den Eingang erst, wenn er eingerichtet ist. */
export function intakeEntry(app: KitchenView): string {
  const ai = app.ai;
  if (!ai || (!ai.row && !ai.manager)) return '';
  return (
    '<section class="intake-entry" aria-label="Eingang"><div><h2>Eingang</h2><p>' +
    (ai.row
      ? 'Bestand und Nachbestellung diktieren, tippen oder fotografieren. Ihr prüft, dann wird gespeichert.'
      : 'Noch nicht eingerichtet: es fehlt der Zugang zur KI.') +
    '</p></div>' +
    (ai.row ? button('intake-open', 'Eingang öffnen', '', true) : button('ai-setup', 'KI einrichten')) +
    '</section>'
  );
}

/** Abschnitt in den Einstellungen. Nur für Besitzer der Seite. */
export function aiSettingsSection(app: KitchenView): string {
  const ai = app.ai;
  if (!ai?.manager) return '';
  return (
    '<section class="settings-section"><div class="settings-heading"><h2>KI für den Eingang</h2><p>Nur Besitzer der Seite sehen diesen Abschnitt.</p></div><div class="settings-row"><div><strong>Zugang zur KI</strong><p>' +
    (ai.row
      ? h(PROVIDER_NAME[ai.row.value.provider] + ' · ' + ai.row.value.model) +
        ' · Schlüssel endet auf ' +
        h(ai.row.value.key.slice(-4)) +
        ' · zuletzt geändert von ' +
        h(ai.row.value.updatedBy.split(' · ')[0])
      : 'Noch nicht eingerichtet. Ohne Zugang bleibt der Eingang für alle verborgen.') +
    '</p></div>' +
    button('ai-setup', ai.row ? 'Zugang ändern' : 'KI einrichten') +
    '</div></section>'
  );
}

function articleOf(context: IntakeContext, id: string): IntakeArticle | undefined {
  return context.articles.find(a => a.id === id);
}
/** Gebinde, in denen gezählt werden kann: nur solche mit mehr als einem Stück, jede Größe einmal. */
function countPacks(article: IntakeArticle | undefined): IntakeArticle['packs'] {
  const seen = new Set<string>();
  return (article?.packs || []).filter(p => {
    const key = p.packName.toLowerCase() + '|' + p.packSize;
    if (p.packSize === 1 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function totalText(entry: IntakeEntry, context: IntakeContext): string {
  const article = articleOf(context, entry.articleId);
  if (!article) return '';
  const pack = countPacks(article).find(p => p.offerId === entry.offerId);
  try {
    const total = countQuantity(
      pack ? parseDecimal(entry.packs) : null,
      parseDecimal(entry.loose),
      pack ? pack.packSize : 1
    );
    return total === null ? 'Menge fehlt' : 'Zusammen ' + n(total) + ' ' + unitName(article.unit, total);
  } catch (error) {
    return error instanceof Error ? error.message : 'Menge bitte prüfen';
  }
}

function entryView(turn: IntakeTurn, entry: IntakeEntry, context: IntakeContext): string {
  const article = articleOf(context, entry.articleId);
  const first = entry.candidates.map(id => articleOf(context, id)).filter((a): a is IntakeArticle => !!a);
  const rest = context.articles.filter(a => !entry.candidates.includes(a.id));
  const option = (a: IntakeArticle): string =>
    '<option value="' + h(a.id) + '"' + (a.id === entry.articleId ? ' selected' : '') + '>' + h(a.name) + '</option>';
  const options =
    '<option value=""' +
    (entry.articleId ? '' : ' selected') +
    '>Bitte wählen</option>' +
    (first.length ? '<optgroup label="Passt zur Meldung">' + first.map(option).join('') + '</optgroup>' : '') +
    '<optgroup label="Alle Artikel">' +
    rest.map(option).join('') +
    '</optgroup>';
  const key = entry.id;
  const unit = article ? unitName(article.unit, 2) : 'Stück';
  let fields: string,
    foot = '';
  if (entry.kind === 'count') {
    const packs = countPacks(article);
    const pack = packs.find(p => p.offerId === entry.offerId);
    fields =
      (packs.length
        ? select(
            'o:' + key,
            'Zählen in',
            [['', 'Einzeln'] as [string, string], ...packs.map(p => [p.offerId, p.packName] as [string, string])],
            pack ? pack.offerId : ''
          )
        : '') +
      (pack
        ? field('p:' + key, 'Volle ' + pack.packName.split(' ')[0], entry.packs, false, 'text', 'inputmode="numeric"')
        : '') +
      field(
        'l:' + key,
        pack ? 'Dazu einzeln (' + unit + ')' : 'Menge (' + unit + ')',
        entry.loose,
        false,
        'text',
        'inputmode="decimal"'
      );
    foot =
      '<p class="intake-total" data-total="' +
      h(key) +
      '">' +
      h(totalText(entry, context)) +
      '</p><label class="check"><input type="checkbox" name="r:' +
      h(key) +
      '"' +
      (entry.reorder ? ' checked' : '') +
      ' />Nachbestellen vormerken</label>';
  } else {
    const offers = article?.packs || [];
    fields =
      select(
        'o:' + key,
        'Lieferant und Gebinde',
        [
          ['', 'Bitte wählen'] as [string, string],
          ...offers.map(p => [p.offerId, p.supplier + ' · ' + p.packName] as [string, string])
        ],
        offers.some(p => p.offerId === entry.offerId) ? entry.offerId : ''
      ) +
      field('p:' + key, 'Menge (Gebinde)', entry.packs, false, 'text', 'inputmode="numeric"') +
      field('d:' + key, 'Liefertag', entry.day, false, 'date', 'min="' + today() + '"');
  }
  return (
    '<fieldset class="intake-line' +
    (entry.flags.length ? ' flagged' : '') +
    '" data-entry="' +
    h(key) +
    '"><legend>„' +
    h(entry.spoken || 'ohne Wortlaut') +
    '“</legend><div class="intake-fields"><label>Artikel<select name="a:' +
    h(key) +
    '">' +
    options +
    '</select></label>' +
    fields +
    '</div>' +
    (entry.flags.length
      ? '<ul class="intake-flags">' +
        entry.flags.map(f => '<li>' + h(f) + '</li>').join('') +
        '</ul><label class="check"><input type="checkbox" name="c:' +
        h(key) +
        '"' +
        (entry.checked ? ' checked' : '') +
        ' />Geprüft, stimmt so</label>'
      : '') +
    '<div class="intake-foot">' +
    foot +
    button('intake-remove', 'Zeile entfernen', turn.id + '|' + key) +
    '</div></fieldset>'
  );
}

const openText = (open: number): string =>
  open
    ? open + (open === 1 ? ' Zeile braucht' : ' Zeilen brauchen') + ' noch euren Blick: prüfen und abhaken.'
    : 'Bitte Artikel und Mengen ansehen. Gespeichert wird erst mit „Speichern“.';
function canShare(app: KitchenView): boolean {
  return typeof app.root.ownerDocument.defaultView?.navigator.share === 'function';
}

function cardView(app: KitchenView, turn: IntakeTurn, context: IntakeContext): string {
  const card = turn.card!;
  if (card.status === 'discarded') return '<p class="muted">Verworfen. Nichts gespeichert.</p>';
  if (card.status === 'saved' && card.saved) {
    const parts = [
      card.saved.counts
        ? card.saved.counts + (card.saved.counts === 1 ? ' Bestandsmeldung' : ' Bestandsmeldungen')
        : '',
      card.saved.orders.length
        ? card.saved.orders.length + (card.saved.orders.length === 1 ? ' Bestellentwurf' : ' Bestellentwürfe')
        : ''
    ].filter(Boolean);
    return (
      '<div class="intake-done"><p class="intake-ok">Gespeichert: ' +
      h(parts.join(' und ')) +
      '.</p>' +
      (card.saved.lines.length
        ? '<ul class="intake-saved">' + card.saved.lines.map(l => '<li>' + h(l) + '</li>').join('') + '</ul>'
        : '') +
      card.saved.orders
        .map(
          (o, i) =>
            '<section class="intake-message"><h3>Text für ' +
            h(o.supplier) +
            '</h3><p class="muted">Für Anruf oder Nachricht. Die Bestellung steht als Entwurf unter Bestellungen und gilt erst als aufgegeben, wenn ihr sie dort so markiert.</p><pre>' +
            h(o.text) +
            '</pre><div class="actions">' +
            button('intake-copy', card.copied === i ? 'Kopiert' : 'Text kopieren', turn.id + '|' + i, 'tinted') +
            (canShare(app) ? button('intake-share', 'Teilen', turn.id + '|' + i) : '') +
            button('order-open', 'Bestellung öffnen', o.id) +
            '</div></section>'
        )
        .join('') +
      '</div>'
    );
  }
  const counts = card.entries.filter(e => e.kind === 'count'),
    orders = card.entries.filter(e => e.kind === 'reorder');
  const open = card.entries.filter(e => e.flags.length && !e.checked).length;
  return (
    '<div class="intake-card" data-turn="' +
    h(turn.id) +
    '">' +
    (counts.length ? '<h3>Bestand melden</h3>' + counts.map(e => entryView(turn, e, context)).join('') : '') +
    (orders.length ? '<h3>Nachbestellen</h3>' + orders.map(e => entryView(turn, e, context)).join('') : '') +
    '<p class="intake-open" data-open role="status">' +
    openText(open) +
    '</p><div class="actions">' +
    button('intake-save', 'Speichern', turn.id, true) +
    button('intake-discard', 'Verwerfen', turn.id) +
    '</div></div>'
  );
}

/** Seite „Eingang“. */
export function intakeView(app: KitchenView): string {
  const state = app.intake!,
    ai = app.ai;
  const context = intakeContext(app.state!, app.seasonId, app.area, today());
  const head =
    '<div class="intake" data-intake><div class="page-heading"><div><h1>Eingang</h1><p>Sagen oder schreiben, was da ist und was fehlt. Die App schlägt vor, ihr prüft, erst dann wird gespeichert.</p></div><div class="actions">' +
    button('cancel', 'Schließen') +
    '</div></div>';
  if (!ai?.row)
    return (
      head +
      '<section class="panel"><p>' +
      (ai?.manager
        ? 'Der Zugang zur KI fehlt noch.'
        : 'Der Eingang ist noch nicht eingerichtet. Das macht ein Besitzer der Seite unter Einstellungen.') +
      '</p>' +
      (ai?.manager ? button('ai-setup', 'KI einrichten', '', true) : '') +
      '</section></div>'
    );
  if (!app.writable())
    return (
      head +
      '<section class="panel"><p>Diese Saison ist archiviert. Bitte oben eine aktive Saison wählen.</p></section></div>'
    );
  const thread = state.turns
    .map(
      turn =>
        '<article class="intake-turn"><p class="intake-said">' +
        h(turn.text || 'Foto ohne Text') +
        (turn.photo ? ' <small>' + h(turn.photo) + '</small>' : '') +
        '</p>' +
        (turn.error
          ? '<p class="intake-bad" role="alert">' +
            h(turn.error) +
            (turn.detail ? ' <small>(' + h(turn.detail) + ')</small>' : '') +
            '</p>'
          : '') +
        turn.notes.map(note => '<p class="intake-note">' + h(note) + '</p>').join('') +
        (turn.card ? cardView(app, turn, context) : '') +
        '</article>'
    )
    .join('');
  return (
    head +
    (thread ? '<section class="intake-thread" aria-label="Verlauf">' + thread + '</section>' : '') +
    '<section class="intake-compose" aria-label="Neue Meldung"><label>Meldung<textarea name="intakeText" rows="3" maxlength="2000" placeholder="Zum Beispiel: Pils noch drei Kisten, Spezi ist leer. Bestell fünf Kisten Pils für morgen."' +
    (state.busy ? ' disabled' : '') +
    '>' +
    h(state.text) +
    '</textarea></label><p class="muted">Zum Diktieren ins Feld tippen und das Mikrofon der Tastatur nehmen.</p><label>Foto eines Zettels (wenn nötig)<input type="file" name="intakePhoto" accept="image/*"' +
    (state.busy ? ' disabled' : '') +
    ' /></label>' +
    (state.photoInfo
      ? '<p class="muted" data-photo>' +
        h(state.photoInfo) +
        ' ' +
        button('intake-photo-clear', 'Foto entfernen') +
        '</p>'
      : '') +
    '<div class="actions"><button type="button" class="primary" data-action="intake-send" data-id=""' +
    (state.busy ? ' disabled aria-busy="true"' : '') +
    '>' +
    (state.busy ? 'Wird gelesen …' : 'Verstehen lassen') +
    '</button></div></section></div>'
  );
}

/** Seite „KI für den Eingang“ (nur Besitzer). */
export function aiSetupView(app: KitchenView): string {
  const setup = app.aiSetup!,
    ai = app.ai;
  const head =
    '<div class="intake" data-intake><div class="page-heading"><div><h1>KI für den Eingang</h1><p>Der Eingang schickt Meldungen an ein Sprachmodell. Dafür braucht die App einen Zugang beim Anbieter.</p></div><div class="actions">' +
    button('cancel', 'Schließen') +
    '</div></div>';
  if (!ai?.manager)
    return head + '<section class="panel"><p>Das können nur Besitzer der Seite einrichten.</p></section></div>';
  if (!ai.ready)
    return (
      head +
      '<section class="settings-section"><div class="settings-heading"><h2>Ablage anlegen</h2><p>Die App legt dafür in SharePoint eine Liste mit dem Namen „' +
      h(app.store.testMode ? 'ZK_AbnahmeV1_Einstellungen' : 'ZK_V1_Einstellungen') +
      '“ an. Alle anderen Listen bleiben, wie sie sind.</p></div><div class="settings-row"><div><strong>Liste „Einstellungen“</strong><p>Noch nicht vorhanden.</p></div>' +
      button('ai-list', 'Liste anlegen', '', true) +
      '</div></section></div>'
    );
  const saved = ai.row?.value;
  return (
    head +
    '<section class="settings-section"><div class="settings-heading"><h2>Zugang</h2><p>Den Schlüssel legt ihr beim Anbieter an, am besten in einem eigenen Arbeitsbereich mit Ausgabenlimit.</p></div><div class="settings-row"><div class="intake-fields single">' +
    select(
      'aiProvider',
      'Anbieter',
      PROVIDERS.map(p => [p, PROVIDER_NAME[p]] as [string, string]),
      setup.provider
    ) +
    field('aiModel', 'Modell', setup.model, false, 'text', 'spellcheck="false" autocapitalize="off"') +
    field(
      'aiKey',
      saved ? 'Neuer Schlüssel (leer lassen: der gespeicherte bleibt)' : 'Schlüssel',
      '',
      false,
      'password',
      'spellcheck="false" autocapitalize="off"'
    ) +
    '<p class="muted">' +
    (saved
      ? 'Gespeichert ist ein Schlüssel, der auf ' + h(saved.key.slice(-4)) + ' endet.'
      : 'Noch kein Schlüssel gespeichert.') +
    ' Er liegt in der Liste „Einstellungen“ dieser Seite. Technisch lesen kann ihn jedes Mitglied der Seite, deshalb das Ausgabenlimit. Zum Sperren den Schlüssel beim Anbieter löschen.</p></div><div class="actions">' +
    '<button type="button" class="primary" data-action="ai-save" data-id=""' +
    (setup.busy ? ' disabled' : '') +
    '>Speichern</button></div></div></section>' +
    (saved
      ? '<section class="settings-section"><div class="settings-heading"><h2>Verbindung</h2><p>Schickt eine kurze erfundene Meldung an das Modell und zeigt, ob eine brauchbare Antwort kommt.</p></div><div class="settings-row"><div><p role="status">' +
        (setup.busy
          ? 'Wird geprüft …'
          : setup.test
            ? '<span class="' +
              (setup.test.ok ? 'intake-ok' : 'intake-bad') +
              '">' +
              h(setup.test.text) +
              '</span>' +
              (setup.test.detail ? ' <small>(' + h(setup.test.detail) + ')</small>' : '')
            : 'Noch nicht geprüft.') +
        '</p></div><button type="button" data-action="ai-test" data-id=""' +
        (setup.busy ? ' disabled' : '') +
        '>Verbindung prüfen</button></div></section>'
      : '') +
    '</div>'
  );
}

function entryFrom(line: IntakeLine): IntakeEntry {
  return {
    id: uuid(),
    kind: line.kind,
    spoken: line.spoken,
    articleId: line.articleId,
    candidates: line.candidates,
    offerId: line.offerId,
    packs: num(line.packs),
    loose: num(line.loose),
    reorder: line.reorder,
    day: line.day,
    flags: line.flags,
    checked: false
  };
}

/** Liest die Karte aus dem Formular zurück in den Zustand, bevor neu gezeichnet oder gespeichert wird. */
function readCards(app: KitchenView): void {
  const state = app.intake;
  if (!state) return;
  const value = (name: string): string | undefined =>
    app.root.querySelector<HTMLInputElement | HTMLSelectElement>('[data-intake] [name="' + name + '"]')?.value;
  const ticked = (name: string): boolean | undefined =>
    app.root.querySelector<HTMLInputElement>('[data-intake] [name="' + name + '"]')?.checked;
  const text = value('intakeText');
  if (text !== undefined) state.text = text;
  for (const turn of state.turns)
    for (const entry of turn.card?.status === 'open' ? turn.card.entries : []) {
      entry.articleId = value('a:' + entry.id) ?? entry.articleId;
      entry.offerId = value('o:' + entry.id) ?? entry.offerId;
      entry.packs = (value('p:' + entry.id) ?? entry.packs).trim();
      entry.loose = (value('l:' + entry.id) ?? entry.loose).trim();
      entry.day = value('d:' + entry.id) ?? entry.day;
      entry.reorder = ticked('r:' + entry.id) ?? entry.reorder;
      entry.checked = ticked('c:' + entry.id) ?? entry.checked;
    }
}
/** Offene Karten und ungesendeter Text gelten als ungespeicherte Eingabe: Zurück fragt nach. */
function syncDirty(app: KitchenView): void {
  const state = app.intake;
  app.dirty = !!state && (state.turns.some(t => t.card?.status === 'open') || !!state.text.trim() || !!state.photo);
}

/** Tippen und Diktieren im Eingang: nur Zustand und kleine Anzeigen, kein Neuzeichnen. */
export function intakeInput(app: KitchenView, target: HTMLInputElement | HTMLTextAreaElement): void {
  const state = app.intake;
  if (!state) return;
  if (target.name === 'intakeText') state.text = target.value;
  const [kind, id] = target.name.split(':');
  if (id && (kind === 'p' || kind === 'l')) {
    readCards(app);
    const entry = state.turns.flatMap(t => t.card?.entries || []).find(e => e.id === id);
    const total = app.root.querySelector<HTMLElement>('[data-total="' + id + '"]');
    if (entry && total)
      total.textContent = totalText(entry, intakeContext(app.state!, app.seasonId, app.area, today()));
  }
  syncDirty(app);
}

/** Auswahl geändert, abgehakt oder Foto gewählt. */
export async function intakeChange(app: KitchenView, target: HTMLInputElement | HTMLSelectElement): Promise<void> {
  const state = app.intake;
  if (!state) return;
  if (target.name === 'intakePhoto') {
    const file = (target as HTMLInputElement).files?.[0];
    if (!file) return;
    readCards(app);
    const fit = await fitPhoto(
      {
        name: file.name || 'foto.jpg',
        mediaType: file.type || 'image/jpeg',
        bytes: new Uint8Array(await file.arrayBuffer())
      },
      app.root.ownerDocument
    );
    if (app.intake !== state) return;
    state.photo = fit.file;
    state.photoInfo =
      'Foto: ' +
      fit.file.name +
      ' · ' +
      Math.max(1, Math.round(fit.file.bytes.length / 1024)) +
      ' KB' +
      (fit.note ? ' · ' + fit.note : '');
    syncDirty(app);
    app.render();
    return;
  }
  const [kind, id] = target.name.split(':');
  if (!id) return;
  readCards(app);
  const entry = state.turns.flatMap(t => t.card?.entries || []).find(e => e.id === id);
  if (!entry) return;
  if (kind === 'c') {
    const card = state.turns.find(t => t.card?.entries.includes(entry))!.card!;
    const open = card.entries.filter(e => e.flags.length && !e.checked).length;
    const status = target.closest('[data-turn]')?.querySelector<HTMLElement>('[data-open]');
    if (status) status.textContent = openText(open);
    return;
  }
  if (kind === 'a') {
    // Neuer Artikel: Gebinde passend vorbelegen. Bei mehreren Möglichkeiten wählt ein Mensch.
    const article = articleOf(intakeContext(app.state!, app.seasonId, app.area, today()), entry.articleId);
    if (entry.kind === 'reorder') entry.offerId = article && article.packs.length === 1 ? article.packs[0].offerId : '';
    else {
      const packs = countPacks(article);
      entry.offerId = packs.length === 1 && entry.packs ? packs[0].offerId : '';
      if (!entry.offerId && entry.packs && !entry.loose) {
        entry.loose = entry.packs;
        entry.packs = '';
      }
    }
  }
  if (kind === 'o' && entry.kind === 'count' && !entry.offerId && entry.packs) {
    // Von Gebinde auf „Einzeln“: die Zahl bleibt sichtbar stehen, statt unbemerkt zu verschwinden.
    if (!entry.loose) entry.loose = entry.packs;
    entry.packs = '';
  }
  if (kind === 'a' || kind === 'o') app.render();
}

function turnOf(app: KitchenView, id: string): IntakeTurn {
  const turn = app.intake?.turns.find(t => t.id === id);
  if (!turn) throw new Error('Diese Meldung gibt es nicht mehr. Bitte neu senden.');
  return turn;
}
const amount = (raw: string, label: string): number | null => {
  try {
    return parseDecimal(raw);
  } catch {
    throw new Error(label + ': bitte eine Zahl eintragen, zum Beispiel 3 oder 1,5.');
  }
};

/** Aktionen des Eingangs. Gibt true zurück, wenn die Aktion hier behandelt wurde. */
export async function intakeAction(app: KitchenView, action: string, id: string): Promise<boolean> {
  if (!action.startsWith('intake-') && !action.startsWith('ai-')) return false;
  if (!app.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if (action === 'intake-open' || action === 'ai-setup') {
    if (!app.canLeave()) return true;
    const ai = await loadAi(app);
    app.clearEditor();
    if (action === 'intake-open') {
      app.intake = { turns: [], text: '', photoInfo: '', busy: false };
    } else {
      const provider = ai.row && isProvider(ai.row.value.provider) ? ai.row.value.provider : 'anthropic';
      app.aiSetup = { provider, model: ai.row?.value.model || DEFAULT_MODEL[provider], busy: false };
    }
    app.render();
    return true;
  }
  if (action.startsWith('ai-')) return setupAction(app, action);
  const state = app.intake;
  if (!state) return true;
  readCards(app);
  if (action === 'intake-photo-clear') {
    state.photo = undefined;
    state.photoInfo = '';
    syncDirty(app);
    app.render();
    return true;
  }
  if (action === 'intake-send') {
    if (state.busy) return true;
    const ai = await loadAi(app);
    if (!ai.row) throw new Error('Der Eingang ist noch nicht eingerichtet.');
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    const text = state.text.trim(),
      photo = state.photo;
    if (!text && !photo) throw new Error('Bitte erst etwas sagen, schreiben oder ein Foto wählen.');
    const turn: IntakeTurn = { id: uuid(), text, photo: state.photoInfo, notes: [] };
    state.turns.push(turn);
    state.text = '';
    state.photo = undefined;
    state.photoInfo = '';
    state.busy = true;
    app.render();
    try {
      const context = intakeContext(app.state, app.seasonId, app.area, today());
      const result = await readIntake(
        { provider: ai.row.value.provider, key: ai.row.value.key, model: ai.row.value.model },
        context,
        text,
        photo
      );
      if (result.lines.length) turn.card = { opId: uuid(), entries: result.lines.map(entryFrom), status: 'open' };
      if (result.question) turn.notes.push('Rückfrage: ' + result.question);
      if (result.documentType === 'invoice' || result.documentType === 'deliveryNote')
        turn.notes.push(
          (result.documentType === 'invoice'
            ? 'Das sieht nach einer Rechnung aus.'
            : 'Das sieht nach einem Lieferschein aus.') +
            ' Dafür ist der Eingang noch nicht eingerichtet. Rechnungen prüft ihr unter Bestellungen, Lieferungen in der Warenannahme.'
        );
      for (const other of result.other) turn.notes.push('Nicht übernommen: „' + other + '“');
      if (!result.lines.length && !turn.notes.length)
        turn.notes.push('Keine Bestandsmeldung und keine Nachbestellung erkannt. Nichts gespeichert.');
    } catch (error) {
      turn.error = error instanceof Error ? error.message : String(error);
      turn.detail = error instanceof AiError ? error.detail : '';
      // Der Wortlaut geht nicht verloren: er steht wieder im Feld.
      if (app.intake === state && !state.text) state.text = text;
    } finally {
      state.busy = false;
      if (app.intake === state) {
        syncDirty(app);
        app.render();
      }
    }
    return true;
  }
  if (action === 'intake-remove') {
    const [turnId, entryId] = id.split('|');
    const turn = turnOf(app, turnId);
    if (turn.card?.status !== 'open') return true;
    turn.card.entries = turn.card.entries.filter(e => e.id !== entryId);
    if (!turn.card.entries.length) turn.card.status = 'discarded';
    syncDirty(app);
    app.render();
    return true;
  }
  if (action === 'intake-discard') {
    const turn = turnOf(app, id);
    if (turn.card?.status === 'open') turn.card.status = 'discarded';
    syncDirty(app);
    app.render();
    return true;
  }
  if (action === 'intake-copy' || action === 'intake-share') {
    const [turnId, index] = id.split('|');
    const card = turnOf(app, turnId).card;
    const order = card?.saved?.orders[Number(index)];
    if (!card || !order) return true;
    const navigator = app.root.ownerDocument.defaultView?.navigator;
    if (action === 'intake-share') {
      try {
        await navigator?.share?.({ text: order.text });
      } catch {
        /* Abgebrochen: nichts zu tun. */
      }
      return true;
    }
    try {
      await navigator?.clipboard?.writeText(order.text);
      card.copied = Number(index);
    } catch {
      throw new Error('Kopieren geht hier nicht. Bitte den Text markieren und selbst kopieren.');
    }
    app.render();
    return true;
  }
  if (action === 'intake-save') {
    const turn = turnOf(app, id),
      card = turn.card;
    if (!card || card.status !== 'open') return true;
    if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
    const open = card.entries.filter(e => e.flags.length && !e.checked);
    if (open.length)
      throw new Error(
        (open.length === 1 ? 'Eine markierte Zeile ist' : open.length + ' markierte Zeilen sind') +
          ' noch nicht abgehakt. Bitte prüfen und „Geprüft, stimmt so“ ankreuzen.'
      );
    const lines: ConfirmedLine[] = card.entries.map(e => ({
      kind: e.kind,
      spoken: e.spoken,
      articleId: e.articleId,
      offerId: e.offerId,
      packs: e.kind === 'count' && !e.offerId ? null : amount(e.packs, 'Menge bei „' + e.spoken + '“'),
      loose: e.kind === 'count' ? amount(e.loose, 'Einzelmenge bei „' + e.spoken + '“') : null,
      reorder: e.reorder,
      day: e.day
    }));
    let index = 0;
    const scope = {
      seasonId: app.seasonId,
      area: app.area,
      user: app.user,
      now: new Date().toISOString(),
      // Feste Kennungen je Karte: ein zweiter Versuch nach einem Abbruch legt nichts doppelt an.
      id: (): string => card.opId + '-' + ++index
    };
    const counts = buildCounts(lines, app.state, scope);
    const orders = buildOrders(lines, app.state, scope);
    if (!counts.length && !orders.length) throw new Error('Auf der Karte steht nichts zum Speichern.');
    const texts = orders.map(order => ({
      id: order.id,
      supplier: order.supplierName,
      text: reorderMessage(order, app.state!.suppliers.find(s => s.value.id === order.supplierId)!.value)
    }));
    const kept = app.intake!;
    await app.run(
      async () => {
        for (const [i, count] of counts.entries())
          await app.store.saveMaster('counts', count, undefined, card.opId + '-c' + i);
        for (const [i, order] of orders.entries()) await app.store.saveOrder(order, undefined, card.opId + '-o' + i);
      },
      'Gespeichert.',
      () => {
        card.status = 'saved';
        card.saved = {
          counts: counts.length,
          lines: counts.map(
            c =>
              c.articleName +
              ': ' +
              n(c.quantity) +
              ' ' +
              unitName(c.unit, c.quantity) +
              (c.reorder ? ' · Nachbestellen vorgemerkt' : '')
          ),
          orders: texts
        };
        app.intake = kept;
        syncDirty(app);
      }
    );
    return true;
  }
  return true;
}

async function setupAction(app: KitchenView, action: string): Promise<boolean> {
  const ai = await loadAi(app);
  if (!ai.manager) throw new Error('Das können nur Besitzer der Seite einrichten.');
  const reopen = async (): Promise<void> => {
    const fresh = await loadAi(app, true);
    const provider = fresh.row && isProvider(fresh.row.value.provider) ? fresh.row.value.provider : 'anthropic';
    // Nach dem Speichern zurück auf die Einrichtungsseite, mit dem frisch gelesenen Stand.
    // eslint-disable-next-line require-atomic-updates -- Nur eine Aktion läuft zugleich (busy), die Ansicht besitzt diesen Zustand allein.
    app.aiSetup = { provider, model: fresh.row?.value.model || DEFAULT_MODEL[provider], busy: false };
    app.render();
  };
  if (action === 'ai-list') {
    await app.run(() => app.store.initialize(), 'Liste „Einstellungen“ angelegt.');
    await reopen();
    return true;
  }
  const setup = app.aiSetup;
  if (!setup) return true;
  const value = (name: string): string =>
    app.root.querySelector<HTMLInputElement | HTMLSelectElement>('[data-intake] [name=' + name + ']')?.value.trim() ||
    '';
  const provider = value('aiProvider');
  if (isProvider(provider)) setup.provider = provider;
  setup.model = value('aiModel') || setup.model;
  if (action === 'ai-save') {
    const key = value('aiKey') || ai.row?.value.key || '';
    if (!key) throw new Error('Bitte den Schlüssel eintragen.');
    const next: AiSettings = {
      id: 'ki',
      provider: setup.provider,
      model: setup.model || DEFAULT_MODEL[setup.provider],
      key,
      updatedAt: new Date().toISOString(),
      updatedBy: app.user
    };
    const operation = uuid();
    await app.run(() => app.store.saveAiSettings(next, ai.row, operation), 'Zugang gespeichert.');
    await reopen();
    return true;
  }
  if (action === 'ai-test') {
    if (!ai.row) throw new Error('Bitte zuerst den Zugang speichern.');
    setup.busy = true;
    setup.test = undefined;
    app.render();
    try {
      // Erfundene Meldung gegen zwei erfundene Artikel: derselbe Weg wie im Eingang, aber ohne Vereinsdaten.
      const context: IntakeContext = {
        area: 'Probe',
        today: today(),
        suppliers: [{ id: 'l1', name: 'Getränkemarkt' }],
        articles: [
          {
            id: 'a1',
            name: 'Pils 0,33 l',
            unit: 'Fl',
            category: 'Getränk',
            packs: [{ offerId: 'o1', supplierId: 'l1', supplier: 'Getränkemarkt', packName: 'Kiste', packSize: 20 }]
          },
          {
            id: 'a2',
            name: 'Spezi 0,33 l',
            unit: 'Fl',
            category: 'Getränk',
            packs: [{ offerId: 'o2', supplierId: 'l1', supplier: 'Getränkemarkt', packName: 'Kiste', packSize: 24 }]
          }
        ]
      };
      const result = await readIntake(
        { provider: ai.row.value.provider, key: ai.row.value.key, model: ai.row.value.model },
        context,
        'Pils noch drei Kisten, Spezi ist leer'
      );
      const pils = result.lines.find(l => l.articleId === 'a1'),
        spezi = result.lines.find(l => l.articleId === 'a2');
      const right = result.lines.length === 2 && pils?.packs === 3 && spezi?.loose === 0;
      setup.test = right
        ? {
            ok: true,
            text:
              'Verbindung steht. Die Probemeldung wurde richtig verstanden (' +
              result.usage.model +
              ', ' +
              (result.usage.ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) +
              ' s).'
          }
        : {
            ok: false,
            text: 'Die Verbindung steht, aber die Probemeldung wurde nicht richtig verstanden. Bitte ein anderes Modell wählen.',
            detail: result.lines.map(l => l.spoken + ' → ' + (l.articleId || 'kein Artikel')).join('; ')
          };
    } catch (error) {
      setup.test = {
        ok: false,
        text: error instanceof Error ? error.message : String(error),
        detail: error instanceof AiError ? error.detail : ''
      };
    } finally {
      setup.busy = false;
      if (app.aiSetup === setup) app.render();
    }
    return true;
  }
  return true;
}
