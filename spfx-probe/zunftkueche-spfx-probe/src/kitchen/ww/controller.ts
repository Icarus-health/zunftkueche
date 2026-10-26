import type { Area, Order, Stored, Workspace } from '../model';
import type { PriceList, Rule, Slot, Template, WwDocument, Recipe, Plan, Movement, Bill, BillLine } from './model';
import type { WwStore } from './store';
import type { Screen } from './common';
import { today } from './common.ts';
import { button, h, empty } from '../markup.ts';
import { parseDecimal } from '../domain.ts';
import { documents } from './model.ts';
import { templateOrders, validateDocument, offerIdentity } from './domain.ts';
import { procurementForm, procurementLine, procurementOverview, templateUse } from './procurement-view.ts';
import { operationForm, operationLine, operationOverview, demandView } from './operations-view.ts';
import { planProcurementForm, planOrders } from './plan-procurement.ts';
import { exportBusinessRows } from './reports.ts';
import { TableWizard } from './table-wizard.ts';
import { billsOverview, billForm, billLine, billDetail } from './bills-view.ts';
import { billProposal } from '../imports/bill-proposal.ts';
import { sha256 } from '../imports/identity.ts';
export interface Ports {
    root: HTMLElement;
    state: () => Workspace;
    season: () => string;
    area: () => Area;
    actor: string;
    store: WwStore;
    canLeave: () => boolean;
    resetDirty: () => void;
    markDirty: () => void;
    redraw: () => void;
    mutate: (work: () => Promise<unknown>, message: string, after?: () => void) => Promise<void>;
    orders: (orders: Order[], operationId: string) => Promise<unknown>;
}
export class WwController {
    public screen: Screen | '' = '';
    private draft?: WwDocument;
    private previous?: Stored<WwDocument>;
    private useTemplate?: Template;
    private demand?: Plan;
    private wizard?: TableWizard;
    private procurementPlan?: Plan;
    private place = '';
    private sourceText = '';
    private billUpload?: {
        bytes: Uint8Array;
        hash: string;
    };
    private billViewing?: Stored<Bill>;
    private operationId = crypto.randomUUID();
    public constructor(private readonly p: Ports) { }
    public clear(): void { this.screen = ''; this.draft = undefined; this.previous = undefined; this.useTemplate = undefined; this.demand = undefined; this.wizard = undefined; this.procurementPlan = undefined; this.sourceText = ''; this.billUpload = undefined; this.billViewing = undefined; this.operationId = crypto.randomUUID(); }
    private docs(): WwDocument[] { return (this.p.state().ww?.records || []).map(r => r.value); }
    public render(): string { if (!this.p.state().ww?.ready)
        return `<section class="panel"><h1>Warenwirtschaft erweitern</h1><p>Die neuen Bereiche speichern ihre Daten getrennt von euren bisherigen Bestellungen. Die vorhandenen Daten bleiben erhalten.</p>${button('ww-setup', 'Neue Bereiche einrichten', '', true)}</section>`; if (this.procurementPlan)
        return planProcurementForm(this.procurementPlan, this.p.state()); if (this.wizard)
        return this.wizard.render(); if (this.billViewing)
        return billDetail(this.billViewing, this.p.state()); if (this.draft?.kind === 'bill')
        return billForm(this.draft, this.p.state(), this.sourceText); if (this.screen === 'bills')
        return billsOverview(this.p.state(), this.p.area()); if (this.screen === 'systems')
        return this.systems(); if (this.demand)
        return demandView(this.demand, this.p.state()); if (this.draft && ['recipe', 'plan', 'movement'].includes(this.draft.kind))
        return operationForm(this.draft as Recipe | Plan | Movement, this.p.state()); if (this.useTemplate)
        return templateUse(this.useTemplate, documents(this.p.state().ww, 'slot'), this.p.state()); if (this.draft && ['slot', 'rule', 'template', 'prices'].includes(this.draft.kind))
        return procurementForm(this.draft as Slot | Rule | Template | PriceList, this.p.state()); return procurementOverview(this.screen as Screen, this.docs(), this.p.state(), this.p.area()) || operationOverview(this.screen, this.p.state(), this.p.area(), this.p.season(), this.place) || empty('Diesen Bereich bitte über die Navigation öffnen.'); }
    public renderPlanning(): string { return operationOverview('recipes',this.p.state(),this.p.area(),this.p.season()); }
    public billForOrder(id:string):void { const order=this.p.state().orders.find(o=>o.value.id===id)?.value;if(!order)throw new Error('Bestellung fehlt.');this.clear();this.screen='bills';this.draft={...this.create('bill') as Bill,supplierId:order.supplierId,orderIds:[id],name:'Rechnung · '+order.supplierName}; }
    public open(screen: Screen): void { this.clear(); this.screen = screen; this.p.redraw(); }
    private create(kind: WwDocument['kind']): WwDocument { const common = { id: crypto.randomUUID(), scope: ['slot', 'plan', 'bill', 'movement', 'system'].includes(kind) ? this.p.season() : 'global', at: new Date().toISOString(), by: this.p.actor, confirmed: false }; const supplierId = this.p.state().suppliers.find(s => s.value.active)?.value.id || ''; if (kind === 'slot')
        return { ...common, kind, name: '', date: today(), time: '', place: this.p.area() }; if (kind === 'rule')
        return { ...common, kind, supplierId, weekdays: [3, 5, 6, 0], leadDays: 1, cutoff: '', minNet: null, feeNet: null, note: '' }; if (kind === 'template')
        return { ...common, kind, name: '', supplierId, area: this.p.area(), lines: [], note: '' }; if (kind === 'prices')
        return { ...common, kind, name: '', supplierId, validFrom: today(), lines: [] }; if (kind === 'recipe')
        return { ...common, kind, familyId: common.id, name: '', category: '', yield: 1, salePriceGross: null, ingredients: [] }; if (kind === 'plan')
        return { ...common, kind, name: '', area: this.p.area(), date: today(), lines: [], note: '' }; if (kind === 'movement')
        return { ...common, kind, area: this.p.area(), articleId: this.p.state().articles.find(a => a.value.active)?.value.id || '', quantity: 0, unit: '', type: 'waste', place: '', toArea: null, toPlace: '', note: '' }; if (kind === 'bill')
        return { ...common, kind, name: '', supplierId, number: '', date: today(), area: this.p.area(), orderIds: [], fileHash: '', fileName: '', attachment: '', net: null, tax: null, gross: null, adjustmentNet: 0, lines: [], note: '' }; throw new Error('Vorgangsart ist noch nicht ausgewählt.'); }
    public async action(action: string, id: string, target?: HTMLElement): Promise<void> {
        if (this.wizard && await this.wizard.action(action))
            return;
        if (action === 'ww-system-new' || action === 'ww-price-import') {
            if (!this.p.canLeave())
                return;
            const operationId = this.operationId;
            this.wizard = new TableWizard(action === 'ww-price-import' ? 'prices' : 'system', { root: this.p.root, state: this.p.state, season: this.p.season, area: this.p.area, actor: this.p.actor, redraw: this.p.redraw, commit: async (doc, profile, previous) => { await this.p.mutate(async () => { if (profile)
                    await this.p.store.save(profile, previous, operationId + '-profile'); await this.p.store.save(doc, undefined, operationId); }, 'Geprüfte Datei übernommen und nachgelesen.', () => { this.screen = doc.kind === 'prices' ? 'prices' : 'systems'; }); } });
            this.p.redraw();
            return;
        }
        if (action === 'ww-bill-view') {
            if (!this.p.canLeave())
                return;
            this.billViewing = this.p.state().ww?.records.find(r => r.value.id === id && r.value.kind === 'bill') as Stored<Bill> | undefined;
            this.p.redraw();
            return;
        }
        if (action === 'ww-bill-original') {
            const row = this.p.state().ww?.records.find(r => r.value.id === id && r.value.kind === 'bill');
            if (!row)
                throw new Error('Beleg fehlt.');
            const bytes = await this.p.store.readOriginal(row), url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })), a = document.createElement('a');
            a.href = url;
            a.download = (row.value as Bill).fileName || 'Original.pdf';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
        if (action === 'ww-pdf-read') {
            const form = this.p.root.querySelector<HTMLFormElement>('form[data-form=ww-bill]');
            if (!form || this.draft?.kind !== 'bill')
                return;
            const file = form.querySelector<HTMLInputElement>('[name=pdf]')!.files?.[0];
            if (!file || file.size > 8 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf'))
                throw new Error('PDF bis 8 MB auswählen.');
            const bytes = new Uint8Array(await file.arrayBuffer());
            if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
                throw new Error('Datei ist kein PDF.');
            this.draft = this.readBill(form, this.draft);
            this.billUpload = { bytes, hash: await sha256(bytes) };
            this.draft.fileHash = this.billUpload.hash;
            this.draft.fileName = file.name;
            this.draft.attachment = '';
            let text = '';
            try {
                const reader = await import(/* webpackChunkName: 'kitchen-pdf-reader' */ '../imports/pdf-reader.ts');
                text = await reader.readPdfText(bytes);
            }
            catch (error) {
                this.sourceText = error instanceof Error ? error.message : 'PDF manuell erfassen.';
                this.p.markDirty();
                this.p.redraw();
                return;
            }
            const proposal = billProposal(text);
            if (!this.draft.number)
                this.draft.number = proposal.number;
            if (proposal.date)
                this.draft.date = proposal.date;
            if (!this.draft.name)
                this.draft.name = file.name;
            if (this.draft.net === null)
                this.draft.net = proposal.net;
            if (this.draft.tax === null)
                this.draft.tax = proposal.tax;
            if (this.draft.gross === null)
                this.draft.gross = proposal.gross;
            this.sourceText = text;
            this.p.markDirty();
            this.p.redraw();
            return;
        }
        if (action === 'ww-export' || action === 'ww-backup') {
            const backup = action === 'ww-backup', data = backup ? JSON.stringify({ format: 'zunftkueche-season-backup', version: 1, exportedAt: new Date().toISOString(), seasonId: this.p.season(), area: this.p.area(), workspace: this.p.state() }, null, 2) : exportBusinessRows(this.p.state(), this.p.season(), this.p.area());
            const url = URL.createObjectURL(new Blob([data], { type: backup ? 'application/json' : 'text/csv;charset=utf-8' })), a = document.createElement('a');
            a.href = url;
            a.download = 'Zunftkueche-' + this.p.season() + (backup ? '.json' : '.csv');
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return;
        }
        if (action === 'ww-resume-import') {
            const operationId = this.operationId;
            await this.p.mutate(() => this.p.store.resumeImport(id, operationId), 'Import abgeschlossen und nachgelesen.', () => { this.screen = 'systems'; });
            return;
        }
        if (action === 'ww-menu-plan') {
            if (!this.p.canLeave())
                return;
            const source = documents(this.p.state().ww, 'system').find(d => d.id === id && d.confirmed && d.purpose === 'menuOrders');
            if (!source)
                throw new Error('Bestätigter Menüimport fehlt.');
            const dates = [...new Set(source.rows.filter(r => r.status === 'active').map(r => r.date))];
            const operationId = this.operationId;
            const plans = dates.map(date => { const sums = new Map<string, number>(); for (const r of source.rows.filter(r => r.date === date && r.status === 'active'))
                sums.set(r.productId, (sums.get(r.productId) || 0) + r.quantity); return { id: 'menu-plan:' + source.id + ':' + date, kind: 'plan' as const, scope: source.scope, at: source.at, by: this.p.actor, confirmed: false, name: 'Menübedarf · ' + date, area: source.area, date, lines: [...sums].map(([recipeId, portions]) => ({ recipeId, portions })), note: 'Grundlage: Menüimport ' + source.id + '. Keine zusätzliche manuelle Portionsplanung für dieselben Vorbestellungen addieren.' }; });
            await this.p.mutate(async () => { for (const plan of plans)
                await this.p.store.save(plan, undefined, operationId + '-' + plan.date); }, 'Menübedarf als getrennte Tagespläne übernommen.', () => { this.screen = 'plans'; });
            return;
        }
        if (action === 'ww-place') {
            if (!this.p.canLeave())
                return;
            this.place = id;
            this.p.redraw();
            return;
        }
        if (action === 'ww-open') {
            if (this.p.canLeave())
                this.open(id as Screen);
            return;
        }
        if (action === 'ww-setup') {
            const screen = this.screen;
            await this.p.mutate(() => this.p.store.initialize(), 'Neue Bereiche eingerichtet und geprüft.', () => { this.screen = screen; });
            return;
        }
        if (action === 'ww-cancel') {
            const screen = this.screen;
            this.clear();
            this.screen = screen;
            this.p.resetDirty();
            this.p.redraw();
            return;
        }
        if (action === 'ww-new') {
            if (!this.p.canLeave())
                return;
            this.previous = undefined;
            this.draft = this.create(id as WwDocument['kind']);
            this.operationId = crypto.randomUUID();
            this.p.redraw();
            return;
        }
        if (action === 'ww-edit') {
            if (!this.p.canLeave())
                return;
            const previous = this.p.state().ww?.records.find(r => r.value.id === id);
            if (!previous)
                throw new Error('Vorgang nicht gefunden.');
            this.previous = previous;
            this.draft = structuredClone(previous.value);
            if (this.draft.confirmed && this.draft.kind === 'recipe') {
                this.draft = { ...this.draft, id: crypto.randomUUID(), confirmed: false, at: new Date().toISOString(), by: this.p.actor };
                this.previous = undefined;
            }
            if (this.draft.confirmed && this.draft.kind === 'prices') {
                this.draft = { ...this.draft, id: crypto.randomUUID(), confirmed: false, at: new Date().toISOString(), by: this.p.actor, name: this.draft.name + ' · neu' };
                this.previous = undefined;
            }
            this.operationId = crypto.randomUUID();
            this.p.redraw();
            return;
        }
        if (action === 'ww-add') {
            const form = this.p.root.querySelector<HTMLFormElement>('form.ww-editor');
            if (!form || !this.draft)
                return;
            if (this.draft.kind === 'bill') {
                form.querySelector('.ww-lines')!.insertAdjacentHTML('beforeend', billLine(this.p.state()));
                this.p.markDirty();
                return;
            }
            if (this.draft.kind === 'recipe' || this.draft.kind === 'plan') {
                form.querySelector('.ww-lines')!.insertAdjacentHTML('beforeend', operationLine(this.draft.kind, this.p.state()));
                this.p.markDirty();
                return;
            }
            if (!['template', 'prices'].includes(this.draft.kind))
                return;
            const supplierId = String(new FormData(form).get('supplierId') || '');
            form.querySelector('.ww-lines')!.insertAdjacentHTML('beforeend', procurementLine(this.draft.kind as 'template' | 'prices', this.p.state(), supplierId));
            this.p.markDirty();
            return;
        }
        if (action === 'ww-remove') {
            target?.closest('[data-line]')?.remove();
            this.p.markDirty();
            return;
        }
        if (action === 'ww-procure') {
            if (!this.p.canLeave())
                return;
            this.procurementPlan = documents(this.p.state().ww, 'plan').find(d => d.id === id);
            this.p.redraw();
            return;
        }
        if (action === 'ww-demand') {
            if (!this.p.canLeave())
                return;
            this.demand = documents(this.p.state().ww, 'plan').find(d => d.id === id);
            this.p.redraw();
            return;
        }
        if (action === 'ww-use') {
            if (!this.p.canLeave())
                return;
            this.useTemplate = documents(this.p.state().ww, 'template').find(d => d.id === id);
            if (!this.useTemplate)
                throw new Error('Ordersatz nicht gefunden.');
            this.p.redraw();
            return;
        }
    }
    public async save(form: HTMLFormElement): Promise<void> {
        const data = new FormData(form), get = (key: string): string => String(data.get(key) || '').trim();
        const screen = this.screen;
        if (form.dataset.form === 'ww-procure') {
            const slot = documents(this.p.state().ww, 'slot').find(s => s.id === get('slot'));
            if (!slot)
                throw new Error('Liefertermin wählen.');
            const allocations = Array.from(form.querySelectorAll<HTMLElement>('[data-allocation]')).map(r => ({ articleId: r.dataset.allocation!, offerId: r.querySelector<HTMLSelectElement>('[name=offerId]')!.value, stockUse: parseDecimal(r.querySelector<HTMLInputElement>('[name=stockUse]')!.value)!, incomingUse: parseDecimal(r.querySelector<HTMLInputElement>('[name=incomingUse]')!.value)! }));
            const orders = planOrders(this.procurementPlan!, slot, this.p.state(), allocations), operationId = this.operationId;
            await this.p.mutate(() => this.p.orders(orders, operationId), 'Bestellentwürfe aus geprüftem Bedarf angelegt.', () => { this.screen = 'plans'; });
            return;
        }
        if (form.dataset.form === 'ww-use') {
            const template = this.useTemplate!;
            const ids = data.getAll('slot').map(String);
            if (!ids.length)
                throw new Error('Bitte mindestens einen Liefertermin wählen.');
            const slots = documents(this.p.state().ww, 'slot').filter(s => ids.includes(s.id));
            if (slots.length !== ids.length)
                throw new Error('Liefertermine wurden geändert. Bitte neu laden.');
            const orders = slots.flatMap(slot => templateOrders({ ...template, lines: template.lines.map((l, i) => ({ ...l, quantity: parseDecimal(get('qty_' + slot.id + '_' + i)) })) }, [slot], this.p.state(), documents(this.p.state().ww, 'prices')));
            const operationId = this.operationId;
            await this.p.mutate(() => this.p.orders(orders, operationId), 'Bestellentwürfe angelegt und nachgelesen.', () => { this.screen = 'templates'; });
            return;
        }
        if (!this.draft)
            throw new Error('Eingabemaske fehlt.');
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
            doc.minNet = parseDecimal(get('minNet'));
            doc.feeNet = parseDecimal(get('feeNet'));
            doc.note = get('note');
        }
        if (doc.kind === 'template' || doc.kind === 'prices') {
            doc.name = get('name');
            doc.supplierId = get('supplierId');
            const lines = Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => { const value = (name: string): string => (row.querySelector<HTMLInputElement | HTMLSelectElement>('[name="' + name + '"]')?.value || '').trim(); const offerId = value('offerId'); if (!this.p.state().offers.some(o => o.value.id === offerId && o.value.active && o.value.supplierId === doc.supplierId))
                throw new Error('Jeden Lieferartikel passend zum Lieferanten auswählen.'); return doc.kind === 'template' ? { offerId, quantity: parseDecimal(value('quantity')) } : { offerId, priceNet: parseDecimal(value('priceNet')), deposit: parseDecimal(value('deposit')) }; });
            if (doc.kind === 'template') {
                doc.lines = lines as Template['lines'];
                doc.note = get('note');
            }
            else {
                doc.lines = (lines as PriceList['lines']).map(l => ({ ...l, offerSignature: offerIdentity(this.p.state().offers.find(o => o.value.id === l.offerId)!.value) }));
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
            doc.ingredients = Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => { const articleId = row.querySelector<HTMLSelectElement>('[name=articleId]')!.value; const article = this.p.state().articles.find(a => a.value.id === articleId && a.value.active)?.value; if (!article)
                throw new Error('Zutat bitte auswählen.'); return { articleId, quantity: parseDecimal(row.querySelector<HTMLInputElement>('[name=quantity]')!.value)!, unit: article.unit }; });
        }
        if (doc.kind === 'plan') {
            doc.name = get('name');
            doc.date = get('date');
            doc.note = get('note');
            doc.lines = Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => { const recipeId = row.querySelector<HTMLSelectElement>('[name=recipeId]')!.value; if (!documents(this.p.state().ww, 'recipe').some(r => r.id === recipeId && r.confirmed))
                throw new Error('Bestätigtes Rezept auswählen.'); return { recipeId, portions: parseDecimal(row.querySelector<HTMLInputElement>('[name=portions]')!.value)! }; });
        }
        if (doc.kind === 'movement') {
            doc.articleId = get('articleId');
            const article = this.p.state().articles.find(a => a.value.id === doc.articleId && a.value.active)?.value;
            if (!article)
                throw new Error('Artikel bitte prüfen.');
            doc.unit = article.unit;
            doc.type = get('type') as Movement['type'];
            doc.quantity = parseDecimal(get('quantity'))!;
            doc.at = new Date(get('at')).toISOString();
            doc.place = get('place');
            doc.toArea = doc.type === 'transfer' ? get('toArea') as Area : null;
            doc.toPlace = doc.type === 'transfer' ? get('toPlace') : '';
            doc.note = get('note');
            doc.confirmed = true;
        }
        if (doc.kind === 'bill') {
            const bill = this.readBill(form, doc);
            const previous = this.previous, operationId = this.operationId, upload = this.billUpload;
            validateDocument({ ...bill, attachment: upload ? 'original-' + upload.hash + '.pdf' : bill.attachment });
            await this.p.mutate(async () => { if (!upload)
                return this.p.store.save(bill, previous, operationId); const current = await this.p.store.get(bill.id); if (current?.operationId === operationId)
                return current; const stage = { ...bill, confirmed: false, attachment: '' }; const saved = current?.operationId === operationId + '-stage' ? current : await this.p.store.save(stage, previous, operationId + '-stage'); const attachment = await this.p.store.attachOriginal(saved, upload.bytes, upload.hash, 'pdf'); return this.p.store.save({ ...bill, attachment }, saved, operationId); }, 'Rechnung und Original gespeichert und nachgelesen.', () => { this.screen = 'bills'; });
            return;
        }
        validateDocument(doc);
        const previous = this.previous, operationId = this.operationId;
        await this.p.mutate(() => this.p.store.save(doc, previous, operationId), 'Gespeichert und durch Lesen bestätigt.', () => { this.screen = screen; });
    }
    private readBill(form: HTMLFormElement, doc: Bill): Bill { const data = new FormData(form), get = (k: string): string => String(data.get(k) || '').trim(); const supplierId = get('supplierId'); const orderIds = this.p.state().orders.filter(o => data.has('order_' + o.value.id)).map(o => { if (o.value.supplierId !== supplierId || o.value.seasonId !== doc.scope || o.value.area !== doc.area)
        throw new Error('Zugeordnete Bestellung muss zu Lieferant, Saison und Bereich passen.'); return o.value.id; }); return { ...doc, name: get('name'), supplierId, number: get('number'), date: get('date'), net: parseDecimal(get('net')), tax: parseDecimal(get('tax')), gross: parseDecimal(get('gross')), adjustmentNet: parseDecimal(get('adjustmentNet')) ?? 0, note: get('note'), confirmed: data.has('confirmed'), orderIds, lines: Array.from(form.querySelectorAll<HTMLElement>('[data-line]')).map(row => { const get = (k: string): string => row.querySelector<HTMLInputElement | HTMLSelectElement>('[name=' + k + ']')!.value.trim(); return { id: row.dataset.id!, articleId: get('articleId') || null, name: get('lineName'), quantity: parseDecimal(get('quantity')), unit: get('unit'), unitNet: parseDecimal(get('unitNet')), totalNet: parseDecimal(get('totalNet')), taxRate: parseDecimal(get('taxRate')) } as BillLine; }) }; }
    private systems(): string { const docs = documents(this.p.state().ww, 'system').filter(d => d.area === this.p.area()); const replaced = new Set(docs.filter(d => d.confirmed).map(d => d.replacesId)); return `<div class="page-heading"><div><h1>Kassen- und Bestellsystem</h1><p>Verkäufe auswerten und Menüvorbestellungen als Planbedarf übernehmen.</p></div>${button('ww-system-new', 'Excel / CSV importieren', '', true)}</div><p class="ww-alert">Verkäufe und Vorbestellungen sind getrennte Datenarten. Jeder Zeitraum wird pro Bereich und Datenart nur einmal übernommen. Erstattungen erhöhen den Küchenbestand nicht automatisch.</p><section class="panel">${docs.map(d => `<div class="listrow"><div><strong>${h(d.name)}</strong><p>${h(d.from)} bis ${h(d.to)} · ${d.purpose === 'sales' ? 'Verkäufe' : 'Menüvorbestellungen'} · ${d.rows.length} Zeilen · ${replaced.has(d.id) ? 'Ersetzt · nur Historie' : d.confirmed ? 'Bestätigt' : 'Entwurf / Übernahme prüfen'}</p><small>Preisart: ${h(d.basis)} · ${h(d.currency)}</small></div>${!d.confirmed ? button('ww-resume-import', 'Übernahme fortsetzen', d.id, true) : d.purpose === 'menuOrders' && !replaced.has(d.id) ? button('ww-menu-plan', 'Tagesbedarf planen', d.id) : ''}</div>`).join('') || empty('Noch keine Systemdaten importiert. CSV und Excel können herstellerunabhängig zugeordnet werden.')}</section><p>${documents(this.p.state().ww, 'profile').length} gespeicherte Quellen / Importprofile.</p>`; }
}
