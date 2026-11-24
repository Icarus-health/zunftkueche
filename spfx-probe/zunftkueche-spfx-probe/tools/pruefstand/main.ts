// Prüfstand: eigenständige Seite für den Rechner, nicht Teil der App.
// Schickt Testdiktate und Belege an die echte KI, auf demselben Weg wie die App, und vergleicht mit Sollwerten.
import { AiError, DEFAULT_MODEL, PROVIDER_NAME } from '../../src/kitchen/ai/provider.ts';
import type { AiFile, Provider } from '../../src/kitchen/ai/provider';
import { readIntake } from '../../src/kitchen/ai/intake.ts';
import type { IntakeContext, IntakeResult } from '../../src/kitchen/ai/intake';
import { readBill } from '../../src/kitchen/ai/bill-reader.ts';
import type { BillRead } from '../../src/kitchen/ai/bill-reader';
import { judgeBill, judgeDictation } from './judge.ts';
import type { DictationCase, ExpectedBill, Judgement, Verdict } from './judge';

interface Data {
  title: string;
  context: IntakeContext;
  dictations: DictationCase[];
  bills: Record<string, ExpectedBill>;
}
declare const PRUEFSTAND_DATA: Data;
const data = PRUEFSTAND_DATA;

interface DictationRow {
  id: string;
  text: string;
  judgement?: Judgement;
  result?: IntakeResult;
  error?: string;
}
interface BillRow {
  file: string;
  judgement?: Judgement;
  read?: BillRead;
  error?: string;
}
const state = { dictations: [] as DictationRow[], bills: [] as BillRow[], busy: false, stop: false };

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const PROVIDERS: Provider[] = ['anthropic', 'openrouter', 'openrouter-eu'];
const access = (): { provider: Provider; key: string; model: string } => {
  const provider = $<HTMLSelectElement>('provider').value as Provider;
  return {
    provider,
    key: $<HTMLInputElement>('key').value.trim(),
    model: $<HTMLInputElement>('model').value.trim() || DEFAULT_MODEL[provider]
  };
};
const failure = (error: unknown): string =>
  error instanceof AiError
    ? error.message + (error.detail ? ' (' + error.detail + ')' : '')
    : error instanceof Error
      ? error.message
      : String(error);
const fatal = (error: unknown): boolean =>
  error instanceof AiError && (error.kind === 'key' || error.kind === 'credit');
const ORDER: Verdict[] = ['richtig', 'richtig mit Rückfrage', 'abgefangen', 'falsch ohne Hinweis'];
const badge = (j?: Judgement, error?: string): string =>
  error
    ? '<span class="v err">Fehler</span>'
    : j
      ? '<span class="v v' + ORDER.indexOf(j.verdict) + '">' + esc(j.verdict) + '</span>'
      : '<span class="v">offen</span>';

function summary(rows: Array<{ judgement?: Judgement; error?: string }>, total: number): string {
  const done = rows.filter(r => r.judgement || r.error).length;
  const count = (v: Verdict): number => rows.filter(r => r.judgement?.verdict === v).length;
  const errors = rows.filter(r => r.error).length;
  const silent = count('falsch ohne Hinweis');
  return (
    '<p><strong>' +
    done +
    ' von ' +
    total +
    ' geprüft.</strong> ' +
    ORDER.map(v => esc(v) + ': ' + count(v)).join(' · ') +
    (errors ? ' · Fehler: ' + errors : '') +
    '</p>' +
    (done === total && total
      ? '<p class="' +
        (silent || errors ? 'bad' : 'good') +
        '">' +
        (silent
          ? (silent === 1 ? 'Ein falscher Eintrag wäre' : silent + ' falsche Einträge wären') +
            ' ohne Hinweis durchgegangen. So geht kein Paket raus.'
          : errors
            ? 'Nicht alles ließ sich prüfen. Bitte die Fehler ansehen.'
            : 'Kein falscher Eintrag ohne Hinweis.') +
        '</p>'
      : '')
  );
}
function draw(): void {
  $('dictation-summary').innerHTML = summary(state.dictations, data.dictations.length);
  $('dictation-rows').innerHTML = state.dictations
    .map(
      r =>
        '<tr><td>' +
        esc(r.id) +
        '</td><td>' +
        esc(r.text) +
        '</td><td>' +
        badge(r.judgement, r.error) +
        '</td><td>' +
        esc(r.error || r.judgement?.reasons.join(' · ') || '') +
        (r.result
          ? '<details><summary>Vorschlag ansehen</summary>' +
            r.result.lines
              .map(
                l =>
                  esc(l.kind === 'count' ? 'Bestand' : 'Bestellung') +
                  ' · ' +
                  esc(data.context.articles.find(a => a.id === l.articleId)?.name || 'kein Artikel') +
                  ' · Gebinde ' +
                  esc(l.packs ?? '') +
                  ' · einzeln ' +
                  esc(l.loose ?? '') +
                  (l.day ? ' · ' + esc(l.day) : '') +
                  (l.flags.length ? '<br><em>' + l.flags.map(esc).join('<br>') + '</em>' : '')
              )
              .join('<hr>') +
            (r.result.other.length ? '<hr>Nicht übernommen: ' + r.result.other.map(esc).join(' · ') : '') +
            '</details>'
          : '') +
        '</td></tr>'
    )
    .join('');
  $('bill-summary').innerHTML = state.bills.length ? summary(state.bills, state.bills.length) : '';
  $('bill-rows').innerHTML = state.bills
    .map(
      r =>
        '<tr><td>' +
        esc(r.file) +
        '</td><td>' +
        esc(r.read ? r.read.reading.number + ' · ' + r.read.reading.date : '') +
        '</td><td>' +
        esc(r.read ? [r.read.reading.net, r.read.reading.tax, r.read.reading.gross].join(' · ') : '') +
        '</td><td>' +
        esc(r.read ? r.read.check.lines + ' (' + r.read.check.linesOk + ' nachgerechnet)' : '') +
        '</td><td>' +
        badge(r.judgement, r.error) +
        '</td><td>' +
        esc(r.error || r.judgement?.reasons.join(' · ') || '') +
        '</td></tr>'
    )
    .join('');
  for (const id of ['run-dictations', 'run-bills', 'save']) $<HTMLButtonElement>(id).disabled = state.busy;
  $<HTMLButtonElement>('stop').hidden = !state.busy;
}
function ready(): boolean {
  if (access().key) return true;
  $('status').textContent = 'Bitte zuerst den Schlüssel eintragen.';
  $<HTMLInputElement>('key').focus();
  return false;
}
/** Arbeitet eine Liste mit wenigen gleichzeitigen Aufrufen ab. */
async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length && !state.stop) await work(queue.shift() as T);
    })
  );
}

async function runDictations(): Promise<void> {
  if (state.busy || !ready()) return;
  state.busy = true;
  state.stop = false;
  state.dictations = data.dictations.map(c => ({ id: c.id, text: c.text }));
  $('status').textContent = 'Diktate laufen …';
  draw();
  const who = access();
  await pool(data.dictations, 3, async test => {
    const row = state.dictations.find(r => r.id === test.id)!;
    try {
      row.result = await readIntake(who, data.context, test.text);
      row.judgement = judgeDictation(test, row.result.lines, data.context);
    } catch (error) {
      row.error = failure(error);
      if (fatal(error)) state.stop = true;
    }
    draw();
  });
  state.busy = false;
  $('status').textContent = state.stop ? 'Abgebrochen.' : 'Diktate fertig.';
  draw();
}

async function runBills(): Promise<void> {
  if (state.busy || !ready()) return;
  const files = Array.from($<HTMLInputElement>('bill-files').files || []).filter(f => /\.pdf$/i.test(f.name));
  if (!files.length) {
    $('status').textContent = 'Bitte zuerst die Rechnungs-PDF wählen.';
    return;
  }
  state.busy = true;
  state.stop = false;
  state.bills = files.map(f => ({ file: f.name })).sort((a, b) => a.file.localeCompare(b.file, 'de'));
  $('status').textContent = 'Belege laufen …';
  draw();
  const who = access();
  await pool(files, 2, async file => {
    const row = state.bills.find(r => r.file === file.name)!;
    try {
      const source: AiFile = {
        name: file.name,
        mediaType: 'application/pdf',
        bytes: new Uint8Array(await file.arrayBuffer())
      };
      row.read = await readBill(who, source);
      const want = data.bills[file.name];
      row.judgement = want
        ? judgeBill(want, row.read)
        : { verdict: 'richtig mit Rückfrage', reasons: ['Kein Sollwert für diese Datei hinterlegt.'] };
    } catch (error) {
      row.error = failure(error);
      if (fatal(error)) state.stop = true;
    }
    draw();
  });
  state.busy = false;
  $('status').textContent = state.stop ? 'Abgebrochen.' : 'Belege fertig.';
  draw();
}

function save(): void {
  const who = access();
  const payload = {
    tool: 'zunftkueche-pruefstand',
    data: data.title,
    at: new Date().toISOString(),
    provider: who.provider,
    model: who.model,
    browser: navigator.userAgent,
    dictations: state.dictations.map(r => ({
      id: r.id,
      text: r.text,
      verdict: r.judgement?.verdict || '',
      reasons: r.judgement?.reasons || [],
      error: r.error || '',
      lines: r.result?.lines,
      readings: r.result?.readings,
      other: r.result?.other,
      question: r.result?.question,
      usage: r.result?.usage
    })),
    bills: state.bills.map(r => ({
      file: r.file,
      verdict: r.judgement?.verdict || '',
      reasons: r.judgement?.reasons || [],
      error: r.error || '',
      reading: r.read?.reading,
      check: r.read?.check,
      result: r.read?.result
    }))
  };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' }));
  link.download = 'pruefstand-ergebnis-' + who.model.replace(/[^a-z0-9.-]+/gi, '-') + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  $('status').textContent = 'Ergebnisdatei gespeichert: ' + link.download + '. Sie enthält keinen Schlüssel.';
}

$<HTMLSelectElement>('provider').innerHTML = PROVIDERS.map(
  p => '<option value="' + p + '">' + esc(PROVIDER_NAME[p]) + '</option>'
).join('');
$<HTMLInputElement>('model').value = DEFAULT_MODEL.anthropic;
$<HTMLSelectElement>('provider').addEventListener('change', () => {
  const model = $<HTMLInputElement>('model');
  if (!model.value || Object.values(DEFAULT_MODEL).includes(model.value))
    model.value = DEFAULT_MODEL[$<HTMLSelectElement>('provider').value as Provider];
});
$('title').textContent = data.title;
$('counts').textContent =
  data.dictations.length +
  ' Testdiktate gegen ' +
  data.context.articles.length +
  ' Artikel · Sollwerte für ' +
  Object.keys(data.bills).length +
  ' Belege';
$('run-dictations').addEventListener('click', () => void runDictations());
$('run-bills').addEventListener('click', () => void runBills());
$('save').addEventListener('click', save);
$('stop').addEventListener('click', () => {
  state.stop = true;
});
draw();
