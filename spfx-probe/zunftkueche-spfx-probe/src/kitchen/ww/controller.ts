import { readInvoiceText } from '../imports/invoice-reader.ts';
import { invoicePriceProposals } from './invoice-prices.ts';
import { fieldNumber, inputNumber } from '../field-errors.ts';
import { ingredientForm, readIngredient } from '../ingredient-form.ts';
import type { IngredientDraft } from '../ingredient-form';
import type { Article, Offer } from '../model';
import { AREAS, articleAvailable } from '../model.ts';
import { recipeDemand } from './domain.ts';
import { money } from '../markup.ts';
import { withSchedule, scheduledOrder } from '../supplier-orders.ts';
import type { Area, Order, Stored, Workspace } from '../model';
import type {
  PriceList,
  Rule,
  Slot,
  Template,
  WwDocument,
  Recipe,
  Plan,
  EquipmentItem,
  Movement,
  Bill,
  BillCostAssignment,
  BillLine,
  BillLineRole,
  BillType,
  SystemImport
} from './model';
import type { WwStore } from './store';
import type { Screen } from './common';
import { today } from './common.ts';
import { button, h, empty } from '../markup.ts';
import { parseDecimal } from '../domain.ts';
import { documents, purposeLabels } from './model.ts';
import { templateOrders, validateDocument, offerIdentity } from './domain.ts';
import { procurementForm, procurementLine, procurementOverview, templateUse } from './procurement-view.ts';
import {
  operationForm,
  operationLine,
  materialLine,
  operationOverview,
  demandView,
  preparedOrdersView
} from './operations-view.ts';
import {
  procurementSuggestions,
  planProcurementForm,
  mergePlanOrders,
  procurementReservation,
  planAlreadyOrdered
} from './plan-procurement.ts';
import type { ProcurementMode } from './plan-procurement';
import { exportBusinessRows } from './reports.ts';
import { createBackup, verifyBackup } from './backup.ts';
import { TableWizard } from './table-wizard.ts';
import { billsOverview, billForm, billLine, billDetail, billLinkForm } from './bills-view.ts';
import { relatedBills, returnMovements, billTypeLabel, linkedBill } from './bill-accounting.ts';
import { billProposal } from '../imports/bill-proposal.ts';
import { sha256 } from '../imports/identity.ts';
import { inboxView } from './inbox-view.ts';
import type { InboxView } from './inbox-view';
import type { InboxKind, InboxOriginal, SharePointInbox } from './inbox';
export interface Ports {
  root: HTMLElement;
  state: () => Workspace;
  loadWorkspace: () => Promise<Workspace>;
  season: () => string;
  area: () => Area;
  actor: string;
  store: WwStore;
  inbox?: SharePointInbox;
  canLeave: () => boolean;
  resetDirty: () => void;
  markDirty: () => void;
  redraw: () => void;
  mutate: (work: () => Promise<unknown>, message: string, after?: () => void) => Promise<void>;
  ingredient?: (article: Article, offer: Offer, operationId: string, after: () => void) => Promise<void>;
  orders: (orders: Order[], operationId: string) => Promise<unknown>;
}
export interface WwDraftSnapshot {
  screen: Screen | '';
  draft?: WwDocument;
  previous?: Stored<WwDocument>;
  operationId: string;
  sourceText: string;
  billProposals: BillLine[];
  procurementPlan?: Plan;
  procurementMode?: ProcurementMode;
  useTemplate?: Template;
}
const formScreens: Partial<Record<WwDocument['kind'], Screen>> = {
  slot: 'slots',
  rule: 'rules',
  template: 'templates',
  prices: 'prices',
  recipe: 'recipes',
  plan: 'plans',
  equipment: 'equipment',
  movement: 'journal',
  bill: 'bills'
};
export class WwController {
  public screen: Screen | '' = '';
  private draft?: WwDocument;
  private previous?: Stored<WwDocument>;
  private useTemplate?: Template;
  private demand?: Plan;
  private ingredient?: IngredientDraft;
  private wizard?: TableWizard;
  private inboxPage?: InboxView;
  /** Welcher Teil des Eingangs gezeigt wird: Rechnungen bei den Bestellungen, Kassendateien bei der Auswertung. */
  private inboxKind: InboxKind = 'bill';
  private inboxPending?: { value: SystemImport; original: InboxOriginal };
  private procurementPlan?: Plan;
  private procurementMode: ProcurementMode = 'planning';
  private preparedOrderIds: string[] = [];
  private place = '';
  private sourceText = '';
  private previewUrl = '';
  private previewImage?: { image: string; pages: number };
  private billProposals: BillLine[] = [];
  private billReadSequence = 0;
  private billUpload?: {
    bytes: Uint8Array;
    hash: string;
  };
  private billLinking?: Stored<Bill>;
  private billViewing?: Stored<Bill>;
  private operationId: string = crypto.randomUUID();
  /** True while a form was opened from a page outside the workflow screens; cancelling returns there. */
  private openedFromOverview = false;
  public constructor(private readonly p: Ports) {}
  public clear(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = '';
    this.previewImage = undefined;
    this.screen = '';
    this.draft = undefined;
    this.ingredient = undefined;
    this.previous = undefined;
    this.useTemplate = undefined;
    this.demand = undefined;
    this.wizard = undefined;
    this.inboxPage = undefined;
    this.inboxPending = undefined;
    this.procurementPlan = undefined;
    this.procurementMode = 'planning';
    this.preparedOrderIds = [];
    this.sourceText = '';
    this.billProposals = [];
    this.billReadSequence++;
    this.billUpload = undefined;
    this.billLinking = undefined;
    this.billViewing = undefined;
    this.operationId = crypto.randomUUID();
    this.openedFromOverview = false;
  }
  public captureDraft(): WwDraftSnapshot | undefined {
    if (!this.draft && !this.procurementPlan && !this.useTemplate) return undefined;
    return structuredClone({
      screen: this.screen,
      draft: this.draft,
      previous: this.previous,
      operationId: this.operationId,
      sourceText: this.sourceText,
      billProposals: this.billProposals,
      procurementPlan: this.procurementPlan,
      procurementMode: this.procurementMode,
      useTemplate: this.useTemplate
    });
  }
  public restoreDraft(value: WwDraftSnapshot): void {
    this.clear();
    this.screen = value.screen;
    this.draft = value.draft ? { ...value.draft, confirmed: false } : undefined;
    this.previous = value.previous;
    this.operationId = value.operationId;
    this.sourceText = value.sourceText;
    this.billProposals = value.billProposals;
    this.procurementPlan = value.procurementPlan;
    this.procurementMode = value.procurementMode || 'planning';
    this.useTemplate = value.useTemplate;
  }
  public restoreRows(count: number): void {
    const container = this.p.root.querySelector('.ww-lines');
    if (!container || !this.draft) return;
    while (container.children.length > count) container.lastElementChild?.remove();
    while (container.children.length < count) {
      const kind = this.draft.kind;
      const html =
        kind === 'bill'
          ? billLine(this.p.state())
          : kind === 'recipe' || kind === 'plan'
            ? operationLine(kind, this.p.state())
            : kind === 'template' || kind === 'prices'
              ? procurementLine(kind, this.p.state(), this.draft.supplierId)
              : '';
      if (!html) break;
      container.insertAdjacentHTML('beforeend', html);
    }
  }
  public restoreMaterialRows(count: number): void {
    if (this.draft?.kind !== 'plan') return;
    const container = this.p.root.querySelector('.ww-materials');
    if (!container) return;
    while (container.children.length > count) container.lastElementChild?.remove();
    while (container.children.length < count)
      container.insertAdjacentHTML('beforeend', materialLine(this.p.state(), this.draft.scope));
    if (count) container.closest('details')!.open = true;
  }
  private docs(): WwDocument[] {
    return (this.p.state().ww?.records || []).map(r => r.value);
  }
  public render(): string {
    if (this.preparedOrderIds.length) return preparedOrdersView(this.p.state(), this.preparedOrderIds);
    if (!this.p.state().ww?.ready)
      return `<section class="panel"><h1>Warenwirtschaft erweitern</h1><p>Die neuen Bereiche speichern ihre Daten getrennt von euren bisherigen Bestellungen. Die vorhandenen Daten bleiben erhalten.</p>${button('ww-setup', 'Neue Bereiche einrichten', '', true)}</section>`;
    if (this.billLinking) return billLinkForm(this.billLinking.value, this.p.state());
    if (this.ingredient) return ingredientForm(this.ingredient, this.p.state(), true);
    if (this.procurementPlan) return planProcurementForm(this.procurementPlan, this.p.state(), this.procurementMode);
    if (this.wizard) return this.wizard.render();
    if (this.billViewing) return billDetail(this.billViewing, this.p.state());
    if (this.draft?.kind === 'bill')
      return billForm(
        this.draft,
        this.p.state(),
        this.sourceText,
        this.billProposals,
        this.previewUrl,
        this.previewImage,
        !!this.inboxPage
      );
    if (this.screen === 'bills') return billsOverview(this.p.state(), this.p.area());
    if (this.screen === 'systems') return this.systems();
    if (this.demand) return demandView(this.demand, this.p.state());
    if (this.draft && ['recipe', 'plan', 'equipment', 'movement'].includes(this.draft.kind))
      return operationForm(this.draft as Recipe | Plan | EquipmentItem | Movement, this.p.state());
    if (this.inboxPending) {
      const { value, original } = this.inboxPending;
      return (
        '<section class="panel"><h1>Kassenimport fortsetzen</h1><p>' +
        h(original.name) +
        '</p><p>' +
        h(value.from) +
        ' bis ' +
        h(value.to) +
        ' · ' +
        value.rows.length +
        ' Zeilen · ' +
        h(value.area) +
        '</p><div class="actions">' +
        button('ww-inbox-resume-system', 'Geprüften Import abschließen', '', true) +
        button('ww-cancel', 'Zurück') +
        '</div></section>'
      );
    }
    if (this.screen === 'inbox')
      return this.inboxPage
        ? inboxView(this.inboxPage, this.p.state(), this.p.area(), this.inboxKind)
        : empty('Bitte eine Saison auswählen.');
    if (this.useTemplate) return templateUse(this.useTemplate, documents(this.p.state().ww, 'slot'), this.p.state());
    if (this.draft && ['slot', 'rule', 'template', 'prices'].includes(this.draft.kind))
      return procurementForm(this.draft as Slot | Rule | Template | PriceList, this.p.state());
    return (
      procurementOverview(this.screen as Screen, this.docs(), this.p.state(), this.p.area()) ||
      operationOverview(this.screen, this.p.state(), this.p.area(), this.p.season(), this.place) ||
      empty('Diesen Bereich bitte über die Navigation öffnen.')
    );
  }
  public renderPlanning(): string {
    this.screen = 'recipes';
    return this.render();
  }
  /** Identifies the page render() shows. Redraws of the same page keep their scroll position; a different page starts at the top. */
  public pageKey(): string {
    return [
      this.screen,
      this.preparedOrderIds.length ? 'prepared' : '',
      this.billLinking ? 'link:' + this.billLinking.value.id : '',
      this.ingredient ? 'ingredient' : '',
      this.procurementPlan ? 'procure:' + this.procurementPlan.id : '',
      this.wizard ? 'wizard:' + this.wizard.pageKey() : '',
      this.billViewing ? 'bill:' + this.billViewing.value.id : '',
      this.draft ? 'draft:' + this.draft.kind + ':' + this.draft.id : '',
      this.demand ? 'demand:' + this.demand.id : '',
      this.inboxPending ? 'pending' : '',
      this.useTemplate ? 'use:' + this.useTemplate.id : ''
    ].join('|');
  }
  public billForOrder(id: string): void {
    const order = this.p.state().orders.find(o => o.value.id === id)?.value;
    if (!order) throw new Error('Bestellung fehlt.');
    this.clear();
    this.screen = 'bills';
    this.draft = {
      ...(this.create('bill') as Bill),
      supplierId: order.supplierId,
      orderIds: [id],
      name: 'Rechnung · ' + order.supplierName
    };
  }
  private readRecipe(form: HTMLFormElement, original: Recipe): Recipe {
    const data = new FormData(form),
      get = (n: string): string => String(data.get(n) || '').trim();
    return {
      ...original,
      name: get('name'),
      category: get('category'),
      yield: parseDecimal(get('yield'))!,
      salePriceGross: parseDecimal(get('salePriceGross')),
      confirmed: data.has('confirmed'),
      ingredients: Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => {
        const articleId = row.querySelector<HTMLSelectElement>('[name=articleId]')!.value,
          article = this.p.state().articles.find(a => a.value.id === articleId)?.value;
        return {
          articleId,
          quantity: parseDecimal(row.querySelector<HTMLInputElement>('[name=quantity]')!.value) ?? 0,
          unit: article?.unit || ''
        };
      })
    };
  }
  public billContextChanged(field: string): void {
    if (this.draft?.kind !== 'bill') return;
    const form = this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-bill]');
    if (!form) return;
    if (field === 'supplierId') {
      for (const input of Array.from(form.querySelectorAll<HTMLInputElement>('[name^=order_]'))) input.checked = false;
      const original = form.querySelector<HTMLSelectElement>('[name=creditForId]');
      if (original) original.value = '';
    }
    this.draft = this.readBill(form, this.draft);
    this.draft.confirmed = false;
    this.p.redraw();
  }
  public profileChosen(id: string): void {
    this.wizard?.useProfile(id);
  }
  public updateCosts(): void {
    this.updateProcurementTotals();
    const form = this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-recipe]'),
      box = form?.querySelector('[data-recipe-cost]');
    if (!form || !box || this.draft?.kind !== 'recipe') return;
    try {
      const r = this.readRecipe(form, this.draft),
        d = recipeDemand({ ...r, confirmed: true }, 1, this.p.state(), documents(this.p.state().ww, 'prices'));
      const missing = d.rows.filter(row => row.costNet === null).map(row => row.name);
      box.textContent = !r.ingredients.length
        ? 'Noch keine Zutat. Mit Zutaten erscheint hier der Wareneinsatz.'
        : missing.length
          ? 'Wareneinsatz noch offen. Preis fehlt bei: ' + missing.join(', ') + '. Preise pflegt ihr unter Lieferanten.'
          : 'Wareneinsatz netto je Portion: ' +
            money(d.costNet) +
            ' · gesamtes Rezept: ' +
            money(
              recipeDemand({ ...r, confirmed: true }, r.yield, this.p.state(), documents(this.p.state().ww, 'prices'))
                .costNet
            ) +
            ' · Verkauf brutto: ' +
            money(r.salePriceGross);
    } catch {
      box.textContent = 'Zutatenmengen und Portionen ergänzen, um den Wareneinsatz zu sehen.';
    }
  }
  private updateProcurementTotals(): void {
    if (!this.procurementPlan) return;
    for (const row of Array.from(this.p.root.querySelectorAll<HTMLElement>('[data-allocation]'))) {
      const total = row.querySelector('[data-remaining]');
      if (!total) continue;
      try {
        const stock = parseDecimal(row.querySelector<HTMLInputElement>('[name=stockUse]')!.value) || 0;
        const incoming = parseDecimal(row.querySelector<HTMLInputElement>('[name=incomingUse]')!.value) || 0;
        const offerId = row.querySelector<HTMLSelectElement>('[name=offerId]')!.value;
        const offer = this.p.state().offers.find(o => o.value.id === offerId)?.value;
        const remaining = Math.max(0, Number(row.dataset.required) - stock - incoming);
        row.querySelector('[data-stock-use]')!.textContent = stock.toLocaleString('de-DE');
        row.querySelector('[data-incoming-use]')!.textContent = incoming.toLocaleString('de-DE');
        total.textContent =
          'Zusätzlich benötigt: ' +
          remaining.toLocaleString('de-DE') +
          (remaining
            ? offer
              ? ' · ' + Math.ceil(remaining / offer.packSize) + ' Gebinde'
              : ' · Liefergebinde auswählen'
            : '');
      } catch {
        total.textContent = 'Anrechnung bitte prüfen.';
      }
    }
  }
  public open(screen: Screen): void {
    this.clear();
    this.screen = screen;
    this.p.redraw();
  }
  public openSupplier(screen: 'rules' | 'prices', supplierId: string): void {
    this.clear();
    this.screen = screen;
    if (screen === 'rules') {
      const old = this.p.state().ww?.records.find(r => r.value.kind === 'rule' && r.value.supplierId === supplierId);
      if (old) {
        this.previous = old;
        this.draft = structuredClone(old.value);
      } else this.draft = { ...(this.create('rule') as Rule), supplierId };
    } else this.draft = { ...(this.create('prices') as PriceList), supplierId };
    this.p.redraw();
  }
  private create(kind: WwDocument['kind']): WwDocument {
    const common = {
      id: crypto.randomUUID(),
      scope: ['slot', 'plan', 'equipment', 'bill', 'movement', 'system'].includes(kind) ? this.p.season() : 'global',
      at: new Date().toISOString(),
      by: this.p.actor,
      confirmed: false
    };
    const supplierId = this.p.state().suppliers.find(s => s.value.active)?.value.id || '';
    if (kind === 'slot')
      return {
        ...common,
        kind,
        name: '',
        date:
          documents(this.p.state().ww, 'slot')[0]?.date ||
          this.p.state().seasons.find(s => s.value.id === this.p.season())?.value.year + '-02-01',
        time: '',
        place: this.p.area()
      };
    if (kind === 'rule')
      return {
        ...common,
        kind,
        supplierId,
        weekdays: [3, 5, 6, 0],
        leadDays: 1,
        cutoff: '',
        minNet: null,
        feeNet: null,
        note: ''
      };
    if (kind === 'template') return { ...common, kind, name: '', supplierId, area: this.p.area(), lines: [], note: '' };
    if (kind === 'prices') return { ...common, kind, name: '', supplierId, validFrom: today(), lines: [] };
    if (kind === 'recipe')
      return {
        ...common,
        kind,
        familyId: common.id,
        name: '',
        category: '',
        yield: 1,
        salePriceGross: null,
        ingredients: []
      };
    if (kind === 'plan')
      return {
        ...common,
        kind,
        name: '',
        area: this.p.area(),
        date:
          documents(this.p.state().ww, 'slot')[0]?.date ||
          this.p.state().seasons.find(s => s.value.id === this.p.season())?.value.year + '-02-01',
        lines: [],
        note: ''
      };
    if (kind === 'equipment')
      return { ...common, kind, area: this.p.area(), name: '', needed: 1, available: null, action: 'prüfen', note: '' };
    if (kind === 'movement')
      return {
        ...common,
        kind,
        area: this.p.area(),
        articleId: this.p.state().articles.find(a => a.value.active)?.value.id || '',
        quantity: 0,
        unit: '',
        type: 'waste',
        place: '',
        toArea: null,
        toPlace: '',
        note: ''
      };
    if (kind === 'bill')
      return {
        ...common,
        kind,
        name: '',
        supplierId: '',
        number: '',
        date: today(),
        area: this.p.area(),
        orderIds: [],
        fileHash: '',
        fileName: '',
        attachment: '',
        net: null,
        tax: null,
        gross: null,
        adjustmentNet: 0,
        lines: [],
        note: ''
      };
    throw new Error('Vorgangsart ist noch nicht ausgewählt.');
  }
  private openWizard(mode: 'system' | 'prices', original?: InboxOriginal): void {
    const operationId = this.operationId;
    const inbox = original ? this.inboxPage : undefined;
    this.wizard = new TableWizard(
      mode,
      {
        root: this.p.root,
        state: this.p.state,
        season: this.p.season,
        area: this.p.area,
        actor: this.p.actor,
        redraw: this.p.redraw,
        commit: async (doc, profile, previous, file) => {
          await this.p.mutate(
            async () => {
              if (profile) await this.p.store.save(profile, previous, operationId + '-profile');
              if (doc.kind === 'system' && file)
                await this.p.store.saveSystemWithOriginal(doc, file.bytes, file.extension, operationId);
              else await this.p.store.save(doc, undefined, operationId);
            },
            'Geprüfte Datei übernommen und nachgelesen.',
            () => {
              this.inboxPage = inbox;
              this.screen = inbox ? 'inbox' : doc.kind === 'prices' ? 'prices' : 'systems';
            }
          );
        }
      },
      original
    );
    this.p.redraw();
  }
  private async refreshInbox(create?: InboxKind): Promise<void> {
    const season = this.p.state().seasons.find(r => r.value.id === this.p.season())?.value;
    const connection = this.p.inbox;
    if (!season || !connection) throw new Error('Bitte die Saison und den SharePoint-Zugriff prüfen.');
    const duplicates = this.inboxPage?.duplicates ?? new Map<string, string>();
    const view: InboxView = { season, folders: {}, errors: {}, duplicates, busy: true };
    this.inboxPage = view;
    this.p.redraw();
    try {
      await Promise.all(
        (['bill', 'system'] as const).map(async kind => {
          try {
            if (create === kind && !season.archived) await connection.ensure(kind, season.year);
            view.folders[kind] = await connection.list(kind, season.year);
          } catch (error) {
            view.errors[kind] = error instanceof Error ? error.message : 'Jahresordner nicht lesbar.';
          }
        })
      );
    } finally {
      this.finishInboxLoad(view);
    }
  }
  private finishInboxLoad(view: InboxView): void {
    if (this.inboxPage !== view) return;
    view.busy = false;
    this.p.redraw();
  }
  private async openInboxFile(id: string): Promise<void> {
    const [kind, fileId] = id.split('|');
    const view = this.inboxPage;
    const connection = this.p.inbox;
    if (
      (kind !== 'bill' && kind !== 'system') ||
      !view ||
      !connection ||
      view.busy ||
      view.season.archived ||
      !this.p.canLeave()
    )
      return;
    const file = view.folders[kind]?.files.find(row => row.id === fileId);
    if (!file) throw new Error('Datei fehlt. Bitte den Eingang aktualisieren.');
    const matching = this.p
      .state()
      .ww?.records.find(
        row =>
          row.value.kind === kind &&
          row.value.scope === view.season.id &&
          row.value.sourceFile?.id === file.id &&
          row.value.sourceFile.version === file.version
      );
    if (matching?.value.confirmed) return;
    if (matching && 'area' in matching.value && matching.value.area !== this.p.area())
      throw new Error('Bitte für diese Prüfung zuerst den zugehörigen Bereich auswählen.');
    view.busy = true;
    this.p.redraw();
    let original: InboxOriginal;
    try {
      const bytes = await connection.read(kind, view.season.year, file);
      original = { name: file.name, source: { id: file.id, version: file.version }, bytes, hash: await sha256(bytes) };
      const duplicate =
        kind === 'bill'
          ? await this.p.store.findConfirmedBillByHash(original.hash)
          : documents(this.p.state().ww, 'system').find(
              doc =>
                doc.confirmed &&
                doc.scope === view.season.id &&
                doc.fileHash === original.hash &&
                doc.area === this.p.area()
            );
      if (this.inboxPage !== view) return;
      if (duplicate) {
        const duplicateSeason =
          duplicate.scope !== view.season.id
            ? this.p.state().seasons.find(row => row.value.id === duplicate.scope)?.value.name || 'andere Saison'
            : '';
        const name = duplicate.kind === 'bill' ? duplicate.fileName || duplicate.name : duplicate.name;
        view.duplicates.set(file.id + ':' + file.version, [name, duplicateSeason].filter(Boolean).join(' · '));
        return;
      }
    } finally {
      this.finishInboxLoad(view);
    }
    this.operationId = crypto.randomUUID();
    if (kind === 'system') {
      if (matching?.value.kind === 'system') {
        if (matching.value.fileHash !== original.hash || !matching.value.originalExtension)
          throw new Error(
            'Das Original passt nicht zum unvollständigen Import. Bitte den gespeicherten Vorgang prüfen.'
          );
        this.inboxPending = { value: matching.value, original };
        this.p.redraw();
      } else this.openWizard('system', original);
      return;
    }
    if (new TextDecoder().decode(original.bytes.slice(0, 5)) !== '%PDF-') throw new Error('Datei ist kein PDF.');
    this.previous = matching;
    const bill = matching?.value.kind === 'bill' ? structuredClone(matching.value) : (this.create('bill') as Bill);
    this.draft = { ...bill, sourceFile: original.source, fileName: original.name };
    this.p.redraw();
    const form = this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-bill]')!;
    await this.readBillPdf(
      form,
      original.bytes,
      original.name,
      original.hash,
      ++this.billReadSequence,
      false,
      original.source
    );
  }
  private async readBillPdf(
    form: HTMLFormElement,
    bytes: Uint8Array,
    fileName: string,
    hash: string,
    reading: number,
    forceOcr: boolean,
    source?: Bill['sourceFile']
  ): Promise<void> {
    if (this.draft?.kind !== 'bill') return;
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Datei ist kein PDF.');
    const dateEdited = form.querySelector<HTMLInputElement>('[name=date]')?.dataset.userEdited === 'true';
    const priorHash = this.draft.fileHash;
    const typeEdited =
      !!this.draft.billType || form.querySelector<HTMLSelectElement>('[name=billType]')?.dataset.userEdited === 'true';
    this.draft = this.readBill(form, this.draft);
    this.draft.confirmed = false;
    if (priorHash !== hash) {
      delete this.draft.needsSeparateFiles;
      delete this.draft.scanNumberReview;
    }
    this.billProposals = [];
    this.billUpload = { bytes, hash };
    if (source) this.draft.sourceFile = source;
    else delete this.draft.sourceFile;
    this.draft.fileHash = this.billUpload.hash;
    this.draft.fileName = fileName.length <= 240 ? fileName : fileName.slice(0, 236) + '.pdf';
    this.draft.attachment = '';
    this.previewImage = undefined;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' }));
    let text = '',
      usedOcr = forceOcr;
    const progress = (value: string): void => {
      if (reading !== this.billReadSequence) return;
      const box = form.querySelector<HTMLElement>('[data-pdf-progress]');
      if (box) {
        box.hidden = false;
        box.textContent = value;
      }
    };
    for (const el of Array.from(form.querySelectorAll<HTMLInputElement>('input,select,textarea,button')))
      if (el.dataset.action !== 'ww-cancel') el.disabled = true;
    try {
      if (forceOcr) {
        const scanButton = form.querySelector<HTMLButtonElement>('[data-action=ww-pdf-ocr]');
        if (scanButton) {
          scanButton.disabled = true;
          scanButton.textContent = 'Texterkennung läuft …';
        }
        const reader = await import(/* webpackChunkName: 'kitchen-scan-reader' */ '../imports/scan-reader.ts');
        text = await reader.readScannedPdfText(bytes, progress);
      } else {
        const result = await readInvoiceText(bytes, progress);
        text = result.text;
        usedOcr = result.usedOcr;
      }
    } catch (error) {
      if (reading !== this.billReadSequence || this.draft?.kind !== 'bill') return;
      this.sourceText = error instanceof Error ? error.message : 'PDF manuell erfassen.';
      this.p.markDirty();
      this.p.redraw();
      return;
    }
    if (reading !== this.billReadSequence || this.draft?.kind !== 'bill') return;
    progress('Originalvorschau wird vorbereitet …');
    try {
      const preview = await (
        await import(/* webpackChunkName: 'kitchen-pdf-reader' */ '../imports/pdf-reader.ts')
      ).renderPdfPreview(bytes);
      if (reading !== this.billReadSequence || this.draft?.kind !== 'bill') return;
      this.previewImage = preview;
    } catch {
      /* Original remains available as PDF even without a renderable page. */
    }
    if (reading !== this.billReadSequence || this.draft?.kind !== 'bill') return;
    const proposal = billProposal(text, { usedOcr });
    if (
      proposal.needsSeparateFiles &&
      !(proposal.scanNumberConflict && this.draft.scanNumberReview?.status === 'reviewed')
    ) {
      this.draft.needsSeparateFiles = true;
      if (proposal.scanNumberConflict) this.draft.scanNumberReview = { status: 'open' };
      else delete this.draft.scanNumberReview;
    }
    const area = this.draft.area;
    if (proposal.costAreas?.some(label => label !== area) && this.draft.costAssignment?.mode !== 'split')
      this.draft.costAssignment = { mode: 'open' };
    if (this.draft.needsSeparateFiles || this.draft.scanNumberReview?.status === 'reviewed') {
      if (!this.draft.name) this.draft.name = fileName.slice(0, 160);
      this.sourceText = this.draft.scanNumberReview ? '' : text;
      this.p.markDirty();
      this.p.redraw();
      return;
    }
    if (proposal.billType && !typeEdited && this.draft.gross === null) this.draft.billType = proposal.billType;
    this.billProposals = this.draft.lines.length ? [] : proposal.lines;
    if (!this.draft.number) this.draft.number = proposal.number;
    if (proposal.date && !dateEdited && this.draft.date === today()) this.draft.date = proposal.date;
    if (!this.draft.name) this.draft.name = fileName.slice(0, 160);
    if (this.draft.net === null) this.draft.net = proposal.net;
    if (this.draft.tax === null) this.draft.tax = proposal.tax;
    if (this.draft.gross === null) this.draft.gross = proposal.gross;
    this.sourceText =
      (usedOcr ? 'Bildscan-Texterkennung: Alle Angaben und Positionen am Original prüfen.\n\n' : '') + text;
    this.p.markDirty();
    this.p.redraw();
  }
  public async action(action: string, id: string, target?: HTMLElement): Promise<void> {
    if (this.wizard && (await this.wizard.action(action))) return;
    if (action === 'ww-ingredient') {
      if (this.draft?.kind !== 'recipe') return;
      this.draft = this.readRecipe(
        this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-recipe]')!,
        this.draft
      );
      this.ingredient = {
        articleId: crypto.randomUUID(),
        offerId: crypto.randomUUID(),
        supplierId: this.p.state().suppliers.find(s => s.value.active)?.value.id || ''
      };
      this.p.redraw();
      return;
    }
    if (action === 'ww-ingredient-cancel') {
      this.ingredient = undefined;
      this.p.redraw();
      this.updateCosts();
      return;
    }
    if (action === 'ww-open' && (id === 'inbox' || id === 'inbox-system')) {
      if (!this.p.canLeave()) return;
      this.clear();
      this.inboxKind = id === 'inbox' ? 'bill' : 'system';
      this.screen = 'inbox';
      await this.refreshInbox();
      return;
    }
    if (action === 'ww-inbox-refresh' || action === 'ww-inbox-create') {
      if (action === 'ww-inbox-create') {
        if (id !== 'bill' && id !== 'system') return;
        if (!this.inboxPage || this.inboxPage.busy || this.inboxPage.season.archived) return;
        await this.refreshInbox(id);
      } else if (!this.inboxPage?.busy) await this.refreshInbox();
      return;
    }
    if (action === 'ww-inbox-file') {
      await this.openInboxFile(id);
      return;
    }
    if (action === 'ww-inbox-resume-system' && this.inboxPending) {
      const { value, original } = this.inboxPending,
        inbox = this.inboxPage,
        operationId = this.operationId;
      await this.p.mutate(
        () =>
          this.p.store.saveSystemWithOriginal(
            { ...value, confirmed: true },
            original.bytes,
            value.originalExtension!,
            operationId
          ),
        'Geprüfte Datei übernommen und nachgelesen.',
        () => {
          this.inboxPage = inbox;
          this.screen = 'inbox';
        }
      );
      return;
    }
    if (action === 'ww-system-new' || action === 'ww-price-import') {
      if (!this.p.canLeave()) return;
      this.openWizard(action === 'ww-price-import' ? 'prices' : 'system');
      return;
    }
    if (action === 'ww-bill-link') {
      this.screen = 'bills';
      this.billLinking = this.p.state().ww?.records.find(r => r.value.id === id && r.value.kind === 'bill') as
        Stored<Bill> | undefined;
      this.p.redraw();
      return;
    }
    if (action === 'ww-bill-view') {
      this.screen = 'bills';
      if (!this.p.canLeave()) return;
      this.billViewing = this.p.state().ww?.records.find(r => r.value.id === id && r.value.kind === 'bill') as
        Stored<Bill> | undefined;
      this.p.redraw();
      return;
    }
    if (action === 'ww-bill-original') {
      const row = this.p.state().ww?.records.find(r => r.value.id === id && r.value.kind === 'bill');
      if (!row) throw new Error('Beleg fehlt.');
      const bytes = await this.p.store.readOriginal(row),
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })),
        a = document.createElement('a');
      a.href = url;
      a.download = (row.value as Bill).fileName || 'Original.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === 'ww-bill-single') {
      const bill = this.draft;
      if (bill?.kind !== 'bill' || bill.scanNumberReview?.status !== 'open' || !bill.needsSeparateFiles) return;
      if (this.billUpload?.hash !== bill.fileHash && !bill.attachment)
        throw new Error('Bitte das PDF-Original zur Prüfung erneut auswählen.');
      const reason = this.p.root.querySelector<HTMLInputElement>('[name=singleDocumentReason]')?.value.trim() ?? '';
      if (!reason || reason.length > 300) throw new Error('Bitte eine Begründung mit bis zu 300 Zeichen eingeben.');
      this.draft = {
        ...bill,
        confirmed: false,
        number: '',
        date: '',
        net: null,
        tax: null,
        gross: null,
        adjustmentNet: 0,
        lines: [],
        scanNumberReview: { status: 'reviewed', reason, by: this.p.actor, at: new Date().toISOString() }
      };
      delete this.draft.needsSeparateFiles;
      this.billProposals = [];
      this.sourceText = '';
      this.p.markDirty();
      this.p.redraw();
      this.p.root.querySelector<HTMLInputElement>('[name=number]')?.focus();
      return;
    }
    if (action === 'ww-pdf-read' || action === 'ww-pdf-ocr') {
      const form = this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-bill]');
      if (!form || this.draft?.kind !== 'bill') return;
      const reading = ++this.billReadSequence;
      const file = form.querySelector<HTMLInputElement>('[name=pdf]')?.files?.[0];
      const loaded = this.billUpload;
      if ((file && (file.size > 8 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf'))) || (!file && !loaded))
        throw new Error('PDF bis 8 MB auswählen.');
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : loaded!.bytes;
      const hash = file ? await sha256(bytes) : loaded!.hash;
      if (reading !== this.billReadSequence || this.draft?.kind !== 'bill') return;
      if (this.draft.scanNumberReview?.status === 'open' && hash !== this.draft.fileHash)
        throw new Error('Bitte dieselbe Originaldatei auswählen.');
      await this.readBillPdf(
        form,
        bytes,
        file?.name ?? this.draft.fileName,
        hash,
        reading,
        action === 'ww-pdf-ocr',
        file && hash !== this.draft.fileHash ? undefined : this.draft.sourceFile
      );
      return;
    }
    if (action === 'ww-bill-accept-lines') {
      const form = this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-bill]');
      if (!form || this.draft?.kind !== 'bill' || !this.billProposals.length) return;
      this.draft = this.readBill(form, this.draft);
      this.draft.lines.push(...this.billProposals.map(line => ({ ...line, id: crypto.randomUUID() })));
      this.billProposals = [];
      this.p.markDirty();
      this.p.redraw();
      return;
    }
    if (action === 'ww-export' || action === 'ww-backup') {
      const backup = action === 'ww-backup';
      let blob: Blob;
      if (backup) {
        const archive = await createBackup(await this.p.loadWorkspace(), this.p.store, this.p.loadWorkspace);
        await verifyBackup(archive);
        blob = new Blob([new Uint8Array(archive).buffer], { type: 'application/zip' });
      } else
        blob = new Blob([exportBusinessRows(this.p.state(), this.p.season(), this.p.area())], {
          type: 'text/csv;charset=utf-8'
        });
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = backup ? 'Zunftkueche-Sicherung-' + today() + '.zip' : 'Zunftkueche-' + this.p.season() + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }
    if (action === 'ww-import-original') {
      const row = this.p.state().ww?.records.find(r => r.value.id === id);
      if (!row || row.value.kind !== 'system' || row.value.confirmed || !row.value.originalExtension)
        throw new Error('Unvollständiger Importentwurf fehlt.');
      const input = Array.from(this.p.root.querySelectorAll<HTMLInputElement>('[data-import-original]')).find(
        el => el.dataset.importOriginal === id
      );
      const file = input?.files?.[0];
      if (!file) throw new Error('Bitte dieselbe Originaldatei erneut auswählen.');
      if (file.size > 8 * 1024 * 1024) throw new Error('Originaldatei ist zu groß (maximal 8 MB).');
      const value = { ...row.value, confirmed: true },
        bytes = new Uint8Array(await file.arrayBuffer()),
        operationId = this.operationId;
      await this.p.mutate(
        () => this.p.store.saveSystemWithOriginal(value, bytes, value.originalExtension!, operationId),
        'Original ergänzt; Import abgeschlossen und nachgelesen.',
        () => {
          this.screen = 'systems';
        }
      );
      return;
    }
    if (action === 'ww-resume-import') {
      const operationId = this.operationId;
      await this.p.mutate(
        () => this.p.store.resumeImport(id, operationId),
        'Import abgeschlossen und nachgelesen.',
        () => {
          this.screen = 'systems';
        }
      );
      return;
    }
    if (action === 'ww-menu-plan') {
      if (!this.p.canLeave()) return;
      const source = documents(this.p.state().ww, 'system').find(
        d => d.id === id && d.confirmed && d.purpose === 'menuOrders'
      );
      if (source?.purpose !== 'menuOrders') throw new Error('Bestätigter Menüimport fehlt.');
      const dates = [...new Set(source.rows.filter(r => r.status === 'active').map(r => r.date))];
      const operationId = this.operationId;
      const plans = dates.map(date => {
        const sums = new Map<string, number>();
        for (const r of source.rows.filter(r => r.date === date && r.status === 'active'))
          sums.set(r.productId, (sums.get(r.productId) || 0) + r.quantity);
        return {
          id: 'menu-plan:' + source.id + ':' + date,
          kind: 'plan' as const,
          scope: source.scope,
          at: source.at,
          by: this.p.actor,
          confirmed: false,
          name: 'Menübedarf · ' + date,
          area: source.area,
          date,
          lines: [...sums].map(([recipeId, portions]) => ({ recipeId, portions })),
          note:
            'Grundlage: Menüimport ' +
            source.id +
            '. Keine zusätzliche manuelle Portionsplanung für dieselben Vorbestellungen addieren.'
        };
      });
      await this.p.mutate(
        async () => {
          for (const plan of plans) await this.p.store.save(plan, undefined, operationId + '-' + plan.date);
        },
        'Menübedarf als getrennte Tagespläne übernommen.',
        () => {
          this.screen = 'plans';
        }
      );
      return;
    }
    if (action === 'ww-place') {
      if (!this.p.canLeave()) return;
      this.place = id;
      this.p.redraw();
      return;
    }
    if (action === 'ww-open') {
      if (this.p.canLeave()) this.open(id as Screen);
      return;
    }
    if (action === 'ww-setup') {
      const screen = this.screen;
      await this.p.mutate(
        () => this.p.store.initialize(),
        'Neue Bereiche eingerichtet und geprüft.',
        () => {
          this.screen = screen;
        }
      );
      return;
    }
    if (action === 'ww-cancel') {
      const screen = this.openedFromOverview ? '' : this.screen,
        inbox = this.inboxPage;
      this.clear();
      this.screen = screen;
      this.inboxPage = inbox;
      this.p.resetDirty();
      this.p.redraw();
      return;
    }
    if (action === 'ww-new' || action === 'ww-transfer') {
      if (!this.p.canLeave()) return;
      const kind = (action === 'ww-transfer' ? 'movement' : id) as WwDocument['kind'];
      const draft = this.create(kind);
      /* Übergabe: Ware geht aus dem aktuellen Bereich in einen anderen, z. B. von der Küche zum Marktplatz. */
      if (action === 'ww-transfer' && draft.kind === 'movement') {
        draft.type = 'transfer';
        draft.toArea = AREAS.find(area => area !== draft.area) ?? draft.area;
      }
      // The main view only shows workflow forms while a workflow screen is active.
      // A button on another page (e.g. Bestand) therefore has to select the matching screen first.
      if (!this.screen) {
        const home = formScreens[kind];
        if (!home) throw new Error('Diesen Vorgang bitte über die Navigation öffnen.');
        this.screen = home;
        this.openedFromOverview = true;
      }
      this.previous = undefined;
      this.draft = draft;
      this.operationId = crypto.randomUUID();
      this.p.redraw();
      return;
    }
    if (action === 'ww-edit') {
      if (!this.p.canLeave()) return;
      const previous = this.p.state().ww?.records.find(r => r.value.id === id);
      if (!previous) throw new Error('Vorgang nicht gefunden.');
      this.previous = previous;
      this.draft = structuredClone(previous.value);
      if (this.draft.confirmed && this.draft.kind === 'recipe') {
        this.draft = {
          ...this.draft,
          id: crypto.randomUUID(),
          confirmed: false,
          at: new Date().toISOString(),
          by: this.p.actor
        };
        this.previous = undefined;
      }
      if (this.draft.confirmed && this.draft.kind === 'prices') {
        this.draft = {
          ...this.draft,
          id: crypto.randomUUID(),
          confirmed: false,
          at: new Date().toISOString(),
          by: this.p.actor,
          name: this.draft.name + ' · neu'
        };
        this.previous = undefined;
      }
      this.operationId = crypto.randomUUID();
      this.p.redraw();
      return;
    }
    if (action === 'ww-add-material' && this.draft?.kind === 'plan') {
      const container = this.p.root.querySelector('.ww-materials')!;
      container.insertAdjacentHTML('beforeend', materialLine(this.p.state(), this.draft.scope));
      container.lastElementChild?.querySelector<HTMLSelectElement>('select')?.focus();
      this.p.markDirty();
      return;
    }
    if (action === 'ww-add') {
      const form = this.p.root.querySelector<HTMLFormElement>('form.ww-editor');
      if (!form || !this.draft) return;
      if (this.draft.kind === 'bill') {
        form.querySelector('.ww-lines')!.insertAdjacentHTML('beforeend', billLine(this.p.state()));
        this.p.markDirty();
        return;
      }
      if (this.draft.kind === 'recipe' || this.draft.kind === 'plan') {
        form
          .querySelector('.ww-lines')!
          .insertAdjacentHTML('beforeend', operationLine(this.draft.kind, this.p.state()));
        this.updateCosts();
        this.p.markDirty();
        return;
      }
      if (!['template', 'prices'].includes(this.draft.kind)) return;
      const supplierId = String(new FormData(form).get('supplierId') || '');
      form
        .querySelector('.ww-lines')!
        .insertAdjacentHTML(
          'beforeend',
          procurementLine(this.draft.kind as 'template' | 'prices', this.p.state(), supplierId)
        );
      this.p.markDirty();
      return;
    }
    if (action === 'ww-remove') {
      target?.closest('[data-line], [data-material]')?.remove();
      this.p.markDirty();
      return;
    }
    if (action === 'ww-procure-suggest' && this.procurementPlan) {
      for (const suggestion of procurementSuggestions(this.procurementPlan, this.p.state())) {
        const row = Array.from(this.p.root.querySelectorAll<HTMLElement>('[data-allocation]')).find(
          r => r.dataset.allocation === suggestion.articleId
        );
        if (row) {
          row.querySelector<HTMLInputElement>('[name=stockUse]')!.value = String(suggestion.stockUse).replace('.', ',');
          row.querySelector<HTMLInputElement>('[name=incomingUse]')!.value = String(suggestion.incomingUse).replace(
            '.',
            ','
          );
        }
      }
      this.updateProcurementTotals();
      this.p.markDirty();
      return;
    }
    if (action === 'ww-bill-prices') {
      if (!this.p.canLeave()) return;
      const bill = documents(this.p.state().ww, 'bill').find(b => b.id === id);
      if (!bill) throw new Error('Rechnung fehlt.');
      const suggestions = invoicePriceProposals(linkedBill(bill, this.p.state()), this.p.state());
      if (!suggestions.length) throw new Error('Keine eindeutig zuordenbaren Preisänderungen.');
      this.clear();
      this.screen = 'prices';
      this.draft = {
        ...(this.create('prices') as PriceList),
        supplierId: bill.supplierId,
        name: 'Preisvorschlag aus Rechnung ' + (bill.number || bill.name),
        validFrom: bill.date,
        lines: suggestions.map(p => ({
          offerId: p.offer.id,
          offerSignature: offerIdentity(p.offer),
          priceNet: p.newPrice,
          deposit: p.offer.deposit
        }))
      };
      this.p.redraw();
      this.p.markDirty();
      return;
    }
    if (action === 'ww-procure' || action === 'ww-next-plan') {
      if (!this.p.canLeave()) return;
      const state = this.p.state();
      const plan = documents(state.ww, 'plan').find(
        d => d.id === id && d.scope === this.p.season() && d.area === this.p.area()
      );
      if (!plan || state.seasons.find(row => row.value.id === plan.scope)?.value.archived)
        throw new Error('Bitte einen Einsatz der aktiven Saison wählen.');
      if (action === 'ww-next-plan' && plan.date < today()) throw new Error('Bitte einen anstehenden Einsatz wählen.');
      this.procurementMode =
        action === 'ww-procure' ? 'planning' : planAlreadyOrdered(plan, state) ? 'follow-up' : 'check';
      this.procurementPlan = plan;
      this.demand = undefined;
      this.p.redraw();
      return;
    }
    if (action === 'ww-demand') {
      if (!this.p.canLeave()) return;
      this.demand = documents(this.p.state().ww, 'plan').find(d => d.id === id);
      this.p.redraw();
      return;
    }
    if (action === 'ww-use') {
      if (!this.p.canLeave()) return;
      this.useTemplate = documents(this.p.state().ww, 'template').find(d => d.id === id);
      if (!this.useTemplate) throw new Error('Ordersatz nicht gefunden.');
      this.p.redraw();
      return;
    }
  }
  public async save(form: HTMLFormElement): Promise<void> {
    const data = new FormData(form),
      get = (key: string): string => String(data.get(key) || '').trim();
    const screen = this.screen;
    if (form.dataset.form === 'ww-bill-link') {
      const original = this.billLinking!;
      const link = {
        id: this.operationId,
        kind: 'billLink' as const,
        scope: original.value.scope,
        area: original.value.area,
        at: new Date().toISOString(),
        by: this.p.actor,
        confirmed: true,
        billId: original.value.id,
        ...this.readBillLinks(form, original.value),
        reason: get('reason')
      };
      validateDocument(link);
      await this.p.mutate(
        () => this.p.store.save(link, undefined, this.operationId),
        'Belegzuordnung gespeichert.',
        () => {
          this.screen = 'bills';
          this.billViewing = original;
        }
      );
      return;
    }
    if (form.dataset.form === 'ww-ingredient') {
      if (!this.ingredient || this.draft?.kind !== 'recipe' || !this.p.ingredient)
        throw new Error('Zutatenanlage nicht verfügbar.');
      const value = readIngredient(form, this.ingredient);
      if (
        this.p
          .state()
          .articles.some(a => a.value.name.toLocaleLowerCase('de-DE') === value.article.name.toLocaleLowerCase('de-DE'))
      )
        throw new Error('Dieser Artikel existiert bereits. Bitte vorhandene Zutat wählen.');
      const recipe = structuredClone(this.draft),
        previous = this.previous;
      await this.p.ingredient(value.article, value.offer, this.operationId, () => {
        this.screen = 'recipes';
        this.previous = previous;
        this.draft = {
          ...recipe,
          ingredients: [...recipe.ingredients, { articleId: value.article.id, quantity: 0, unit: value.article.unit }]
        };
        this.ingredient = undefined;
        this.p.markDirty();
      });
      return;
    }
    if (form.dataset.form === 'ww-procure') {
      const slot = documents(this.p.state().ww, 'slot').find(s => s.id === get('slot'));
      const plan = this.procurementPlan;
      const mode = this.procurementMode;
      if (!plan || plan.scope !== this.p.season() || plan.area !== this.p.area())
        throw new Error('Bitte den Einsatz erneut wählen.');
      if (!slot || (mode !== 'planning' && slot.date < today())) throw new Error('Passenden Liefertermin wählen.');
      const allocations = Array.from(form.querySelectorAll<HTMLElement>('[data-allocation]')).map(r => ({
        articleId: r.dataset.allocation!,
        offerId: r.querySelector<HTMLSelectElement>('[name=offerId]')!.value,
        stockUse: parseDecimal(r.querySelector<HTMLInputElement>('[name=stockUse]')!.value)!,
        incomingUse: parseDecimal(r.querySelector<HTMLInputElement>('[name=incomingUse]')!.value)!
      }));
      const targets = Object.fromEntries(this.p.state().suppliers.map(s => [s.value.id, get('target_' + s.value.id)]));
      const orders = mergePlanOrders(plan, slot, this.p.state(), allocations, targets, mode),
        operationId = this.operationId;
      const reservation = procurementReservation(plan, allocations, this.p.state()),
        previous = this.p.state().ww?.records.find(r => r.value.id === reservation.id);
      await this.p.mutate(
        async () => {
          await this.p.store.save(reservation, previous, operationId + '-allocation');
          return this.p.orders(orders, operationId);
        },
        orders.length ? 'Bestellentwürfe gespeichert.' : 'Der Bedarf ist gedeckt.',
        () => {
          this.screen = mode === 'planning' ? 'plans' : 'next-use';
          this.preparedOrderIds = orders.map(order => order.id);
        }
      );
      return;
    }
    if (form.dataset.form === 'ww-use') {
      const template = this.useTemplate!;
      const ids = data.getAll('slot').map(String);
      if (!ids.length) throw new Error('Bitte mindestens einen Liefertermin wählen.');
      const slots = documents(this.p.state().ww, 'slot').filter(s => ids.includes(s.id));
      if (slots.length !== ids.length) throw new Error('Liefertermine wurden geändert. Bitte neu laden.');
      const orders = slots.flatMap(slot =>
        templateOrders(
          {
            ...template,
            lines: template.lines.map((l, i) => ({ ...l, quantity: parseDecimal(get('qty_' + slot.id + '_' + i)) }))
          },
          [slot],
          this.p.state(),
          documents(this.p.state().ww, 'prices')
        )
      );
      const combined = withSchedule(
        orders[0],
        slots.map(s => ({ id: s.id, date: s.date, time: s.time, place: s.place }))
      );
      combined.id = 'template:' + template.id + ':' + this.p.season() + ':' + this.p.area().replace('ü', 'ue');
      combined.note = '';
      combined.occasion = template.name;
      combined.lines = combined.lines.map(l => ({
        ...l,
        schedule: Object.fromEntries(
          slots.map((slot, index) => [
            slot.id,
            orders[index].lines.find(x => x.offerId === l.offerId)?.quantity ?? null
          ])
        )
      }));
      const one = scheduledOrder(combined);
      const operationId = this.operationId;
      await this.p.mutate(
        () => this.p.orders([one], operationId),
        'Gemeinsame Lieferantenbestellung angelegt und nachgelesen.',
        () => {
          this.screen = 'templates';
        }
      );
      return;
    }
    if (!this.draft) throw new Error('Eingabemaske fehlt.');
    const doc = structuredClone(this.draft);
    doc.at = new Date().toISOString();
    doc.by = this.p.actor;
    if (doc.kind === 'slot') {
      doc.name = get('name');
      doc.date = get('date');
      doc.time = get('time');
      doc.place = get('place');
    }
    if (doc.kind === 'rule') {
      doc.supplierId = get('supplierId');
      doc.weekdays = data.getAll('weekdays').map(v => Number(v));
      doc.leadDays = Number(get('leadDays'));
      doc.cutoff = get('cutoff');
      doc.cutoffTime = get('cutoffTime') || undefined;
      doc.deadlineOverrides = Object.fromEntries(
        get('deadlineOverrides')
          .split(/\r?\n/)
          .filter(x => x.trim())
          .map(x => {
            const pair = x.split('=').map(x => x.trim());
            if (pair.length !== 2) throw new Error('Ausnahme bitte als Lieferdatum=Bestellschluss angeben.');
            return pair;
          })
      );
      doc.minNet = parseDecimal(get('minNet'));
      doc.feeNet = parseDecimal(get('feeNet'));
      doc.note = get('note');
    }
    if (doc.kind === 'template' || doc.kind === 'prices') {
      doc.name = get('name');
      doc.supplierId = get('supplierId');
      const lines = Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => {
        const value = (name: string): string =>
          (row.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + name + '"]')?.value || '').trim();
        const offerId = value('offerId');
        if (
          !this.p
            .state()
            .offers.some(o => o.value.id === offerId && o.value.active && o.value.supplierId === doc.supplierId)
        )
          throw new Error('Jeden Lieferartikel passend zum Lieferanten auswählen.');
        return doc.kind === 'template'
          ? { offerId, quantity: parseDecimal(value('quantity')) }
          : { offerId, priceNet: parseDecimal(value('priceNet')), deposit: parseDecimal(value('deposit')) };
      });
      if (doc.kind === 'template') {
        doc.lines = lines as Template['lines'];
        doc.note = get('note');
      } else {
        doc.lines = (lines as PriceList['lines']).map(l => ({
          ...l,
          offerSignature: offerIdentity(this.p.state().offers.find(o => o.value.id === l.offerId)!.value)
        }));
        doc.validFrom = get('validFrom');
        doc.confirmed = true;
      }
    }
    if (doc.kind === 'recipe') {
      doc.name = get('name');
      doc.category = get('category');
      doc.yield = parseDecimal(get('yield'))!;
      doc.salePriceGross = parseDecimal(get('salePriceGross'));
      doc.confirmed = data.has('confirmed');
      doc.ingredients = Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => {
        const articleId = row.querySelector<HTMLSelectElement>('[name=articleId]')!.value;
        const article = this.p.state().articles.find(a => a.value.id === articleId && a.value.active)?.value;
        if (!article) throw new Error('Zutat bitte auswählen.');
        return {
          articleId,
          quantity: parseDecimal(row.querySelector<HTMLInputElement>('[name=quantity]')!.value)!,
          unit: article.unit
        };
      });
    }
    if (doc.kind === 'plan') {
      doc.name = get('name');
      doc.date = get('date');
      doc.note = get('note');
      doc.lines = Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => {
        const recipeId = row.querySelector<HTMLSelectElement>('[name=recipeId]')!.value;
        if (!documents(this.p.state().ww, 'recipe').some(r => r.id === recipeId))
          throw new Error('In einer Zeile fehlt das Gericht. Bitte auswählen oder die Zeile entfernen.');
        return { recipeId, portions: parseDecimal(row.querySelector<HTMLInputElement>('[name=portions]')!.value)! };
      });
      const savedMaterials = doc.materials ?? [];
      doc.materials = Array.from(form.querySelectorAll<HTMLElement>('[data-material]')).map(row => {
        const articleId = row.querySelector<HTMLSelectElement>('[name=materialArticleId]')!.value;
        const article = this.p.state().articles.find(a => a.value.id === articleId)?.value;
        if (!article || !articleAvailable(article, doc.scope))
          throw new Error('Bitte verfügbares Verbrauchsmaterial auswählen.');
        const unit = savedMaterials.find(line => line.articleId === articleId)?.unit ?? article.unit;
        return {
          articleId,
          quantity: inputNumber(row.querySelector<HTMLInputElement>('[name=materialQuantity]'))!,
          unit
        };
      });
    }
    if (doc.kind === 'equipment') {
      doc.name = get('name');
      doc.needed = fieldNumber(form, 'needed')!;
      doc.available = fieldNumber(form, 'available');
      doc.action = get('action') as EquipmentItem['action'];
      doc.note = get('note');
    }
    if (doc.kind === 'movement') {
      doc.articleId = get('articleId');
      const article = this.p.state().articles.find(a => a.value.id === doc.articleId && a.value.active)?.value;
      if (!article) throw new Error('Artikel bitte prüfen.');
      doc.unit = article.unit;
      doc.type = get('type') as Movement['type'];
      doc.quantity = parseDecimal(get('quantity'))!;
      doc.at = new Date(get('at')).toISOString();
      doc.place = get('place');
      doc.toArea = doc.type === 'transfer' ? (get('toArea') as Area) : null;
      doc.toPlace = doc.type === 'transfer' ? get('toPlace') : '';
      doc.note = get('note');
      doc.confirmed = true;
    }
    if (doc.kind === 'bill') {
      const bill = this.readBill(form, doc);
      const collection =
        bill.needsSeparateFiles &&
        bill.fileHash &&
        form.hasAttribute('data-collection') &&
        (bill.sourceFile || bill.scanNumberReview?.status === 'open');
      if (!collection && !this.p.state().suppliers.some(s => s.value.id === bill.supplierId && s.value.active))
        throw new Error('Bitte einen aktiven Lieferanten auswählen.');
      const inbox = this.inboxPage,
        previous = this.previous,
        operationId = this.operationId,
        upload = this.billUpload;
      validateDocument({ ...bill, attachment: upload ? 'original-' + upload.hash + '.pdf' : bill.attachment });
      await this.p.mutate(
        async () => {
          if (!upload) return this.p.store.save(bill, previous, operationId);
          const current = await this.p.store.get(bill.id);
          if (current?.operationId === operationId) return current;
          const stage = { ...bill, confirmed: false, attachment: '' };
          const stageId = operationId + '-stage';
          const saved = current?.operationId === stageId ? current : await this.p.store.save(stage, previous, stageId);
          const attachment = await this.p.store.attachOriginal(saved, upload.bytes, upload.hash, 'pdf');
          const fresh = await this.p.store.get(bill.id);
          if (fresh?.operationId === operationId) return fresh;
          if (!fresh || fresh.operationId !== stageId)
            throw new Error('Rechnung wurde zwischenzeitlich geändert. Bitte neu laden.');
          return this.p.store.save({ ...bill, attachment }, fresh, operationId);
        },
        collection
          ? bill.scanNumberReview?.status === 'open'
            ? 'Belegprüfung als offen gespeichert.'
            : 'Prüfstatus gespeichert. Einzelbelege bitte getrennt ablegen.'
          : billTypeLabel(bill) + (upload || bill.attachment ? ' mit Original gespeichert.' : ' gespeichert.'),
        () => {
          this.inboxPage = inbox;
          this.screen = inbox ? 'inbox' : 'bills';
        }
      );
      return;
    }
    validateDocument(doc);
    const previous = this.previous,
      operationId = this.operationId;
    await this.p.mutate(
      () => this.p.store.save(doc, previous, operationId),
      'Gespeichert und durch Lesen bestätigt.',
      () => {
        this.screen = screen;
      }
    );
  }
  private readBillLinks(
    form: HTMLFormElement,
    bill: Bill
  ): { orderIds: string[]; creditForId: string; returnIds: string[]; costAssignment: BillCostAssignment | null } {
    const data = new FormData(form);
    const mode = data.get('costMode');
    let costAssignment: BillCostAssignment | null = null;
    if (mode === 'open') costAssignment = { mode: 'open' };
    if (mode === 'split')
      costAssignment = {
        mode: 'split',
        kitchen: fieldNumber(form, 'costKitchen', { signed: true }) ?? 0,
        scheuer: fieldNumber(form, 'costScheuer', { signed: true }) ?? 0,
        market: fieldNumber(form, 'costMarket', { signed: true }) ?? 0,
        other: fieldNumber(form, 'costOther', { signed: true }) ?? 0
      };
    const state = this.p.state();
    const orderIds = state.orders
      .filter(o => data.has('order_' + o.value.id))
      .map(o => {
        if (o.value.supplierId !== bill.supplierId || o.value.seasonId !== bill.scope || o.value.area !== bill.area)
          throw new Error('Zugeordnete Bestellung muss zu Lieferant, Saison und Bereich passen.');
        return o.value.id;
      });
    const creditForId = bill.billType === 'credit' ? String(data.get('creditForId') || '') : '';
    if (creditForId && !relatedBills(bill, state).some(row => row.id === creditForId))
      throw new Error('Bitte eine passende Originalrechnung wählen.');
    const returnIds = returnMovements(bill, state)
      .filter(row => data.has('return_' + row.id))
      .map(row => row.id);
    return { orderIds, creditForId, returnIds, costAssignment };
  }
  private readBill(form: HTMLFormElement, doc: Bill): Bill {
    if (form.hasAttribute('data-collection') && doc.needsSeparateFiles) return { ...doc, confirmed: false };
    const data = new FormData(form),
      get = (key: string): string => String(data.get(key) || '').trim();
    const billType = get('billType') as BillType;
    const supplierId = get('supplierId');
    return {
      ...doc,
      billType,
      name: get('name'),
      supplierId,
      number: get('number'),
      date: get('date'),
      net: fieldNumber(form, 'net', { signed: true }),
      tax: fieldNumber(form, 'tax', { signed: true }),
      gross: fieldNumber(form, 'gross', { signed: true }),
      adjustmentNet: fieldNumber(form, 'adjustmentNet', { signed: true }) ?? 0,
      note: get('note'),
      confirmed: data.has('confirmed'),
      ...this.readBillLinks(form, { ...doc, billType, supplierId }),
      lines: Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => {
        const value = (key: string): string =>
          row.querySelector<HTMLInputElement | HTMLSelectElement>('[name=' + key + ']')!.value.trim();
        const number = (key: string, signed = false): number | null =>
          inputNumber(row.querySelector<HTMLInputElement>('[name=' + key + ']'), { signed });
        const role = value('lineRole') as BillLineRole;
        return {
          id: row.dataset.id!,
          role,
          articleId: value('articleId') || null,
          name: value('lineName'),
          quantity: number('quantity', role === 'return' || role === 'deposit' || role === 'open'),
          unit: value('unit'),
          unitNet: number('unitNet', role !== 'goods'),
          totalNet: number('totalNet', role !== 'goods'),
          taxRate: number('taxRate')
        };
      })
    };
  }
  private systems(): string {
    const docs = documents(this.p.state().ww, 'system').filter(d => d.area === this.p.area());
    const replaced = new Set(docs.filter(d => d.confirmed).map(d => d.replacesId));
    return `<div class="page-heading"><div><h1>Kassen- und Bestellsystem</h1><p>Artikelverkäufe, Zahlungen und Menüvorbestellungen.</p></div>${button('ww-system-new', 'Excel / CSV importieren', '', true)}</div><p class="ww-alert">Verkäufe und Vorbestellungen sind getrennte Datenarten. Jeder Zeitraum wird pro Bereich und Datenart nur einmal übernommen. Erstattungen erhöhen den Küchenbestand nicht automatisch.</p><section class="panel">${docs.map(d => `<div class="listrow"><div><strong>${h(d.name)}</strong><p>${h(d.from)} bis ${h(d.to)} · ${h(purposeLabels[d.purpose])} · ${d.rows.length} Zeilen · ${replaced.has(d.id) ? 'Ersetzt · nur Historie' : d.confirmed ? 'Bestätigt' : 'Entwurf / Übernahme prüfen'}</p><small>${d.purpose === 'payments' ? '' : 'Preisart: ' + h(d.basis === 'gross' ? 'brutto' : d.basis === 'net' ? 'netto' : 'offen') + ' · '}${h(d.currency)}</small></div>${!d.confirmed ? (d.originalExtension && !d.attachment ? `<div><p>Original noch nicht vollständig gespeichert. Dieselbe Datei ergänzen oder nach einem Verbindungsabbruch fortsetzen.</p><label>Originaldatei erneut auswählen<input type="file" data-import-original="${h(d.id)}" accept=".${h(d.originalExtension)}"></label>${button('ww-import-original', 'Original ergänzen und übernehmen', d.id, true)}${button('ww-resume-import', 'Übernahme fortsetzen', d.id)}</div>` : button('ww-resume-import', 'Übernahme fortsetzen', d.id, true)) : d.purpose === 'menuOrders' && !replaced.has(d.id) ? button('ww-menu-plan', 'Tagesbedarf planen', d.id) : ''}</div>`).join('') || empty('Noch keine Systemdaten importiert. CSV und Excel können herstellerunabhängig zugeordnet werden.')}</section><p>${documents(this.p.state().ww, 'profile').length} gespeicherte Quellen / Importprofile.</p>`;
  }
}
