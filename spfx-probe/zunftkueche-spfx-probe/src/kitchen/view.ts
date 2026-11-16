import { deliveryRound } from './home.ts';
import type { OpenBills } from './home';
import { openBillFiles } from './ww/inbox-view.ts';
import { orderReview } from './order-sheet.ts';
import { LocalState, formFields, restoreFields } from './local-state.ts';
import type { LocalDraft, ContextChoice } from './local-state';
import { clearFieldError } from './field-errors.ts';
import { settingsView } from './settings-view.ts';
import { ingredientForm, readIngredient } from './ingredient-form.ts';
import type { IngredientDraft } from './ingredient-form';
import { withSchedule, copyScheduledOrder } from './supplier-orders.ts';
import { orderMailView } from './order-mail.ts';
import { WwController } from './ww/controller.ts';
import { overviewAction, saveOverview } from './actions/overview-actions.ts';
import { loadMenu, menuAction, menuReorder, saveMenu } from './actions/menu-actions.ts';
import { startMenuDrag } from './menu-drag.ts';
import { menuEditor } from './menu-card.ts';
import type { MenuCard, WwDocument } from './ww/model';
import type {
  Area,
  Article,
  Count,
  InventorySession,
  Method,
  Offer,
  Order,
  Season,
  Stored,
  Supplier,
  Workspace
} from './model';
import { isArea } from './model.ts';
import { parseDecimal, validateEntity } from './domain.ts';
import { today as berlinToday } from './ww/common.ts';
import { SharePointStore } from './sharepoint.ts';
import type { ImportKind } from './csv';
import { masterForm, orderForm, copyForm } from './forms.ts';
import type { Editing } from './forms';
import { h, button, panel } from './markup.ts';
import { sidebar, contextSwitch, dashboard, stockOverview, reportsOverview, stamp } from './workspace.ts';
import { receiptForm, inventoryForm, assessmentLabel } from './operation-forms.ts';
import { uuid, message, ownEntry } from './view-support.ts';
import type { ImportItem, View, RecoveryData } from './view-support';
import { uiAction } from './actions/ui-actions.ts';
import { receiptAction, updateReceiptProgress, saveSlip, saveReceipt } from './actions/receipt-actions.ts';
import { inventoryAction, updateCountTotals, saveInventory } from './actions/count-actions.ts';
import { masterAction, articles, suppliers } from './actions/master-actions.ts';
import {
  orderAction,
  orders,
  orderDetail,
  reorderList,
  readOrder,
  updateOrderTotals,
  supplierFor,
  canShareFiles,
  saveOrder
} from './actions/order-actions.ts';
import { importAction, copyList, importForm, uniqueName } from './actions/import-actions.ts';

export class KitchenView {
  readonly local: LocalState;
  recovery?: LocalDraft<RecoveryData>;
  viaKeyboard = false;
  private focusMemo = '';
  /** One history entry of our own is on the stack while the app shows anything but the overview. */
  private guard = false;
  private ignorePop = 0;
  /** Browser back and the back gesture go one step up inside the app instead of leaving the page. */
  private readonly popstate = (event: Event): void => {
    if (this.ignorePop > 0) {
      this.ignorePop--;
      return;
    }
    if (ownEntry((event as PopStateEvent).state)) {
      this.guard = true;
      return;
    }
    if (!this.guard) return;
    this.guard = false;
    this.stepBack();
  };
  /** Verbindung zurück: Wer ungespeicherte Eingaben hat, bekommt den Hinweis, jetzt zu speichern. */
  private readonly online = (): void => {
    if (!this.dirty) return;
    this.error = '';
    this.info = 'Verbindung wieder da. Bitte jetzt speichern.';
    this.paintStatus();
  };
  private readonly offline = (): void => {
    this.info = 'Keine Verbindung. Weiterzählen geht, gespeichert wird, sobald wieder Netz da ist.';
    this.paintStatus();
  };
  private readonly keydown = (event: Event): void => {
    if (
      (event as KeyboardEvent).key === 'Escape' &&
      (this.closeContext(true) || this.closeMenus() || this.closeMenu(true))
    )
      event.preventDefault();
  };
  private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.dirty) {
      this.rememberDraft();
      event.preventDefault();
      event.returnValue = '';
    }
  };
  rememberDraft(): void {
    if (!this.dirty || this.busy) return;
    const form = this.root.querySelector<HTMLFormElement>('form[data-form]');
    if (!form) return;
    const ww = this.wwUI.captureDraft();
    if (
      !ww &&
      !this.editing &&
      !this.draft &&
      !this.inventory &&
      !this.receiving &&
      !this.copySource &&
      !this.quickIngredient
    )
      return;
    const data: RecoveryData = {
      view: this.view,
      orderReview: this.orderReview,
      editing: this.editing,
      draft: this.draft,
      previous: this.previous,
      copySource: this.copySource,
      receiving: this.receiving,
      inventory: this.inventory,
      inventoryPrevious: this.inventoryPrevious,
      quickIngredient: this.quickIngredient,
      operationId: this.operationId,
      ww,
      masterEtag: this.editing
        ? this.state?.[this.editing.kind].find(r => r.value.id === this.editing!.id)?.etag
        : undefined,
      countEdits: [...this.countEdits]
    };
    const saved = this.local.write('draft', {
      version: 1,
      at: new Date().toISOString(),
      context: { area: this.area, seasonId: this.seasonId },
      form: form.dataset.form,
      fields: formFields(form),
      lineCount: form.querySelectorAll('[data-line]').length,
      data
    });
    this.info = saved
      ? 'Auf diesem Gerät gesichert · im Team noch nicht gespeichert.'
      : 'Eingaben noch nicht gesichert. Bitte vor dem Schließen speichern.';
    this.paintStatus();
  }
  private rememberContext(): void {
    this.local.write('context', { area: this.area, seasonId: this.seasonId });
  }
  async resumeDraft(): Promise<void> {
    const saved = this.recovery;
    if (!saved || saved.version !== 1 || saved.lineCount > 1000 || saved.lineCount < 0 || saved.fields.length > 25000)
      throw new Error('Entwurf ist nicht lesbar.');
    const season = this.state?.seasons.find(s => s.value.id === saved.context.seasonId)?.value;
    if (!season || season.archived)
      throw new Error('Die Saison dieses Entwurfs ist nicht mehr bearbeitbar. Eingaben herunterladen oder verwerfen.');
    this.seasonId = season.id;
    this.area = saved.context.area;
    if (this.store.ww) this.state!.ww = await this.store.ww.load(season.id);
    const d = saved.data,
      refs = [d.previous, d.receiving?.previous, d.inventoryPrevious, d.ww?.previous].filter(
        (r): r is Stored<Order> | Stored<InventorySession> | Stored<import('./ww/model').WwDocument> => !!r
      ),
      current = [...this.state!.orders, ...(this.state!.inventories || []), ...(this.state!.ww?.records || [])];
    if (
      refs.some(r => current.find(c => c.value.id === r.value.id)?.etag !== r.etag) ||
      (d.editing?.id && this.state![d.editing.kind].find(r => r.value.id === d.editing!.id)?.etag !== d.masterEtag)
    )
      throw new Error(
        'Der gespeicherte Vorgang wurde inzwischen geändert. Der lokale Entwurf wird nicht darübergeschrieben. Bitte Eingaben herunterladen und den aktuellen Stand neu öffnen.'
      );
    this.clearEditor();
    this.view = d.view;
    this.orderReview = d.orderReview || false;
    this.editing = d.editing;
    this.draft = d.draft;
    this.previous = d.previous;
    this.copySource = d.copySource;
    this.receiving = d.receiving;
    this.inventory = d.inventory;
    this.inventoryPrevious = d.inventoryPrevious;
    this.quickIngredient = d.quickIngredient;
    this.operationId = d.operationId;
    this.countEdits = new Map(d.countEdits || []);
    if (d.ww) this.wwUI.restoreDraft(d.ww);
    this.recovery = undefined;
    this.dirty = true;
    this.render();
    this.wwUI.restoreRows(saved.lineCount);
    this.wwUI.restoreMaterialRows(saved.fields.filter(f => f.name === 'materialArticleId').length);
    const form = this.root.querySelector<HTMLFormElement>('form[data-form]');
    if (form && form.dataset.form === saved.form) restoreFields(form, saved.fields);
    this.applyDeliveryView();
    updateCountTotals(this);
    updateOrderTotals(this);
    this.wwUI.updateCosts();
    this.info = 'Lokalen Entwurf wieder aufgenommen. Bitte prüfen und speichern. Dateien bei Bedarf erneut auswählen.';
    this.paintStatus();
    this.rememberContext();
  }

  state?: Workspace;
  readonly wwUI: WwController;
  view: View = 'heute';
  area: Area = 'Küche';
  seasonId = '';
  editing?: Editing;
  draft?: Order;
  orderReview = false;
  mailOrder?: Order;
  previous?: Stored<Order>;
  copySource?: Stored<Order>;
  selectedOrder = '';
  receiving?: { previous: Stored<Order>; id: string; deliveryId?: string };
  inventory?: InventorySession;
  inventoryPrevious?: Stored<InventorySession>;
  countEdits = new Map<string, string>();
  query = '';
  statusFilter = '';
  quickIngredient?: IngredientDraft;
  copyPicker = false;
  reorderPicker = false;
  overviewPicker = false;
  menuDraft?: MenuCard;
  menuPrevious?: Stored<WwDocument>;
  /** Ungeprüfte Rechnungen je offener Saison, nach jedem Laden einmal im Hintergrund gelesen. */
  openBills: OpenBills[] = [];
  private billsFor?: Workspace;
  deliveryPicker = false;
  sourceSeason = '';
  importKind?: ImportKind;
  importItems?: ImportItem[];
  importErrors: string[] = [];
  importText?: string;
  importStarted = false;
  private pendingSave?: { work: () => Promise<unknown>; success: string; after?: () => void };
  dirty = false;
  private busy = false;
  operationId = uuid();
  info = '';
  error = '';
  private needsSetup = false;
  private locked: Array<[HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement, boolean]> = [];
  /** Control that started the current action. Errors are repeated next to it when the page status line is out of sight. */
  private trigger?: HTMLElement;
  /** Identifies the page currently shown, so a new page starts at the top while redraws of the same page keep their place. */
  private shownPage?: string;
  private readonly click = (event: Event): void => {
    this.viaKeyboard = (event as MouseEvent).detail === 0;
    if (!(event.target instanceof Element && event.target.closest('.sidebar nav'))) this.closeMenu();
    if (!(event.target instanceof Element && event.target.closest('.context-switch'))) this.closeContext();
    this.closeMenus(event.target instanceof Element ? event.target : undefined);
    const target =
      event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : undefined;
    if (target && !this.busy) {
      this.trigger = target;
      this.action(target.dataset.action!, target.dataset.id || '', target).catch(e => this.showError(e));
    }
  };
  private readonly pointerdown = (event: PointerEvent): void => {
    if (!this.menuDraft || this.busy) return;
    startMenuDrag(event, (section, ids) => {
      try {
        menuReorder(this, section, ids);
      } catch (e) {
        this.showError(e);
      }
    });
  };
  private readonly submit = (event: Event): void => {
    if (!(event.target instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (!this.busy) {
      this.trigger =
        (event as SubmitEvent).submitter || event.target.querySelector<HTMLElement>('button[type=submit]') || undefined;
      this.save(event.target).catch(e => this.showError(e));
    }
  };
  private readonly input = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    this.trigger = undefined;
    const target = event.target as HTMLInputElement;
    target.dataset.userEdited = 'true';
    if (target.dataset.fieldErrorId) {
      clearFieldError(target);
      this.error = '';
    }
    if (target.name === 'inventoryFilter' || target.name === 'deliveryView' || target.name === 'receiptDelivery')
      return;
    if (target.name === 'sheetSearch') {
      const q = target.value.toLocaleLowerCase('de-DE').trim();
      let visible = 0;
      for (const row of Array.from(this.root.querySelectorAll<HTMLElement>('[data-sheet-row]'))) {
        row.hidden = !(row.dataset.search || '').toLocaleLowerCase('de-DE').includes(q);
        if (!row.hidden) visible++;
      }
      const empty = this.root.querySelector<HTMLElement>('[data-sheet-empty]');
      if (empty) empty.hidden = visible > 0;
      return;
    }
    if (target.name === 'workspaceSearch') {
      this.query = target.value;
      this.filterRows();
      return;
    }
    if (target.closest('form')) {
      this.dirty = true;
      this.info = 'Ungespeicherte Eingaben.';
      this.paintStatus();
      if (this.draft) updateOrderTotals(this);
      this.wwUI.updateCosts();
      if (this.inventory) {
        const id = target.name.replace(/^(packs|loose)_/, '');
        if (id !== target.name) this.countEdits.set(id, new Date().toISOString());
        updateCountTotals(this);
      }
      if (this.receiving) updateReceiptProgress(this);
      this.rememberDraft();
    }
  };
  private readonly change = (event: Event): void => {
    const origin = event.target;
    if (!(origin instanceof HTMLSelectElement) && !(origin instanceof Element && origin.matches('input[type=radio]')))
      return;
    const target = origin as HTMLSelectElement;
    this.trigger = target;
    try {
      if (target.name === 'seasonContext' || target.name === 'areaContext') {
        if (!this.canLeave()) {
          target.value = target.name === 'seasonContext' ? this.seasonId : this.area;
          return;
        }
        this.clearEditor();
        if (target.name === 'seasonContext') this.seasonId = target.value;
        else this.area = target.value as Area;
        this.rememberContext();
        if (this.store.ww) {
          this.run(async () => {}, '', undefined, false).catch(e => this.showError(e));
        } else this.render();
      }
      if (target.name === 'receiptDelivery' && this.receiving) {
        if (this.dirty) {
          target.value = this.receiving.deliveryId || '';
          throw new Error(
            'Bitte die aktuelle Lieferannahme abschließen oder abbrechen, bevor ihr den Termin wechselt.'
          );
        }
        this.receiving.deliveryId = target.value;
        this.render();
      }
      if (
        target.name === 'supplierId' ||
        target.name === 'billType' ||
        target.name === 'billArea' ||
        (target.name === 'articleId' && target.closest('form[data-form=ww-bill]'))
      )
        this.wwUI.billContextChanged(target.name);
      if (target.name === 'costMode') {
        const split = target.closest('details')?.querySelector<HTMLElement>('[data-cost-split]');
        if (split) split.hidden = target.value !== 'split';
      }
      if (target.name === 'profile') this.wwUI.profileChosen(target.value);
      if (target.name === 'sourceSeason') {
        this.sourceSeason = target.value;
        this.render();
      }
      if (target.name === 'orderStatus') {
        this.statusFilter = target.value;
        this.filterRows();
      }
      if (target.name === 'inventoryFilter') this.filterRows();
      if (target.name.startsWith('assessment_')) {
        const badge = target.closest('.count-line')?.querySelector<HTMLElement>('[data-count-badge]');
        if (badge) {
          badge.textContent = assessmentLabel(target.value);
          badge.hidden = !badge.textContent;
        }
      }
      if (target.name === 'deliveryView') this.applyDeliveryView();
      if (target.name === 'supplierId' && this.draft && !this.draft.lines.length) {
        this.draft = readOrder(this, target.closest('form')!);
        const supplier = this.state!.suppliers.find(s => s.value.id === target.value)?.value;
        if (supplier) {
          this.draft.supplierId = supplier.id;
          this.draft.supplierName = supplier.name;
          this.draft.method = supplier.method;
        }
        this.render();
      }
      this.wwUI.updateCosts();
      if (
        target.closest('form') &&
        !['receiptDelivery', 'inventoryFilter', 'deliveryView', 'sourceSeason', 'orderStatus'].includes(target.name)
      ) {
        this.dirty = true;
        this.rememberDraft();
      }
    } catch (e) {
      this.showError(e);
    }
  };
  public constructor(
    public readonly root: HTMLElement,
    public readonly store: SharePointStore,
    public readonly user: string
  ) {
    this.local = new LocalState(root, store.storageScope || root.ownerDocument.baseURI, user);
    const choice = this.local.read<ContextChoice>('context');
    if (choice && isArea(choice.area)) {
      this.area = choice.area;
      this.seasonId = choice.seasonId;
    }
    root.ownerDocument.defaultView?.addEventListener('beforeunload', this.beforeUnload);
    root.ownerDocument.defaultView?.addEventListener('popstate', this.popstate);
    root.ownerDocument.defaultView?.addEventListener('online', this.online);
    root.ownerDocument.defaultView?.addEventListener('offline', this.offline);
    root.addEventListener('click', this.click);
    root.addEventListener('pointerdown', this.pointerdown);
    root.addEventListener('keydown', this.keydown);
    root.addEventListener('submit', this.submit);
    root.addEventListener('input', this.input);
    root.addEventListener('change', this.change);
    this.wwUI = new WwController({
      root,
      state: () => this.state!,
      loadWorkspace: () => this.store.load(),
      season: () => this.seasonId,
      area: () => this.area,
      actor: this.user,
      store: this.store.ww,
      inbox: this.store.inbox,
      canLeave: () => this.canLeave(),
      resetDirty: () => {
        this.dirty = false;
        this.error = '';
        this.info = '';
        this.local.remove('draft');
      },
      markDirty: () => {
        this.dirty = true;
        this.rememberDraft();
      },
      redraw: () => this.render(),
      mutate: (work, message, after) => this.run(work, message, after),
      ingredient: async (article, offer, operationId, after) =>
        this.run(
          async () => {
            await this.store.saveMaster('articles', article, undefined, operationId + '-article');
            await this.store.saveMaster('offers', offer, undefined, operationId + '-offer');
          },
          'Zutat und Liefergebinde angelegt.',
          after
        ),
      supplier: async (supplier, operationId, after) => {
        validateEntity('suppliers', supplier);
        await this.run(
          () => this.store.saveMaster('suppliers', supplier, undefined, operationId),
          'Lieferant „' + supplier.name + '“ angelegt. Kontaktdaten könnt ihr später unter Lieferanten ergänzen.',
          after
        );
      },
      orders: async (orders, operationId) => {
        for (const order of orders)
          await this.store.saveOrder(
            order,
            this.state!.orders.find(o => o.value.id === order.id),
            operationId + '-' + order.id
          );
      }
    });
  }
  public async start(): Promise<void> {
    this.render();
    await this.run(async () => {}, '', undefined, false);
    const draft = this.local.read<LocalDraft<RecoveryData>>('draft');
    if (draft?.version === 1 && draft.data && draft.fields) {
      this.recovery = draft;
      this.render();
    }
  }
  public dispose(): void {
    this.rememberDraft();
    this.wwUI.clear();
    this.root.ownerDocument.defaultView?.removeEventListener('beforeunload', this.beforeUnload);
    this.root.ownerDocument.defaultView?.removeEventListener('popstate', this.popstate);
    this.root.ownerDocument.defaultView?.removeEventListener('online', this.online);
    this.root.ownerDocument.defaultView?.removeEventListener('offline', this.offline);
    this.root.removeEventListener('keydown', this.keydown);
    this.root.removeEventListener('click', this.click);
    this.root.removeEventListener('pointerdown', this.pointerdown);
    this.root.removeEventListener('submit', this.submit);
    this.root.removeEventListener('input', this.input);
    this.root.removeEventListener('change', this.change);
  }
  season(): Season | undefined {
    return this.state?.seasons.find(s => s.value.id === this.seasonId)?.value;
  }
  writable(): boolean {
    return !!this.season() && !this.season()!.archived;
  }
  canLeave(): boolean {
    if (!this.dirty) return true;
    this.showError(new Error('Ungespeicherte Eingaben: bitte zuerst speichern oder ausdrücklich abbrechen.'));
    return false;
  }
  clearEditor(): void {
    this.wwUI?.clear();
    this.quickIngredient = undefined;
    this.editing = undefined;
    this.draft = undefined;
    this.orderReview = false;
    this.mailOrder = undefined;
    this.previous = undefined;
    this.receiving = undefined;
    this.inventory = undefined;
    this.inventoryPrevious = undefined;
    this.countEdits.clear();
    this.copySource = undefined;
    this.copyPicker = false;
    this.reorderPicker = false;
    this.overviewPicker = false;
    this.menuDraft = undefined;
    this.menuPrevious = undefined;
    this.deliveryPicker = false;
    this.importKind = undefined;
    this.importItems = undefined;
    this.importErrors = [];
    this.importText = undefined;
    this.importStarted = false;
    this.pendingSave = undefined;
    this.selectedOrder = '';
    this.dirty = false;
    this.operationId = uuid();
    this.info = '';
    this.error = '';
  }
  private showError(error: unknown): void {
    this.error = message(error);
    this.paintStatus(true);
  }
  /** fresh: the message was raised just now, so it may move the page to become visible. Repaints of an older message never do. */
  paintStatus(fresh = false): void {
    const status = this.root.querySelector<HTMLElement>('[data-status]');
    if (status) {
      status.textContent = this.error || this.info;
      status.setAttribute('role', this.error ? 'alert' : 'status');
      status.setAttribute('data-error', String(!!this.error));
    }
    this.paintInlineError(status, fresh);
  }
  /** The status line sits at the top of the page. On long pages it is scrolled away, so an error is repeated beside the control that caused it. */
  private paintInlineError(status: HTMLElement | null, fresh: boolean): void {
    this.root.querySelector('[data-inline-status]')?.remove();
    if (!this.error || !status || this.topVisible(status)) return;
    const anchor = this.trigger;
    if (!anchor || !anchor.isConnected || !this.root.contains(anchor)) {
      if (fresh) status.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    const hint = this.root.ownerDocument.createElement('p');
    hint.className = 'inline-status';
    hint.setAttribute('data-inline-status', '');
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = this.error;
    const group = anchor.closest<HTMLElement>('.actions,.calm-actions,.sticky-actions');
    if (group && this.root.contains(group)) group.prepend(hint);
    else anchor.insertAdjacentElement('afterend', hint);
    if (fresh) hint.scrollIntoView?.({ block: 'nearest' });
  }
  /**
   * Whether the top of an element can be seen: inside the window and not covered by the surrounding SharePoint or Teams page,
   * which scrolls the app inside its own region. Without layout information the element counts as visible.
   */
  private topVisible(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) return true;
    const hit = element.ownerDocument.elementFromPoint?.(
      rect.left + Math.min(rect.width / 2, 60),
      rect.top + Math.min(rect.height / 2, 12)
    );
    return !!hit && (hit === element || element.contains(hit));
  }
  lock(value: boolean): void {
    this.busy = value;
    if (value) {
      this.focusMemo = this.focusKey();
      this.locked = Array.from(
        this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement>(
          'input,select,button,textarea'
        )
      ).map(el => [el, el.disabled]);
      this.locked.forEach(([el]) => {
        el.disabled = true;
      });
    } else {
      this.locked.forEach(([el, disabled]) => {
        if (el.isConnected) el.disabled = disabled;
      });
      this.locked = [];
      const memo = this.focusMemo;
      this.focusMemo = '';
      this.restoreFocus(memo);
    }
  }
  async run(work: () => Promise<unknown>, success: string, after?: () => void, mutation = true): Promise<void> {
    if (this.busy) return;
    if (mutation) this.pendingSave = { work, success, after };
    let keepLocal = false;
    this.error = '';
    this.info = 'Wird mit SharePoint abgeglichen …';
    this.paintStatus();
    this.lock(true);
    try {
      await work();
      const state = await this.store.load();
      const missingContext = !!this.seasonId && !state.seasons.some(s => s.value.id === this.seasonId);
      this.state = state;
      this.needsSetup = false;
      if (!this.seasonId || !state.seasons.some(s => s.value.id === this.seasonId))
        this.seasonId =
          [...state.seasons].sort(
            (a, b) => Number(a.value.archived) - Number(b.value.archived) || b.value.year - a.value.year
          )[0]?.value.id || '';
      if (this.store.ww && this.seasonId) this.state.ww = await this.store.ww.load(this.seasonId);
      if (mutation) this.local.remove('draft');
      this.clearEditor();
      this.info =
        success ||
        (missingContext
          ? 'Die bisherige Saison ist nicht mehr verfügbar. Aktuelle Saison ausgewählt; bitte oben prüfen.'
          : '');
      this.error = '';
      after?.();
      this.rememberContext();
      this.render();
    } catch (error) {
      this.error = message(error);
      this.needsSetup = this.error.includes('noch nicht eingerichtet');
      /* Ohne Netz bleibt die Eingabe offen: weiterarbeiten, die Eingaben liegen gesichert auf dem Gerät. */
      if (mutation && this.withoutConnection(error)) {
        this.pendingSave = undefined;
        this.dirty = true;
        keepLocal = true;
        this.error =
          'Keine Verbindung. Noch nichts gespeichert. Die Eingaben sind auf diesem Gerät gesichert, ihr könnt weiterarbeiten und später erneut speichern.';
      }
      this.paintStatus(true);
      if (!this.state) this.render();
    } finally {
      this.lock(false);
      if (keepLocal) this.rememberDraft();
      if (this.pendingSave) this.showRecovery();
    }
  }
  private withoutConnection(error: unknown): boolean {
    return this.root.ownerDocument.defaultView?.navigator.onLine === false || error instanceof TypeError;
  }
  private showRecovery(): void {
    this.root.querySelector('[data-recovery]')?.remove();
    for (const el of Array.from(
      this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement | HTMLTextAreaElement>(
        'input,select,button,textarea'
      )
    ))
      el.disabled = true;
    const box = document.createElement('section');
    box.className = 'panel warning';
    box.setAttribute('data-recovery', '');
    box.innerHTML =
      '<h2>Gespeicherten Stand prüfen</h2><p>Die Eingaben bleiben bis zur Klärung gesperrt. Ihr könnt denselben Vorgang sicher erneut versuchen oder den aktuellen Stand laden und die Eingabemaske schließen.</p><div class="actions">' +
      button('save-retry', 'Denselben Vorgang erneut versuchen', '', true) +
      button('save-reconcile', 'Stand laden und Eingaben schließen') +
      '</div>';
    this.root.querySelector('main')!.prepend(box);
    const status = this.root.querySelector<HTMLElement>('[data-status]');
    if (status && !this.topVisible(status)) status.scrollIntoView?.({ block: 'start' });
  }
  render(): void {
    const s = this.state;
    const season = this.season();
    let body = '';
    /* Der Tab „Karte“ zeigt immer die Karte der Saison. Nach Abbrechen oder Saisonwechsel wird sie neu geladen. */
    if (s && this.view === 'menu' && !this.menuDraft) {
      try {
        loadMenu(this);
      } catch {
        /* Ohne Saison oder Warenwirtschaft steht unten ein Hinweis. */
      }
    }
    if (!s)
      body = panel(
        'Arbeitsbereich',
        `<p>Die Daten werden auf der SharePoint-Seite dieses Kanals gespeichert.</p>${this.needsSetup ? button('setup', 'Arbeitsbereich einrichten', '', true) : '<p>Verbindung wird geprüft.</p>'}`
      );
    else if (this.quickIngredient) body = ingredientForm(this.quickIngredient, s);
    else if (this.menuDraft) body = menuEditor(this.menuDraft, s, !!this.menuPrevious);
    else if (this.wwUI.screen) body = this.wwUI.render();
    else if (this.receiving)
      body = receiptForm(this.receiving.previous.value, this.receiving.deliveryId, !!s.ww?.ready);
    else if (this.inventory)
      body = inventoryForm(
        this.inventory,
        [
          ...new Set(
            s.orders
              .filter(
                o => o.value.seasonId === this.seasonId && o.value.area === this.area && o.value.status !== 'Storniert'
              )
              .flatMap(o => o.value.lines.map(l => l.articleId))
          )
        ],
        Object.fromEntries(s.articles.map(a => [a.value.id, a.value.storagePlace || ''])),
        Object.fromEntries(s.articles.map(a => [a.value.id, a.value.category || '']))
      );
    else if (this.editing) body = masterForm(this.editing, s);
    else if (this.mailOrder)
      body = orderMailView(this.mailOrder, supplierFor(this, this.mailOrder), canShareFiles(this));
    else if (this.draft) body = this.orderReview ? orderReview(this.draft, s) : orderForm(this.draft, s);
    else if (this.copySource) body = copyForm(this.copySource.value, s, this.season());
    else if (this.importKind) body = importForm(this);
    else if (this.selectedOrder)
      body = orderDetail(
        this,
        s.orders.find(o => o.value.id === this.selectedOrder)
      );
    else if (this.copyPicker) body = copyList(this);
    else if (this.reorderPicker) body = reorderList(this);
    else if (this.deliveryPicker) body = deliveryRound(s, season, this.area);
    else if (this.overviewPicker) body = orders(this);
    else if (this.view === 'heute') body = this.home();
    else if (this.view === 'articles') body = articles(this);
    else if (this.view === 'suppliers') body = suppliers(this);
    else if (this.view === 'stock') body = stockOverview(s, season, this.area, this.query);
    else if (this.view === 'planning') body = this.wwUI.renderPlanning();
    else if (this.view === 'reports') body = reportsOverview(s, season, this.area);
    else if (this.view === 'management') body = settingsView(season, this.area);
    else if (this.view === 'menu')
      body =
        '<div class="page-heading"><div><h1>Karte</h1></div></div><p>Bitte zuerst eine Saison wählen. Die Karte wird je Saison gespeichert.</p>';
    else body = orders(this);

    const page = this.pageKey(),
      samePage = page === this.shownPage,
      opened = samePage ? this.openSections() : undefined,
      focus = this.focusKey() || this.focusMemo;
    this.root.innerHTML = `<div class="app-layout">${sidebar(season, this.view)}<div class="workspace-main">${this.store.testMode ? '<p class="test-banner">Abnahme mit künstlichen Daten · vom Vereinsbestand getrennt</p>' : ''}<p data-status class="status" aria-live="polite"></p><main tabindex="-1">${contextSwitch(s, season, this.area, this.seasonId)}${season?.archived ? '<p class="archive">Archiv: Bestellungen und Bestandsmeldungen dieser Saison sind schreibgeschützt.</p>' : ''}${this.recovery ? '<section class="resume"><h2>Unterbrochene Eingaben fortsetzen</h2><p>' + h(this.recovery.context.area) + ' · ' + h(this.state?.seasons.find(x => x.value.id === this.recovery!.context.seasonId)?.value.name || 'Saison nicht mehr verfügbar') + ' · ' + h(stamp(this.recovery.at)) + ' · nur auf diesem Gerät gespeichert</p><div class="actions">' + button('draft-resume', 'Entwurf fortsetzen', '', true) + button('draft-download', 'Eingaben herunterladen') + button('draft-discard', 'Entwurf verwerfen') + '</div></section>' : ''}${body}</main><footer>Angemeldet: ${h(this.user.split(' · ')[0])} · Speicherung in SharePoint${this.store.testMode ? ' · Testdaten' : ''}</footer></div></div>`;
    this.root
      .querySelector('.app-layout')
      ?.classList.toggle('task-mode', !!this.root.querySelector('main form.calm-workflow .calm-heading button'));
    this.placeContextSwitch();
    const phone = !!this.root.ownerDocument.defaultView?.matchMedia?.('(max-width:600px)').matches,
      dayViews = Array.from(this.root.querySelectorAll<HTMLInputElement>('input[name=deliveryView]')),
      dayList = this.root.querySelector<HTMLSelectElement>('select[name=deliveryView]');
    if (phone && dayViews.length > 1) dayViews[1].checked = true;
    if (phone && dayList && dayList.options.length > 1) dayList.selectedIndex = 1;
    this.applyDeliveryView();
    updateReceiptProgress(this);
    if (opened) this.reopenSections(opened);
    this.paintStatus();
    this.filterRows();
    if (!samePage) {
      const first = this.shownPage === undefined || this.shownPage === 'setup';
      this.shownPage = page;
      if (!first) this.scrollToTop();
    }
    if (this.importStarted) {
      for (const el of Array.from(
        this.root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLTextAreaElement>(
          'input[type=file],textarea,[data-action=import-preview]'
        )
      ))
        el.disabled = true;
    }
    this.restoreFocus(focus);
    this.syncHistory();
  }
  /** Anything deeper than the overview: an open task or list, or another area. */
  private deep(): boolean {
    return (
      !!this.state &&
      (!this.pageKey().startsWith('view:') ||
        this.view !== 'heute' ||
        !!this.root.querySelector('.sidebar[data-menu-open="true"]'))
    );
  }
  /** Keeps exactly one own history entry while the app is deeper than the overview, and takes it back when the app returns there by itself. */
  syncHistory(): void {
    const history = this.root.ownerDocument.defaultView?.history;
    if (!history?.pushState) return;
    try {
      const deep = this.deep(),
        current = ownEntry(history.state);
      if (deep && !this.guard) {
        if (!current) history.pushState({ zunftkueche: true }, '');
        this.guard = true;
      } else if (!deep && this.guard) {
        this.guard = false;
        if (current) {
          this.ignorePop++;
          history.back();
        }
      }
    } catch {
      /* No session history here, for example in a restricted frame. The app works without it. */
    }
  }
  private stepBack(): void {
    if (!this.state || this.busy) {
      this.syncHistory();
      return;
    }
    if (this.closeMenu(true)) return;
    if (this.orderReview && this.draft) {
      this.action('order-edit-sheet', '').catch(e => this.showError(e));
      return;
    }
    const task = !this.pageKey().startsWith('view:');
    if (!task && this.view === 'heute') return;
    if (!this.canLeave()) {
      this.syncHistory();
      return;
    }
    this.clearEditor();
    if (!task) {
      this.view = 'heute';
      this.query = '';
      this.statusFilter = '';
    }
    this.render();
    this.root.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
  }
  /** Names the focused control so it can be found again after the markup is replaced. */
  private focusKey(): string {
    const el = this.root.ownerDocument.activeElement;
    if (!el || el === this.root || !this.root.contains(el)) return '';
    const quote = (value: string): string => value.replace(/["\\]/g, '\\$&'),
      name = el.getAttribute('name'),
      action = el.getAttribute('data-action');
    if (name)
      return (
        el.tagName.toLowerCase() +
        '[name="' +
        quote(name) +
        '"]' +
        ((el as HTMLInputElement).type === 'radio' ? '[value="' + quote((el as HTMLInputElement).value) + '"]' : '')
      );
    if (action)
      return 'button[data-action="' + quote(action) + '"][data-id="' + quote(el.getAttribute('data-id') || '') + '"]';
    const section = el.tagName === 'SUMMARY' ? el.parentElement?.getAttribute('data-section-key') : null;
    return section ? 'details[data-section-key="' + quote(section) + '"]>summary' : 'main';
  }
  /** Replacing the markup drops keyboard focus to the page start. Put it back on the same control, or on the content area. */
  private restoreFocus(key: string): void {
    if (!key) return;
    const doc = this.root.ownerDocument,
      now = doc.activeElement;
    if (now && now !== doc.body && now !== doc.documentElement) return;
    const same = key === 'main' ? null : this.root.querySelector<HTMLElement>(key);
    same?.focus({ preventScroll: true });
    if (doc.activeElement !== same) this.root.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
  }
  private closeMenu(focus = false): boolean {
    const bar = this.root.querySelector<HTMLElement>('.sidebar[data-menu-open="true"]');
    if (!bar) return false;
    const more = bar.querySelector<HTMLElement>('[data-action="mobile-menu"]');
    bar.dataset.menuOpen = 'false';
    more?.setAttribute('aria-expanded', 'false');
    if (focus) more?.focus();
    this.syncHistory();
    return true;
  }
  /** Aufgeklappte Menüs („Mehr“, weitere Angaben der Bestellung) schließen sich bei einem Klick daneben und mit Escape. */
  private closeMenus(target?: Element): boolean {
    let closed = false;
    for (const menu of Array.from(
      this.root.querySelectorAll<HTMLDetailsElement>('details.more-menu[open], details.sheet-options[open]')
    )) {
      if (target && menu.contains(target) && !target.closest('.more-menu-list button')) continue;
      menu.open = false;
      closed = true;
    }
    return closed;
  }
  private closeContext(focus = false): boolean {
    const sheet = this.root.querySelector<HTMLDetailsElement>('.context-switch[open]');
    if (!sheet) return false;
    sheet.open = false;
    if (focus) sheet.querySelector<HTMLElement>('summary')?.focus();
    return true;
  }
  /** Die Kapsel für Bereich und Saison gehört in die Kopfzeile der Seite, neben die Überschrift. Seiten ohne Kopfzeile behalten sie oben rechts. */
  private placeContextSwitch(): void {
    const main = this.root.querySelector<HTMLElement>('main');
    if (!main) return;
    const sheet = Array.from(main.children).find(el => el.classList.contains('context-switch')),
      head = Array.from(main.children).find(el => el.classList.contains('page-heading'));
    if (!sheet) return;
    /* Die Übersicht hat eine eigene Kopfzeile mit Marke links und Kapsel rechts. */
    if (head?.classList.contains('calm-home-heading')) {
      head.append(sheet);
      return;
    }
    /* Überall sonst dieselbe erste Zeile: Zurück links, Bereich und Saison rechts. Darunter Titel und Hauptknopf. */
    const bar = this.root.ownerDocument.createElement('div');
    bar.className = 'topbar';
    sheet.before(bar);
    const back = main.querySelector<HTMLElement>('.back-link');
    if (back) bar.append(back);
    bar.append(sheet);
  }
  private applyDeliveryView(): void {
    const selected =
      this.root.querySelector<HTMLInputElement | HTMLSelectElement>(
        'input[name=deliveryView]:checked,select[name=deliveryView]'
      )?.value || 'all';
    for (const column of Array.from(this.root.querySelectorAll<HTMLElement>('[data-delivery-column]')))
      column.hidden = selected !== 'all' && column.dataset.deliveryColumn !== selected;
  }
  /** Mirrors the order of render(): one key per page a person would call a different screen. */
  private pageKey(): string {
    if (!this.state) return 'setup';
    if (this.quickIngredient) return 'ingredient';
    if (this.menuDraft) return this.view === 'menu' ? 'view:menu' : 'menu';
    if (this.wwUI.screen) return 'ww:' + this.wwUI.pageKey();
    if (this.receiving) return 'receipt:' + this.receiving.previous.value.id;
    if (this.inventory) return 'inventory:' + this.inventory.id;
    if (this.editing) return 'edit:' + this.editing.kind + ':' + this.editing.id;
    if (this.mailOrder) return 'mail:' + this.mailOrder.id;
    if (this.draft) return (this.orderReview ? 'order-review:' : 'order-form:') + this.draft.id;
    if (this.copySource) return 'copy:' + this.copySource.value.id;
    if (this.importKind) return 'import:' + this.importKind;
    if (this.selectedOrder) return 'order:' + this.selectedOrder;
    if (this.copyPicker) return 'copy-list';
    if (this.reorderPicker) return 'reorder-list';
    if (this.deliveryPicker) return 'delivery-round';
    if (this.overviewPicker) return 'order-overview';
    return 'view:' + this.view;
  }
  private sectionKey(section: HTMLDetailsElement): string {
    return (
      section.dataset.sectionKey ||
      (Array.from(section.children).find(child => child.tagName === 'SUMMARY')?.textContent || '').trim()
    );
  }
  /** Sections the person opened; only those with a unique title can be found again after a redraw. */
  private openSections(): Set<string> {
    const all = Array.from(this.root.querySelectorAll<HTMLDetailsElement>('details')).map(section => ({
      key: this.sectionKey(section),
      open: section.open
    }));
    return new Set(
      all
        .filter(item => item.open && item.key && all.filter(other => other.key === item.key).length === 1)
        .map(item => item.key)
    );
  }
  private reopenSections(keys: Set<string>): void {
    const all = Array.from(this.root.querySelectorAll<HTMLDetailsElement>('details'));
    for (const section of all) {
      const key = this.sectionKey(section);
      if (keys.has(key) && all.filter(other => this.sectionKey(other) === key).length === 1) section.open = true;
    }
  }
  /** A new page starts at its top. The page is only moved when its top is out of sight. */
  private scrollToTop(): void {
    const top = this.root.querySelector<HTMLElement>('.workspace-main') || this.root;
    if (!this.topVisible(top)) top.scrollIntoView?.({ block: 'start' });
  }
  private home(): string {
    if (this.state && this.billsFor !== this.state) {
      this.billsFor = this.state;
      this.checkBills(this.state).catch(() => {
        /* Nur ein Hinweis auf der Übersicht. Fehlt der Zugriff, bleibt er einfach weg. */
      });
    }
    return dashboard(this.state!, this.season(), this.area, undefined, this.openBills);
  }
  private async checkBills(state: Workspace): Promise<void> {
    const inbox = this.store.inbox;
    if (!inbox || !state.ww?.ready) return;
    const result: OpenBills[] = [];
    for (const s of state.seasons.map(r => r.value).filter(v => !v.archived && v.year)) {
      const folder = await inbox.list('bill', s.year);
      result.push({ seasonId: s.id, name: s.name, count: openBillFiles(folder, state, s.id) });
    }
    if (this.state !== state) return;
    const before = JSON.stringify(this.openBills);
    this.openBills = result;
    if (this.view === 'heute' && !this.busy && before !== JSON.stringify(result)) this.render();
  }
  /** Rechnungseingang einer Saison öffnen, bei Bedarf vorher die Saison wechseln. */
  private async openSeasonInbox(seasonId: string): Promise<void> {
    if (!this.canLeave()) return;
    if (seasonId && seasonId !== this.seasonId && this.state?.seasons.some(r => r.value.id === seasonId)) {
      this.clearEditor();
      this.seasonId = seasonId;
      this.rememberContext();
      await this.run(async () => {}, '', undefined, false);
    }
    this.view = 'reports';
    await this.wwUI.action('ww-open', 'inbox');
  }

  async action(action: string, id: string, target?: HTMLElement): Promise<void> {
    if (await uiAction(this, action, id, target)) return;
    if (this.recovery) throw new Error('Bitte den unterbrochenen Entwurf fortsetzen oder ausdrücklich verwerfen.');
    if (action === 'cancel') {
      this.local.remove('draft');
    }

    if (this.pendingSave && !['save-retry', 'save-reconcile'].includes(action))
      throw new Error('Bitte zuerst den Speichervorgang über die angezeigten Schaltflächen klären.');
    if (action === 'inbox-season') {
      await this.openSeasonInbox(id);
      return;
    }
    if (action === 'ww-open' && !this.dirty)
      this.view = ['recipes', 'plans', 'equipment'].includes(id)
        ? 'planning'
        : ['journal', 'next-use'].includes(id)
          ? 'stock'
          : ['inbox-system', 'systems'].includes(id)
            ? 'reports'
            : 'orders';
    if (action.startsWith('ww-')) {
      await this.wwUI.action(action, id, target);
      this.rememberDraft();
      return;
    }
    if (action === 'save-retry') {
      const pending = this.pendingSave;
      if (pending) await this.run(pending.work, pending.success, pending.after);
      return;
    }
    if (action === 'save-reconcile') {
      await this.run(
        async () => {},
        'Aktuellen Stand geladen. Nicht bestätigte Eingaben geschlossen.',
        undefined,
        false
      );
      return;
    }
    if (this.pendingSave)
      throw new Error('Bitte zuerst den Speichervorgang über die angezeigten Schaltflächen klären.');
    if (action === 'supplier-rules' || action === 'supplier-prices') {
      if (!this.canLeave()) return;
      this.clearEditor();
      this.view = 'suppliers';
      this.wwUI.openSupplier(action === 'supplier-rules' ? 'rules' : 'prices', id);
      return;
    }
    if (action === 'setup') {
      await this.run(() => this.store.initialize(), 'Arbeitsbereich eingerichtet. Bitte eure Daten anlegen.');
      return;
    }
    if (action === 'reload') {
      if (this.canLeave()) await this.run(async () => {}, 'Aktueller Stand aus SharePoint geladen.', undefined, false);
      return;
    }
    if (!this.state) throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
    if (this.importStarted && (action === 'nav' || action === 'cancel' || action === 'reload')) {
      await this.run(async () => {}, 'Import geschlossen und gespeicherter Stand neu geladen.', undefined, false);
      return;
    }
    if (action === 'cancel' && this.editing && this.draft) {
      this.editing = undefined;
      this.render();
      return;
    }
    if (action === 'dashboard-orders') {
      if (!this.canLeave()) return;
      this.clearEditor();
      this.view = 'orders';
      this.query = '';
      this.statusFilter = id;
      this.render();
      this.root.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
      return;
    }
    if (action === 'nav' || action === 'cancel') {
      if (action === 'nav' && !this.canLeave()) return;
      this.clearEditor();
      if (action === 'nav') {
        this.view = id as View;
        this.query = '';
        this.statusFilter = '';
      }
      this.render();
      this.root.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
      return;
    }
    if (await receiptAction(this, action, id, target)) return;
    if (await inventoryAction(this, action, id, target)) return;
    if (await masterAction(this, action, id, target)) return;
    if (overviewAction(this, action)) return;
    if (await menuAction(this, action, id)) return;
    if (await orderAction(this, action, id, target)) return;
    if (await importAction(this, action, id, target)) return;
  }
  private filterRows(): void {
    const rows = Array.from(this.root.querySelectorAll<HTMLElement>('[data-search]'));
    let shown = 0;
    const planned =
      this.root.querySelector<HTMLInputElement>('input[name=inventoryFilter]:checked,select[name=inventoryFilter]')
        ?.value === 'planned';
    const query = this.query.trim().toLocaleLowerCase('de-DE');
    for (const row of rows) {
      row.hidden =
        !(row.dataset.search || '').toLocaleLowerCase('de-DE').includes(query) ||
        (this.view === 'orders' &&
          row.dataset.orderStatus !== undefined &&
          !!this.statusFilter &&
          (this.statusFilter === 'open'
            ? row.dataset.orderStatus !== 'Entwurf' || row.dataset.orderCurrent !== 'true'
            : this.statusFilter === 'ordered'
              ? row.dataset.orderStatus !== 'Bestellt'
              : !['Abgeschlossen', 'Storniert'].includes(row.dataset.orderStatus))) ||
        (planned && row.dataset.relevant === 'false');
      if (!row.hidden) shown++;
    }
    const emptyState = this.root.querySelector<HTMLElement>('[data-filter-empty]');
    if (emptyState) emptyState.hidden = !rows.length || shown > 0;
    for (const group of Array.from(this.root.querySelectorAll<HTMLElement>('[data-count-group]'))) {
      const lines = group.querySelectorAll('.count-line:not([hidden]),.inventory-overview-row:not([hidden])').length,
        count = group.querySelector('[data-group-count]');
      group.hidden = !lines;
      if (count) count.textContent = String(lines);
    }
    if (this.inventory) updateCountTotals(this);
  }

  private async save(form: HTMLFormElement): Promise<void> {
    if (form.dataset.form === 'ingredient') {
      const { article, offer } = readIngredient(form, this.quickIngredient!),
        draft = structuredClone(this.draft!),
        previous = this.previous,
        operationId = this.operationId;
      uniqueName(this, 'articles', article);
      await this.run(
        async () => {
          await this.store.saveMaster('articles', article, undefined, operationId + '-article');
          await this.store.saveMaster('offers', offer, undefined, operationId + '-offer');
        },
        'Artikel und Liefergebinde angelegt.',
        () => {
          this.draft = draft;
          this.previous = previous;
          if (!this.draft.supplierId) {
            this.draft.supplierId = offer.supplierId;
            const supplier = this.state!.suppliers.find(s => s.value.id === offer.supplierId)!.value;
            this.draft.supplierName = supplier.name;
            this.draft.method = supplier.method;
          }
          if (this.draft.supplierId === offer.supplierId)
            this.draft.lines.push({
              id: uuid(),
              articleId: article.id,
              articleName: article.name,
              offerId: offer.id,
              code: offer.code,
              packName: offer.packName,
              packSize: offer.packSize,
              unit: article.unit,
              quantity: 0,
              priceNet: offer.priceNet,
              priorPriceNet: null,
              priceYear: null,
              reviewed: false,
              schedule: Object.fromEntries(this.draft.deliveries!.map(d => [d.id, 0]))
            });
          this.dirty = true;
        }
      );
      return;
    }
    if (form.dataset.form?.startsWith('ww-')) {
      await this.wwUI.save(form);
      return;
    }
    if (form.dataset.form === 'menu') {
      await saveMenu(this, form);
      return;
    }
    if (form.dataset.form === 'order-overview') {
      await saveOverview(this, form);
      return;
    }
    if (form.dataset.form === 'delivery-slip') {
      await saveSlip(this, form);
      return;
    }
    if (form.dataset.form === 'receipt') {
      await saveReceipt(this, form);
      return;
    }
    if (form.dataset.form === 'inventory') {
      await saveInventory(this, form, false);
      return;
    }
    if (form.dataset.form === 'order') {
      await saveOrder(this, form, false);
      return;
    }
    if (form.dataset.form === 'copy') {
      const source = this.copySource!.value,
        data = new FormData(form);
      const dates = Object.fromEntries(
        withSchedule(source).deliveries!.map(d => [d.id, String(data.get('copydate_' + d.id) || '')])
      );
      const copied = copyScheduledOrder(
        source,
        this.season()!,
        this.area,
        this.state!,
        dates,
        withSchedule(source)
          .lines.filter(l => data.has('copyline_' + l.id))
          .map(l => l.id)
      );
      const existing = this.state!.orders.find(o => o.value.id === copied.id);
      if (existing) {
        this.clearEditor();
        this.selectedOrder = existing.value.id;
        this.info = 'Diese Vorjahresübernahme ist bereits vorhanden.';
        this.render();
        return;
      }
      const target = this.state!.seasons.find(x => x.value.id === this.seasonId)!;
      const mapped = { ...target.value.copyDates };
      for (const d of withSchedule(source).deliveries!) {
        if (d.date && dates[d.id]) mapped[d.date] = dates[d.id];
      }
      await this.run(
        async () => {
          await this.store.saveOrder(copied, undefined, this.operationId);
          await this.store.saveMaster(
            'seasons',
            { ...target.value, copyDates: mapped },
            target,
            this.operationId + '-dates'
          );
        },
        'Ausgewählte Positionen als neuer Entwurf übernommen.',
        () => {
          this.draft = structuredClone(copied);
          this.previous = this.state!.orders.find(o => o.value.id === copied.id);
        }
      );
      return;
    }

    if (form.dataset.form !== 'master' || !this.editing) return;
    const resume = this.draft ? structuredClone(this.draft) : undefined,
      previousOrder = this.previous;
    const resumeOrder = (): void => {
      if (resume) {
        this.draft = resume;
        this.previous = previousOrder;
        this.dirty = true;
      }
    };
    const editing = this.editing,
      data = new FormData(form);
    const get = (name: string): string => String(data.get(name) || '').trim();
    if (editing.kind === 'seasons') {
      const old = editing.value as Season;
      const list = (name: string): string[] => [
        ...new Set(
          get(name)
            .split(/\r?\n/)
            .map(x => x.trim())
            .filter(Boolean)
        )
      ];
      const value: Season = {
        ...old,
        id: old.id,
        name: get('name'),
        year: Number(get('year')),
        archived: data.has('archived'),
        operatingDays: [
          ...new Set(
            data
              .getAll('operatingDays')
              .map(x => String(x).trim())
              .filter(Boolean)
          )
        ].sort(),
        deliveryPlaces: list('deliveryPlaces'),
        storagePlaces: list('storagePlaces'),
        units: list('units'),
        contact: get('contact')
      };
      if (this.state!.seasons.some(s => s.value.id !== value.id && s.value.year === value.year))
        throw new Error('Für dieses Jahr gibt es bereits eine Saison. Bitte die vorhandene Saison wählen.');
      await this.run(
        () =>
          this.store.saveMaster(
            'seasons',
            value,
            this.state!.seasons.find(s => s.value.id === editing.id),
            this.operationId
          ),
        'Saison gespeichert und nachgelesen.',
        () => {
          this.seasonId = value.id;
        }
      );
      return;
    }
    if (editing.kind === 'articles') {
      const old = editing.value as Article;
      const value: Article = {
        id: old.id,
        name: get('name'),
        unit: get('unit'),
        category: get('category'),
        active: data.has('active'),
        storagePlace: get('storagePlace'),
        unavailableSeasons: this.state!.seasons.filter(s => data.has('unavailable_' + s.value.id)).map(s => s.value.id)
      };
      uniqueName(this, 'articles', value);
      const supplierId = editing.id ? '' : get('supplierId');
      let offer: Offer | undefined;
      if (supplierId) {
        if (!this.state!.suppliers.some(s => s.value.id === supplierId && s.value.active))
          throw new Error('Bitte einen aktiven Lieferanten wählen.');
        const price = parseDecimal(get('priceNet'));
        offer = {
          id: uuid(),
          articleId: value.id,
          supplierId,
          code: get('code'),
          packName: get('packName') || value.unit,
          packSize: parseDecimal(get('packSize')) ?? 1,
          priceNet: price,
          priceDate: price === null ? null : berlinToday(),
          deposit: null,
          note: '',
          active: true
        };
        validateEntity('articles', value);
        validateEntity('offers', offer);
      } else if (!editing.id && (get('priceNet') || get('packName')))
        throw new Error('Für Gebinde und Preis bitte auch den Lieferanten wählen.');
      const operationId = this.operationId,
        created = offer;
      await this.run(
        async () => {
          await this.store.saveMaster(
            'articles',
            value,
            this.state!.articles.find(a => a.value.id === editing.id),
            created ? operationId + '-article' : operationId
          );
          if (created) await this.store.saveMaster('offers', created, undefined, operationId + '-offer');
        },
        created ? 'Artikel mit Gebinde und Preis angelegt.' : 'Artikel gespeichert und nachgelesen.'
      );
      return;
    }
    if (editing.kind === 'suppliers') {
      const old = editing.value as Supplier;
      const value: Supplier = {
        ...old,
        id: old.id,
        name: get('name'),
        contactPerson: get('contactPerson'),
        address: get('address'),
        phone: get('phone'),
        email: get('email'),
        method: get('method') as Method,
        customerNumber: get('customerNumber'),
        note: get('note'),
        active: data.has('active')
      };
      uniqueName(this, 'suppliers', value);
      await this.run(
        () =>
          this.store.saveMaster(
            'suppliers',
            value,
            this.state!.suppliers.find(s => s.value.id === editing.id),
            this.operationId
          ),
        'Lieferant gespeichert und nachgelesen.',
        resumeOrder
      );
      return;
    }
    if (editing.kind === 'offers') {
      const old = editing.value as Offer;
      const newPrice = parseDecimal(get('priceNet')),
        priceChanged = newPrice !== old.priceNet;
      const value: Offer = {
        ...old,
        supplierId: get('supplierId'),
        code: get('code'),
        packName: get('packName'),
        packSize: parseDecimal(get('packSize')) ?? 0,
        priceNet: newPrice,
        priceDate: priceChanged ? (newPrice === null ? null : berlinToday()) : old.priceDate,
        ...(priceChanged && newPrice !== null ? { priceStatus: 'geprueft' as const } : {}),
        deposit: parseDecimal(get('deposit')),
        note: get('note'),
        active: data.has('active')
      };
      if (!this.state!.suppliers.some(s => s.value.id === value.supplierId && s.value.active))
        throw new Error('Bitte einen aktiven Lieferanten wählen.');
      if (
        this.state!.offers.some(
          o =>
            o.value.id !== value.id &&
            o.value.articleId === value.articleId &&
            o.value.supplierId === value.supplierId &&
            o.value.packName.toLocaleLowerCase('de-DE') === value.packName.toLocaleLowerCase('de-DE') &&
            o.value.active
        )
      )
        throw new Error('Ein solches Lieferangebot ist bereits vorhanden. Bitte das vorhandene Angebot bearbeiten.');
      await this.run(
        () =>
          this.store.saveMaster(
            'offers',
            value,
            this.state!.offers.find(o => o.value.id === editing.id),
            this.operationId
          ),
        'Lieferangebot gespeichert und nachgelesen.'
      );
      return;
    }
    if (editing.kind === 'counts') {
      if (!this.writable()) throw new Error('Bitte eine aktive Saison wählen.');
      const article = this.state!.articles.find(a => a.value.id === get('articleId') && a.value.active)?.value;
      if (!article) throw new Error('Bitte einen aktiven Artikel wählen.');
      const amount = parseDecimal(get('quantity'));
      if (amount === null) throw new Error('Bitte die gezählte Menge eingeben; null ist eine gültige Menge.');
      const value: Count = {
        id: editing.value.id,
        seasonId: this.seasonId,
        area: this.area,
        articleId: article.id,
        articleName: article.name,
        unit: article.unit,
        quantity: amount,
        countedAt: new Date().toISOString(),
        countedBy: this.user,
        note: get('note'),
        reorder: get('assessment') === 'reorder',
        surplus: get('assessment') === 'surplus'
      };
      await this.run(
        () => this.store.saveMaster('counts', value, undefined, this.operationId),
        'Bestandsmeldung gespeichert und nachgelesen.'
      );
    }
  }
}
