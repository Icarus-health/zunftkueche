import type { InboxOriginal } from './inbox';
import type { Workspace, Area, Stored } from '../model';
import type { Profile, PriceList, SystemImport, WwDocument, ImportField, PaymentRow, SystemRow } from './model';
import type { ImportGrid, ImportContext, ImportPreview } from '../imports/model';
import { documents, importPurposes, purposeLabels } from './model.ts';
import { button, field, select, h, n, check, money } from '../markup.ts';
import { heading, today } from './common.ts';
import { readCsv, decodeCsv } from '../imports/csv-reader.ts';
import { listWorkbookSheets, readWorkbookSheet } from '../imports/xlsx-reader.ts';
import { importedNumber, previewSystemImport } from '../imports/preview.ts';
import { sha256, canonicalImportKey } from '../imports/identity.ts';
import { validateDocument, offerIdentity } from './domain.ts';
interface WizardPorts {
  root: HTMLElement;
  state: () => Workspace;
  season: () => string;
  area: () => Area;
  actor: string;
  redraw: () => void;
  commit: (
    doc: WwDocument,
    profile?: Profile,
    previous?: Stored<Profile>,
    original?: { bytes: Uint8Array; extension: 'csv' | 'xlsx' }
  ) => Promise<void>;
}
const productFields: Array<[ImportField, string]> = [
  ['productCode', 'Artikelnummer / Code'],
  ['productName', 'Artikelbezeichnung'],
  ['quantity', 'Verkaufte / bestellte Menge'],
  ['unit', 'Einheit'],
  ['date', 'Betriebstag / Verwendungstag'],
  ['status', 'Status'],
  ['amount', 'Gesamtumsatz der Zeile'],
  ['currency', 'Währung'],
  ['externalId', 'Externe Belegkennung']
];
const paymentFields: Array<[ImportField, string]> = [
  ['amount', 'Zahlungsbetrag'],
  ['paymentMethod', 'Zahlart (optional)'],
  ['date', 'Betriebstag (optional)'],
  ['status', 'Status (optional)'],
  ['currency', 'Währung (optional)'],
  ['externalId', 'Externe Belegkennung (optional)']
];
const paymentHeaders: Partial<Record<ImportField, string[]>> = {
  amount: ['betrag', 'zahlungsbetrag'],
  paymentMethod: ['zahlart', 'zahlungsart'],
  date: ['datum', 'betriebstag'],
  status: ['status'],
  currency: ['währung'],
  externalId: ['belegkennung', 'transaktions-id']
};
export class TableWizard {
  public mode: 'system' | 'prices';
  private stage: 'file' | 'sheet' | 'columns' | 'products' | 'review' = 'file';
  private bytes?: Uint8Array;
  private fileName = '';
  private hash = '';
  private sheets: string[] = [];
  private grid?: ImportGrid;
  private profile?: Profile;
  private previous?: Stored<Profile>;
  private context?: ImportContext;
  private preview?: ImportPreview;
  private header = 0;
  private paymentColumnsReviewed = false;
  private title = '';
  private supplierId = '';
  private validFrom = today();
  private priceColumns: Record<string, number> = {};
  private priceDoc?: PriceList;
  private replacesId = '';
  private importId = crypto.randomUUID();
  public constructor(
    mode: 'system' | 'prices',
    private readonly p: WizardPorts,
    private readonly original?: InboxOriginal
  ) {
    this.mode = mode;
  }
  public useProfile(id: string): void {
    const p = documents(this.p.state().ww, 'profile').find(p => p.id === id);
    if (!p) return;
    const form = this.form();
    const purpose = form.querySelector<HTMLSelectElement>('[name=purpose]');
    if (purpose) purpose.value = p.purpose;
    const name = form.querySelector<HTMLInputElement>('[name=name]');
    if (name && !name.value) name.value = p.name;
  }
  private form(): HTMLFormElement {
    return this.p.root.querySelector<HTMLFormElement>('form[data-wizard]')!;
  }
  private data(): FormData {
    return new FormData(this.form());
  }
  private options(): Array<[string, string]> {
    return [
      ['', 'Nicht vorhanden'],
      ...(this.grid?.rows[this.header] || []).map(
        (c, i) => [String(i), i + 1 + ': ' + (c.text || '(leer)')] as [string, string]
      )
    ];
  }
  private sample(): string {
    return `<div class="ww-preview"><table><caption>Originaldatei · erste ${Math.min(6, this.grid!.rows.length)} Zeilen</caption><tbody>${this.grid!.rows.slice(
      0,
      6
    )
      .map((r, i) => `<tr><th>${i + 1}</th>${r.map(c => `<td>${h(c.text)}</td>`).join('')}</tr>`)
      .join('')}</tbody></table></div>`;
  }
  /** Each import step is its own page for scroll handling. */
  public pageKey(): string {
    return this.mode + ':' + this.stage;
  }
  /**
   * Zeitraum der Kassendatei als Vorschlag: aus den Datumsangaben einer CSV-Datei, sonst aus dem Dateinamen,
   * sonst die Einsatztage der Saison. Die Felder bleiben änderbar.
   */
  private proposedPeriod(): { from: string; to: string; source: string } {
    const season = this.p.state().seasons.find(row => row.value.id === this.p.season())?.value;
    const real = (y: string, m: string, d: string): string => {
      const value = y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
      const time = Date.parse(value + 'T12:00:00Z');
      const fits = !season || Math.abs(Number(y) - season.year) <= 1;
      return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && fits ? value : '';
    };
    const scan = (text: string): string[] =>
      [
        ...[...text.matchAll(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/g)].map(m => real(m[3], m[2], m[1])),
        ...[...text.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)].map(m => real(m[1], m[2], m[3]))
      ]
        .filter(Boolean)
        .sort();
    const name = this.original?.name || '';
    let days: string[] = [];
    let source = '';
    if (this.original && /\.csv$/i.test(name)) {
      days = scan(new TextDecoder().decode(this.original.bytes.slice(0, 500000)));
      if (days.length) source = 'aus den Datumsangaben der Datei';
    }
    if (!days.length && name) {
      days = scan(name);
      if (days.length) source = 'aus dem Dateinamen';
    }
    if (!days.length && season?.operatingDays?.length) {
      days = [...season.operatingDays].sort();
      source = 'aus den Einsatztagen der Saison';
    }
    if (!days.length)
      return this.original ? { from: '', to: '', source: '' } : { from: today(), to: today(), source: '' };
    return { from: days[0], to: days[days.length - 1], source };
  }
  public render(): string {
    let body = '';
    const title = this.mode === 'prices' ? 'Preisliste einlesen' : 'Kassendaten einlesen';
    const period =
      this.stage === 'file' && this.mode === 'system' ? this.proposedPeriod() : { from: '', to: '', source: '' };
    if (this.stage === 'file')
      body = `<p class="ww-step">1 · Datei und Herkunft</p><p>Excel (.xlsx) oder CSV. Die Datei wird auf diesem Gerät gelesen. Danach werden Spalten und Artikel geprüft.</p><div class="formgrid">${
        this.original
          ? '<p><strong>' + h(this.original.name) + '</strong> · SharePoint</p>'
          : field('file', 'Datei auswählen', '', true, 'file', 'accept=".csv,.xlsx"')
      }${
        this.mode === 'system'
          ? select(
              'profile',
              'Gespeicherte Quelle / Format',
              [
                ['', 'Neue Quelle / neues Format'],
                ...documents(this.p.state().ww, 'profile').map(
                  p => [p.id, p.name + ' · ' + purposeLabels[p.purpose]] as [string, string]
                )
              ],
              ''
            ) +
            field('name', 'Name der Kasse oder des Systems', 'Kasse', true) +
            select(
              'purpose',
              'Welche Daten enthält die Datei?',
              [
                ['sales', 'Tatsächliche Kassenverkäufe'],
                ['payments', 'Zahlungen / Kassensummen'],
                ['menuOrders', 'Menüvorbestellungen (Planbedarf)']
              ],
              'sales'
            ) +
            field('from', 'Zeitraum von', period.from, true, 'date') +
            field('to', 'Zeitraum bis', period.to, true, 'date') +
            (period.source
              ? '<p class="muted ww-full">Zeitraum ' + h(period.source) + ' vorgeschlagen. Bitte kurz prüfen.</p>'
              : '') +
            '<input type="hidden" name="currency" value="EUR">' +
            select(
              'replacesId',
              'Ersetzt einen früheren Import (optional)',
              [
                ['', 'Neuen Zeitraum übernehmen'],
                ...documents(this.p.state().ww, 'system')
                  .filter(s => s.confirmed && s.area === this.p.area())
                  .map(s => [s.id, s.name + ' · ' + s.from + ' bis ' + s.to] as [string, string])
              ],
              ''
            )
          : field('name', 'Name der Preisliste', '', true) +
            select(
              'supplierId',
              'Lieferant',
              this.p
                .state()
                .suppliers.filter(s => s.value.active)
                .map(s => [s.value.id, s.value.name]),
              ''
            ) +
            field('validFrom', 'Gültig ab', today(), true, 'date')
      }<details class="ww-full"><summary>Weitere CSV-Einstellungen</summary>${select(
        'separator',
        'CSV-Trennzeichen',
        [
          [';', 'Semikolon ;'],
          [',', 'Komma ,'],
          ['\t', 'Tabulator']
        ],
        ';'
      )}${select(
        'encoding',
        'CSV-Zeichensatz',
        [
          ['utf-8', 'UTF-8'],
          ['windows-1252', 'Windows / ältere Excel-CSV']
        ],
        'utf-8'
      )}</details></div>${button('ww-file-read', 'Datei lesen', '', true)}`;
    if (this.stage === 'sheet')
      body = `<p class="ww-step">2 · Tabellenblatt</p>${select(
        'sheet',
        'Blatt auswählen',
        this.sheets.map(s => [s, s]),
        this.sheets[0]
      )}${button('ww-sheet-read', 'Blatt lesen', '', true)}`;
    if (this.stage === 'columns') {
      const p = this.profile!,
        payment = this.mode === 'system' && p.purpose === 'payments';
      const headers = this.grid!.rows[this.header];
      for (const [key, label] of Object.entries(p.columnHeaders || {})) {
        const id = key as ImportField,
          index = p.columnMap[id];
        if (index !== undefined && headers[index]?.text !== label) delete p.columnMap[id];
      }
      const picked = (id: ImportField): number | undefined => {
        if (p.columnMap[id] !== undefined || !payment || this.previous || this.paymentColumnsReviewed)
          return p.columnMap[id];
        const matches = headers.flatMap((cell, index) =>
          paymentHeaders[id]?.includes(cell.text.trim().toLocaleLowerCase('de-DE')) ? [index] : []
        );
        return matches.length === 1 && !Object.values(p.columnMap).includes(matches[0]) ? matches[0] : undefined;
      };
      const column = ([id, label]: [string, string]): string =>
        select(
          'col_' + id,
          label,
          this.options(),
          String((this.mode === 'system' ? picked(id as ImportField) : this.priceColumns[id]) ?? '')
        );
      const decimal = select(
        'decimal',
        'Zahlenformat',
        [
          [',', 'Dezimal-Komma: 1.234,56'],
          ['.', 'Dezimal-Punkt: 1,234.56']
        ],
        p.decimalSeparator
      );
      const dateFormat = select(
        'dateFormat',
        'Datumsformat',
        [
          ['de', 'TT.MM.JJJJ'],
          ['iso', 'JJJJ-MM-TT'],
          ['excel', 'Excel-Datumszahl']
        ],
        p.dateFormat
      );
      const statusFields =
        field('active', 'Aktive Statuswerte (mit | trennen)', p.activeStatuses.join('|')) +
        field('cancelled', 'Stornierte Statuswerte', p.cancelledStatuses.join('|')) +
        field('refund', 'Erstattete Statuswerte', p.refundStatuses.join('|'));
      let mapping: string;
      if (payment) {
        mapping =
          paymentFields.slice(0, 4).map(column).join('') +
          '<details class="ww-full"><summary>Weitere Spalten und Formate</summary><div class="formgrid">' +
          paymentFields.slice(4).map(column).join('') +
          decimal +
          dateFormat +
          statusFields +
          '</div></details>';
      } else if (this.mode === 'system') {
        mapping =
          productFields.map(column).join('') +
          decimal +
          dateFormat +
          select(
            'basis',
            'Umsatzbeträge sind',
            [
              ['unknown', 'Noch unbekannt'],
              ['gross', 'Brutto'],
              ['net', 'Netto']
            ],
            p.basis
          ) +
          statusFields +
          check(
            'defaultActive',
            'Leeren Status bei Menüvorbestellungen ausdrücklich als aktiv werten',
            p.defaultStatus === 'active'
          );
      } else {
        const priceFields: Array<[string, string]> = [
          ['code', 'Artikelnummer des Lieferanten'],
          ['priceNet', 'Preis netto je Gebinde'],
          ['deposit', 'Pfand je Gebinde']
        ];
        mapping = priceFields.map(column).join('') + decimal;
      }
      const hint = payment
        ? 'Vorgeschlagene Spalten prüfen. Ohne Datum gilt der Betrag für den gewählten Zeitraum.'
        : this.mode === 'system'
          ? 'Bitte den gesamten Zeilenumsatz wählen. Ohne Datumsfeld nur einen Betriebstag importieren.'
          : 'Preise gelten je ausgewähltem Gebinde.';
      body =
        '<p class="ww-step">2 · Spalten zuordnen</p><p>' +
        h(this.fileName) +
        ' · ' +
        Math.max(0, this.grid!.rows.length - this.header - 1) +
        ' Datenzeilen</p>' +
        this.sample() +
        field('header', 'Nummer der Kopfzeile', String(this.header + 1), true, 'number', 'min="1"') +
        button('ww-header', 'Kopfzeile übernehmen') +
        '<div class="formgrid">' +
        mapping +
        '</div>' +
        '<p>' +
        h(hint) +
        '</p>' +
        button('ww-columns', payment ? 'Zahlungen prüfen' : 'Artikel zuordnen', '', true);
    }
    if (this.stage === 'products') {
      if (this.mode === 'system') {
        const codes = this.externalCodes(),
          recipes = documents(this.p.state().ww, 'recipe').filter(r => r.confirmed);
        body = `<p class="ww-step">3 · Produkte verbinden</p><p>Bekannte Zuordnungen sind eingeklappt. Neue Produkte und abweichende Einheiten bitte prüfen. Faktor 1 bedeutet: eine exportierte Einheit entspricht einer Portion / einem Stück.</p>${!recipes.length ? '<p class="ww-alert">Zuerst unter Speisen & Getränke ein geprüftes Rezept oder Verkaufsprodukt anlegen.</p>' : ''}<div class="ww-lines">${codes
          .map((code, i) => {
            const m = this.profile!.mappings.find(m => m.externalCode === code);
            const known = !!m && recipes.some(r => r.id === m.productId) && m.unit === this.externalUnit(code);
            return `<details class="mapping-review" ${known ? '' : 'open'}><summary>${h(code)} · ${known ? 'Zuordnung übernommen – bei Bedarf ändern' : 'Neu oder abweichend – prüfen'}</summary><div class="ww-line" data-map="${i}">${select(
              'productId',
              'Rezept / Verkaufsprodukt',
              [
                ['', 'Bitte wählen'],
                ...recipes.map(r => [r.id, r.name + ' · ' + r.at.slice(0, 10)] as [string, string])
              ],
              m?.productId || ''
            )}${field('factor', 'Portionen je Exporteinheit', n(m?.factor ?? 1), true, 'text', 'inputmode="decimal"')}${field('unit', 'Einheit der Exportdatei', m?.unit || this.externalUnit(code))}</div></details>`;
          })
          .join('')}</div>${button('ww-products', 'Importvorschau prüfen', '', true)}`;
      } else body = this.priceReview(false);
    }
    if (this.stage === 'review') {
      if (this.mode === 'system') {
        const v = this.preview!,
          p = this.profile!,
          context = this.context!,
          payment = p.purpose === 'payments';
        const statusLabel = { active: 'Berücksichtigt', refund: 'Erstattet', cancelled: 'Storniert' };
        const summary = payment
          ? v.errors.length
            ? 'Saldo offen'
            : 'Saldo ' + n(v.amount) + ' ' + h(context.currency)
          : 'Menge ' +
            n(v.quantity) +
            ' · Umsatz ' +
            (v.amount === null ? 'offen' : n(v.amount) + ' ' + h(context.currency)) +
            ' · ' +
            (p.basis === 'unknown' ? 'Preisart unbekannt' : p.basis === 'gross' ? 'brutto' : 'netto');
        body =
          `<p class="ww-step">${payment ? 3 : 4} · Prüfen und bestätigen</p>` +
          (this.replacesId
            ? '<p class="ww-alert">Dieser Import ersetzt die frühere Übernahme für denselben Zeitraum.</p>'
            : '') +
          '<p><strong>' +
          h(purposeLabels[p.purpose]) +
          '</strong> · ' +
          h(context.periodStart) +
          ' bis ' +
          h(context.periodEnd) +
          ' · ' +
          h(this.p.area()) +
          '</p>' +
          '<p>' +
          v.rows.length +
          ' Zeilen · ' +
          summary +
          '</p>' +
          [...v.errors, ...v.warnings].map(e => '<p class="ww-alert">' + h(e) + '</p>').join('') +
          '<div class="ww-preview"><table><thead><tr><th>Datum</th>' +
          (payment ? '<th>Zahlart</th>' : '<th>Produkt</th><th>Menge</th>') +
          '<th>Status</th><th>' +
          (payment ? 'Betrag' : 'Umsatz') +
          '</th></tr></thead><tbody>' +
          v.rows
            .map(
              r =>
                '<tr><td>' +
                h(r.date ?? 'Gesamtzeitraum') +
                '</td>' +
                ('paymentMethod' in r
                  ? '<td>' + h(r.paymentMethod || 'Offen') + '</td>'
                  : '<td>' + h(r.name) + '</td><td>' + n(r.quantity) + '</td>') +
                '<td>' +
                statusLabel[r.status] +
                '</td><td>' +
                (r.amount === null ? 'Offen' : n(r.amount)) +
                '</td></tr>'
            )
            .join('') +
          '</tbody></table></div>' +
          check('reviewed', 'Ich habe Zeitraum, Zuordnungen, Status und Summen am Original geprüft.', false) +
          check('saveProfile', 'Diese Quelle und ihre Zuordnungen für spätere Dateien speichern', true) +
          (v.errors.length || !v.rows.length ? '' : button('ww-table-confirm', 'Geprüfte Daten übernehmen', '', true)) +
          button('ww-products-back', payment ? 'Spalten ändern' : 'Zuordnungen ändern');
      } else body = this.priceReview(true);
    }
    return `<form data-wizard class="panel">${heading(title, this.original ? '' : 'Herstellerunabhängig · nachvollziehbar · ohne Zusatzdienst')}${body}<div class="actions">${button('ww-cancel', this.original ? 'Zurück' : 'Import abbrechen')}</div></form>`;
  }
  private externalCodes(): string[] {
    const map = this.profile!.columnMap;
    return [
      ...new Set(
        this.grid!.rows.slice(this.header + 1)
          .filter(r => r.some(c => c.text.trim()))
          .map(r => (r[map.productCode ?? -1]?.text || r[map.productName ?? -1]?.text || '').trim())
      )
    ];
  }
  private externalUnit(code: string): string {
    const map = this.profile!.columnMap,
      units = new Set(
        this.grid!.rows.slice(this.header + 1)
          .filter(r => (r[map.productCode ?? -1]?.text || r[map.productName ?? -1]?.text || '').trim() === code)
          .map(r => r[map.unit ?? -1]?.text.trim() || '')
      );
    return units.size === 1 ? [...units][0] : '';
  }
  private priceReview(final: boolean): string {
    const offers = this.p.state().offers.filter(o => o.value.active && o.value.supplierId === this.supplierId);
    if (final)
      return `<p class="ww-step">4 · Preise bestätigen</p><p>${h(this.priceDoc!.name)} · ab ${h(this.validFrom)} · ${this.priceDoc!.lines.length} Artikel. Frühere Bestellungen behalten ihre Preise.</p><div class="ww-preview"><table><thead><tr><th>Lieferartikel</th><th>Netto / Gebinde</th><th>Pfand / Gebinde</th></tr></thead><tbody>${this.priceDoc!.lines.map(l => `<tr><td>${h(offers.find(o => o.value.id === l.offerId)?.value.code)} · ${h(this.p.state().articles.find(a => a.value.id === offers.find(o => o.value.id === l.offerId)?.value.articleId)?.value.name)}</td><td>${money(l.priceNet)}</td><td>${money(l.deposit)}</td></tr>`).join('')}</tbody></table></div>${check('reviewed', 'Gebinde, Nettopreise, Pfand und Gültigkeit am Original geprüft.', false)}${button('ww-table-confirm', 'Preise übernehmen', '', true)}`;
    return `<p class="ww-step">3 · Lieferartikel und Preise</p><p>Häkchen wählen die zu übernehmenden Zeilen. Jeder Preis gilt je bestehendem Gebinde. Nicht passende Artikel zuerst in der Verwaltung anlegen.</p><div class="ww-preview"><table><thead><tr><th>Übernehmen</th><th>Original</th><th>Lieferartikel</th><th>Netto</th><th>Pfand</th></tr></thead><tbody>${this.grid!.rows.slice(
      this.header + 1
    )
      .filter(r => r.some(c => c.text.trim()))
      .map((r, i) => {
        const code = r[this.priceColumns.code]?.text.trim() || '',
          offer = offers.find(o => o.value.code === code);
        const parse = (name: string): string => {
          try {
            return n(importedNumber(r[this.priceColumns[name]], this.profile!.decimalSeparator));
          } catch {
            return r[this.priceColumns[name]]?.text || '';
          }
        };
        return `<tr data-price="${i}"><td>${check('include', 'Übernehmen', true)}</td><td>${h(code)}</td><td>${select(
          'offerId',
          'Lieferartikel',
          [
            ['', 'Bitte wählen'],
            ...offers.map(
              o =>
                [
                  o.value.id,
                  o.value.code +
                    ' · ' +
                    (this.p.state().articles.find(a => a.value.id === o.value.articleId)?.value.name || '') +
                    ' · ' +
                    o.value.packName +
                    ' à ' +
                    n(o.value.packSize)
                ] as [string, string]
            )
          ],
          offer?.value.id || ''
        )}</td><td>${field('priceNet', 'Netto', parse('priceNet'))}</td><td>${field('deposit', 'Pfand', parse('deposit'))}</td></tr>`;
      })
      .join('')}</tbody></table></div>${button('ww-products', 'Preisvorschau prüfen', '', true)}`;
  }
  public async action(action: string): Promise<boolean> {
    if (
      ![
        'ww-file-read',
        'ww-sheet-read',
        'ww-header',
        'ww-columns',
        'ww-products',
        'ww-table-confirm',
        'ww-products-back'
      ].includes(action)
    )
      return false;
    const data = this.data(),
      get = (k: string): string => String(data.get(k) || '').trim();
    if (action === 'ww-file-read') {
      const file = this.form().querySelector<HTMLInputElement>('[name=file]')?.files?.[0];
      const name = this.original?.name ?? file?.name ?? '';
      if ((!this.original && !file) || (this.original?.bytes.length ?? file?.size ?? 0) > 5 * 1024 * 1024)
        throw new Error('Bitte eine CSV- oder XLSX-Datei bis 5 MB wählen.');
      if (!/\.(xlsx|csv)$/i.test(name)) throw new Error('Bitte .xlsx oder .csv wählen.');
      this.bytes = this.original?.bytes ?? new Uint8Array(await file!.arrayBuffer());
      this.hash = this.original?.hash ?? (await sha256(this.bytes));
      this.fileName = name;
      if (this.original && (!get('from') || !get('to')))
        throw new Error('Bitte den Zeitraum der Kassendatei eintragen.');
      const previous = this.p
        .state()
        .ww?.records.find(
          r => r.value.id === get('profile') && r.value.kind === 'profile' && r.value.purpose === get('purpose')
        ) as Stored<Profile> | undefined;
      this.previous = previous;
      this.profile = previous
        ? structuredClone(previous.value)
        : {
            id: crypto.randomUUID(),
            kind: 'profile',
            scope: 'global',
            at: new Date().toISOString(),
            by: this.p.actor,
            confirmed: false,
            name: get('name'),
            purpose: get('purpose') as Profile['purpose'],
            separator: get('separator') as Profile['separator'],
            decimalSeparator: ',',
            dateFormat: 'de',
            basis: 'unknown',
            columnMap: {},
            mappings: [],
            activeStatuses: ['active', 'bezahlt', 'abgeschlossen', 'bestellt'],
            cancelledStatuses: ['cancelled', 'storniert'],
            refundStatuses: ['refund', 'erstattet']
          };
      if (this.mode === 'system') {
        const purpose = get('purpose') as Profile['purpose'];
        if (!importPurposes.includes(purpose)) throw new Error('Bitte die Datenart auswählen.');
        this.profile.purpose = purpose;
      }
      if (!previous && this.mode === 'system' && !this.profile.name) throw new Error('Bitte Quelle / System benennen.');
      this.replacesId = get('replacesId');
      this.title = get('name') || this.profile.name || name;
      this.supplierId = get('supplierId');
      this.validFrom = get('validFrom');
      this.context = {
        seasonId: this.p.season(),
        area: this.p.area(),
        locationId: 'standard',
        sourceId: this.profile.id,
        periodStart: get('from'),
        periodEnd: get('to'),
        currency: get('currency').toUpperCase() || 'EUR'
      };
      if (/\.xlsx$/i.test(name)) {
        this.sheets = await listWorkbookSheets(this.bytes);
        if (this.sheets.length === 1) {
          this.grid = await readWorkbookSheet(this.bytes, this.sheets[0]);
          this.stage = 'columns';
        } else this.stage = 'sheet';
      } else {
        this.grid = readCsv(decodeCsv(this.bytes, get('encoding') as 'utf-8' | 'windows-1252'), this.profile.separator);
        this.stage = 'columns';
      }
    }
    if (action === 'ww-sheet-read') {
      this.grid = await readWorkbookSheet(this.bytes!, get('sheet'));
      this.stage = 'columns';
    }
    if (action === 'ww-header') {
      const header = Number(get('header')) - 1;
      if (!Number.isInteger(header) || header < 0 || header >= this.grid!.rows.length - 1)
        throw new Error('Bitte eine Kopfzeile mit nachfolgenden Daten wählen.');
      this.header = header;
      this.paymentColumnsReviewed = false;
    }
    if (action === 'ww-columns') {
      const p = this.profile!;
      p.decimalSeparator = get('decimal') as Profile['decimalSeparator'];
      if (this.mode === 'system') {
        const payment = p.purpose === 'payments';
        p.columnMap = {};
        for (const [id] of payment ? paymentFields : productFields)
          if (get('col_' + id) !== '') p.columnMap[id] = Number(get('col_' + id));
        if (payment && p.columnMap.amount === undefined) throw new Error('Bitte den Zahlungsbetrag zuordnen.');
        if (payment && new Set(Object.values(p.columnMap)).size !== Object.values(p.columnMap).length)
          throw new Error('Bitte jede Zahlungsspalte nur einmal zuordnen.');
        if (
          !payment &&
          (p.columnMap.quantity === undefined ||
            (p.columnMap.productCode === undefined && p.columnMap.productName === undefined))
        )
          throw new Error('Artikel und Menge zuordnen.');
        p.columnHeaders = Object.fromEntries(
          Object.entries(p.columnMap).map(([key, index]) => [key, this.grid!.rows[this.header][index!]?.text || ''])
        );
        p.dateFormat = get('dateFormat') as Profile['dateFormat'];
        p.basis = payment ? 'unknown' : (get('basis') as Profile['basis']);
        p.activeStatuses = get('active')
          .split('|')
          .map(s => s.trim())
          .filter(Boolean);
        p.cancelledStatuses = get('cancelled')
          .split('|')
          .map(s => s.trim())
          .filter(Boolean);
        p.refundStatuses = get('refund')
          .split('|')
          .map(s => s.trim())
          .filter(Boolean);
        if (data.has('defaultActive')) p.defaultStatus = 'active';
        else delete p.defaultStatus;
        validateDocument(p);
      } else {
        this.priceColumns = {};
        for (const id of ['code', 'priceNet', 'deposit'])
          if (get('col_' + id) !== '') this.priceColumns[id] = Number(get('col_' + id));
        if (this.priceColumns.code === undefined || this.priceColumns.priceNet === undefined)
          throw new Error('Artikelnummer und Nettopreis zuordnen.');
      }
      if (this.mode === 'system' && p.purpose === 'payments') {
        this.paymentColumnsReviewed = true;
        this.preview = previewSystemImport(this.grid!, this.header, p, this.context!, []);
        this.stage = 'review';
      } else this.stage = 'products';
    }
    if (action === 'ww-products-back') this.stage = this.profile?.purpose === 'payments' ? 'columns' : 'products';
    if (action === 'ww-products') {
      if (this.mode === 'system') {
        const codes = this.externalCodes();
        this.profile!.mappings = [
          ...this.profile!.mappings.filter(m => !codes.includes(m.externalCode)),
          ...Array.from(this.form().querySelectorAll<HTMLElement>('[data-map]')).map((r, i) => {
            const value = (name: string): string =>
              r.querySelector<HTMLInputElement | HTMLSelectElement>('[name=' + name + ']')!.value.trim();
            return {
              externalCode: codes[i],
              productId: value('productId'),
              factor: importedNumber({ text: value('factor') }, ',')!,
              unit: value('unit')
            };
          })
        ];
        validateDocument(this.profile!);
        this.preview = previewSystemImport(
          this.grid!,
          this.header,
          this.profile!,
          this.context!,
          this.profile!.mappings.map(m => ({
            sourceId: this.profile!.id,
            externalCode: m.externalCode,
            targetProductId: m.productId,
            factor: m.factor,
            unit: m.unit || ''
          }))
        );
      } else {
        const lines = Array.from(this.form().querySelectorAll<HTMLElement>('[data-price]'))
          .filter(r => r.querySelector<HTMLInputElement>('[name=include]')!.checked)
          .map(r => {
            const value = (name: string): string =>
                r.querySelector<HTMLInputElement | HTMLSelectElement>('[name=' + name + ']')!.value.trim(),
              offerId = value('offerId');
            if (
              !this.p
                .state()
                .offers.some(o => o.value.id === offerId && o.value.supplierId === this.supplierId && o.value.active)
            )
              throw new Error('Lieferartikel jeder gewählten Zeile zuordnen.');
            return {
              offerId,
              offerSignature: offerIdentity(this.p.state().offers.find(o => o.value.id === offerId)!.value),
              priceNet: importedNumber({ text: value('priceNet') }, ','),
              deposit: importedNumber({ text: value('deposit') }, ',')
            };
          });
        this.priceDoc = {
          id: this.importId,
          kind: 'prices',
          scope: 'global',
          at: new Date().toISOString(),
          by: this.p.actor,
          confirmed: true,
          name: this.title,
          supplierId: this.supplierId,
          validFrom: this.validFrom,
          lines
        };
        validateDocument(this.priceDoc);
      }
      this.stage = 'review';
    }
    if (action === 'ww-table-confirm') {
      if (!data.has('reviewed')) throw new Error('Bitte zuerst die Vorschau am Original prüfen und bestätigen.');
      if (this.mode === 'prices') await this.p.commit(this.priceDoc!);
      else {
        if (this.preview!.errors.length) throw new Error('Bitte alle Importfehler klären.');
        const profile = this.profile!,
          rows = this.preview!.rows,
          context = this.context!;
        const common = {
          id: this.importId,
          kind: 'system' as const,
          ...(this.original ? { sourceFile: this.original.source } : {}),
          scope: this.p.season(),
          at: new Date().toISOString(),
          by: this.p.actor,
          confirmed: true,
          name: this.fileName.slice(0, 160),
          area: this.p.area(),
          ...(this.replacesId ? { replacesId: this.replacesId } : {}),
          sourceId: profile.id,
          from: context.periodStart,
          to: context.periodEnd,
          fileHash: this.hash,
          canonicalKey: await canonicalImportKey(profile, context, rows),
          currency: context.currency
        };
        let doc: SystemImport;
        if (profile.purpose === 'payments') {
          doc = {
            ...common,
            purpose: 'payments',
            basis: 'unknown',
            rows: rows.filter((r): r is PaymentRow => 'paymentMethod' in r),
            recipes: []
          };
        } else {
          const products = rows.filter((r): r is SystemRow => 'productId' in r);
          const ids = new Set(products.map(r => r.productId));
          doc = {
            ...common,
            purpose: profile.purpose,
            basis: profile.basis,
            rows: products,
            recipes: documents(this.p.state().ww, 'recipe').filter(r => ids.has(r.id))
          };
        }
        validateDocument(doc);
        await this.p.commit(doc, data.has('saveProfile') ? profile : undefined, this.previous, {
          bytes: this.bytes!,
          extension: this.fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv'
        });
      }
      return true;
    }
    this.p.redraw();
    return true;
  }
}
