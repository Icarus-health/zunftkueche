import {deliveryRound} from './home.ts';
import {icon} from './icons.ts';
import {readSheetOrder,orderReview} from './order-sheet.ts';
import {LocalState,formFields,restoreFields} from './local-state.ts';
import type {LocalDraft,ContextChoice} from './local-state';
import {supplierNeedsReview} from './review-status.ts';
import type {WwDraftSnapshot} from './ww/controller';
import { clearFieldError, fieldNumber } from './field-errors.ts';
import { settingsView } from './settings-view.ts';
import {ingredientForm,readIngredient} from './ingredient-form.ts';
import type {IngredientDraft} from './ingredient-form';
import { articleAvailable } from './model.ts';
import { scheduledOrder,withSchedule,copyScheduledOrder,deliveryRemaining } from './supplier-orders.ts';
import { supplierPdf } from './supplier-pdf.ts';
import { orderMailView, supplierOrderText } from './order-mail.ts';
import {deliveryMatrix,deliverySummary,supplierTools,orderGuidance,priceReview} from './supplier-forms.ts';
import { WwController } from './ww/controller.ts';
import { nextUsePlans } from './ww/operations-view.ts';
import { documents } from './ww/model.ts';
import { effectiveOffer } from './ww/domain.ts';
import { priceSuggestion } from './order-guidance.ts';
import { orderRound } from './workflow-tasks.ts';
import type { Area, Article, Count, DeliveryNote, InventorySession, Method, Offer, Order, Receipt, Season, Stored, Supplier, Workspace } from './model';
import { catalog } from './model.ts';
import { parseDecimal, validateEntity, validateOrder, orderTotal } from './domain.ts';
import { SharePointStore } from './sharepoint.ts';
import { columns, previewMasters } from './csv.ts';
import type { ImportKind } from './csv';
import { masterForm, orderForm, copyForm } from './forms.ts';
import type { Editing } from './forms';
import { h,n,money,select,note,button,panel,empty } from './markup.ts';
import { countQuantity,deliveryState,receivedQuantity,validateInventory,validateReceipt,latestCounts } from './operations.ts';
import { sidebar,dashboard,stockOverview,reportsOverview,searchField,badge,stamp,displayDate } from './workspace.ts';
import type { WorkspaceView } from './workspace';
import { receiptForm,inventoryForm,deliverySlipsView,assessmentLabel,countProgress,countShare } from './operation-forms.ts';

import { slipExtension, slipFileLimit } from './delivery-slip.ts';
import type { SlipFile } from './delivery-slip';
import { sha256 } from './imports/identity.ts';

type View = WorkspaceView;
interface ImportItem { kind: ImportKind; value: Article | Supplier; done: boolean }
const uuid=(): string=>crypto.randomUUID();
const message=(error: unknown): string=>error instanceof Error?error.message:'Verbindung fehlgeschlagen. Bitte neu laden und gespeicherten Stand prüfen.';

interface RecoveryData {view:View;orderReview?:boolean;editing?:Editing;draft?:Order;previous?:Stored<Order>;copySource?:Stored<Order>;receiving?:{previous:Stored<Order>;id:string;deliveryId?:string};inventory?:InventorySession;inventoryPrevious?:Stored<InventorySession>;quickIngredient?:IngredientDraft;operationId:string;ww?:WwDraftSnapshot;masterEtag?:string;countEdits:Array<[string,string]>}
function ownEntry(state:unknown):boolean{return !!state&&typeof state==='object'&&(state as {zunftkueche?:unknown}).zunftkueche===true;}
export class KitchenView {
 private readonly local:LocalState;
 private recovery?:LocalDraft<RecoveryData>;
 private viaKeyboard=false;
 private focusMemo='';
 /** One history entry of our own is on the stack while the app shows anything but the overview. */
 private guard=false;
 private ignorePop=0;
 /** Browser back and the back gesture go one step up inside the app instead of leaving the page. */
 private readonly popstate=(event:Event):void=>{
  if(this.ignorePop>0){this.ignorePop--;return;}
  if(ownEntry((event as PopStateEvent).state)){this.guard=true;return;}
  if(!this.guard)return;
  this.guard=false;this.stepBack();
 };
 private readonly keydown=(event:Event):void=>{if((event as KeyboardEvent).key==='Escape'&&this.closeMenu(true))event.preventDefault();};
 private readonly beforeUnload=(event:BeforeUnloadEvent):void=>{if(this.dirty){this.rememberDraft();event.preventDefault();event.returnValue='';}};
 private rememberDraft():void{
  if(!this.dirty||this.busy)return;const form=this.root.querySelector<HTMLFormElement>('form[data-form]');if(!form)return;
  const ww=this.wwUI.captureDraft();if(!ww&&!this.editing&&!this.draft&&!this.inventory&&!this.receiving&&!this.copySource&&!this.quickIngredient)return;
  const data:RecoveryData={view:this.view,orderReview:this.orderReview,editing:this.editing,draft:this.draft,previous:this.previous,copySource:this.copySource,receiving:this.receiving,inventory:this.inventory,inventoryPrevious:this.inventoryPrevious,quickIngredient:this.quickIngredient,operationId:this.operationId,ww,masterEtag:this.editing?this.state?.[this.editing.kind].find(r=>r.value.id===this.editing!.id)?.etag:undefined,countEdits:[...this.countEdits]};
  const saved=this.local.write('draft',{version:1,at:new Date().toISOString(),context:{area:this.area,seasonId:this.seasonId},form:form.dataset.form,fields:formFields(form),lineCount:form.querySelectorAll('[data-line]').length,data});
  this.info=saved?'Auf diesem Gerät gesichert · im Team noch nicht gespeichert.':'Eingaben noch nicht gesichert. Bitte vor dem Schließen speichern.';this.paintStatus();
 }
 private rememberContext():void{this.local.write('context',{area:this.area,seasonId:this.seasonId});}
 private async resumeDraft():Promise<void>{
  const saved=this.recovery;if(!saved||saved.version!==1||saved.lineCount>1000||saved.lineCount<0||saved.fields.length>25000)throw new Error('Entwurf ist nicht lesbar.');
  const season=this.state?.seasons.find(s=>s.value.id===saved.context.seasonId)?.value;if(!season||season.archived)throw new Error('Die Saison dieses Entwurfs ist nicht mehr bearbeitbar. Eingaben herunterladen oder verwerfen.');
  this.seasonId=season.id;this.area=saved.context.area;if(this.store.ww)this.state!.ww=await this.store.ww.load(season.id);
  const d=saved.data,refs=[d.previous,d.receiving?.previous,d.inventoryPrevious,d.ww?.previous].filter((r):r is Stored<Order>|Stored<InventorySession>|Stored<import('./ww/model').WwDocument>=>!!r),current=[...this.state!.orders,...(this.state!.inventories||[]),...(this.state!.ww?.records||[])];
  if(refs.some(r=>current.find(c=>c.value.id===r.value.id)?.etag!==r.etag)||(d.editing?.id&&this.state![d.editing.kind].find(r=>r.value.id===d.editing!.id)?.etag!==d.masterEtag))throw new Error('Der gespeicherte Vorgang wurde inzwischen geändert. Der lokale Entwurf wird nicht darübergeschrieben. Bitte Eingaben herunterladen und den aktuellen Stand neu öffnen.');
  this.clearEditor();this.view=d.view;this.orderReview=d.orderReview||false;this.editing=d.editing;this.draft=d.draft;this.previous=d.previous;this.copySource=d.copySource;this.receiving=d.receiving;this.inventory=d.inventory;this.inventoryPrevious=d.inventoryPrevious;this.quickIngredient=d.quickIngredient;this.operationId=d.operationId;this.countEdits=new Map(d.countEdits||[]);if(d.ww)this.wwUI.restoreDraft(d.ww);this.recovery=undefined;this.dirty=true;this.render();this.wwUI.restoreRows(saved.lineCount);this.wwUI.restoreMaterialRows(saved.fields.filter(f=>f.name==='materialArticleId').length);const form=this.root.querySelector<HTMLFormElement>('form[data-form]');if(form&&form.dataset.form===saved.form)restoreFields(form,saved.fields);this.applyDeliveryView();this.updateCountTotals();this.updateOrderTotals();this.wwUI.updateCosts();this.info='Lokalen Entwurf wieder aufgenommen. Bitte prüfen und speichern. Dateien bei Bedarf erneut auswählen.';this.paintStatus();this.rememberContext();
 }

 private state?: Workspace;
 private readonly wwUI: WwController;
 private view: View='heute';
 private area: Area='Küche';
 private seasonId='';
 private editing?: Editing;
 private draft?: Order;
 private orderReview=false;
 private mailOrder?:Order;
 private previous?: Stored<Order>;
 private copySource?: Stored<Order>;
 private selectedOrder='';
 private receiving?:{previous:Stored<Order>;id:string;deliveryId?:string};
 private inventory?:InventorySession;
 private inventoryPrevious?:Stored<InventorySession>;
 private countEdits=new Map<string,string>();
 private query='';
 private statusFilter='';
 private quickIngredient?:IngredientDraft;
 private copyPicker=false;
 private reorderPicker=false;
 private roundPicker=false;
 private deliveryPicker=false;
 private sourceSeason='';
 private importKind?: ImportKind;
 private importItems?: ImportItem[];
 private importErrors:string[]=[];
 private importText?:string;
 private importStarted=false;
 private pendingSave?:{work:()=>Promise<unknown>;success:string;after?:()=>void};
 private dirty=false;
 private busy=false;
 private operationId=uuid();
 private info='';
 private error='';
 private needsSetup=false;
 private locked:Array<[HTMLInputElement|HTMLSelectElement|HTMLButtonElement|HTMLTextAreaElement,boolean]>=[];
 /** Control that started the current action. Errors are repeated next to it when the page status line is out of sight. */
 private trigger?:HTMLElement;
 /** Identifies the page currently shown, so a new page starts at the top while redraws of the same page keep their place. */
 private shownPage?:string;
 private readonly click=(event:Event):void=>{this.viaKeyboard=(event as MouseEvent).detail===0;if(!(event.target instanceof Element&&event.target.closest('.sidebar nav')))this.closeMenu();const target=event.target instanceof Element?event.target.closest<HTMLButtonElement>('button[data-action]'):undefined;if(target&&!this.busy){this.trigger=target;this.action(target.dataset.action!,target.dataset.id||'',target).catch(e=>this.showError(e));}};
 private readonly submit=(event:Event):void=>{if(!(event.target instanceof HTMLFormElement))return;event.preventDefault();if(!this.busy){this.trigger=(event as SubmitEvent).submitter||event.target.querySelector<HTMLElement>('button[type=submit]')||undefined;this.save(event.target).catch(e=>this.showError(e));}};
 private readonly input=(event:Event):void=>{if(!(event.target instanceof Element))return;this.trigger=undefined;const target=event.target as HTMLInputElement;target.dataset.userEdited='true';if(target.dataset.fieldErrorId){clearFieldError(target);this.error='';}if(target.name==='inventoryFilter'||target.name==='deliveryView'||target.name==='receiptDelivery')return;if(target.name==='sheetSearch'){const q=target.value.toLocaleLowerCase('de-DE').trim();let visible=0;for(const row of Array.from(this.root.querySelectorAll<HTMLElement>('[data-sheet-row]'))){row.hidden=!(row.dataset.search||'').toLocaleLowerCase('de-DE').includes(q);if(!row.hidden)visible++;}const empty=this.root.querySelector<HTMLElement>('[data-sheet-empty]');if(empty)empty.hidden=visible>0;return;}if(target.name==='workspaceSearch'){this.query=target.value;this.filterRows();return;}if(target.closest('form')){this.dirty=true;this.info='Ungespeicherte Eingaben.';this.paintStatus();if(this.draft)this.updateOrderTotals();this.wwUI.updateCosts();if(this.inventory){const id=target.name.replace(/^(packs|loose)_/,'');if(id!==target.name)this.countEdits.set(id,new Date().toISOString());this.updateCountTotals();}this.rememberDraft();}};
 private readonly change=(event:Event):void=>{const origin=event.target;if(!(origin instanceof HTMLSelectElement)&&!(origin instanceof Element&&origin.matches('input[type=radio]')))return;const target=origin as HTMLSelectElement;this.trigger=target;try{
  if(target.name==='seasonContext'||target.name==='areaContext'){if(!this.canLeave()){target.value=target.name==='seasonContext'?this.seasonId:this.area;return;}this.clearEditor();if(target.name==='seasonContext')this.seasonId=target.value;else this.area=target.value as Area;this.rememberContext();if(this.store.ww){this.run(async()=>{},'',undefined,false).catch(e=>this.showError(e));}else this.render();}
  if(target.name==='receiptDelivery'&&this.receiving){if(this.dirty){target.value=this.receiving.deliveryId||'';throw new Error('Bitte die aktuelle Lieferannahme abschließen oder abbrechen, bevor ihr den Termin wechselt.');}this.receiving.deliveryId=target.value;this.render();}
  if(target.name==='supplierId'||target.name==='billType')this.wwUI.billContextChanged(target.name);
  if(target.name==='costMode'){
   const split=target.closest('details')?.querySelector<HTMLElement>('[data-cost-split]');
   if(split)split.hidden=target.value!=='split';
  }
  if(target.name==='profile')this.wwUI.profileChosen(target.value);
  if(target.name==='sourceSeason'){this.sourceSeason=target.value;this.render();}
  if(target.name==='orderStatus'){this.statusFilter=target.value;this.filterRows();}
  if(target.name==='inventoryFilter')this.filterRows();
  if(target.name.startsWith('assessment_')){const badge=target.closest('.count-extra')?.querySelector<HTMLElement>('[data-count-badge]');if(badge){badge.textContent=assessmentLabel(target.value);badge.hidden=!badge.textContent;}}
  if(target.name==='deliveryView')this.applyDeliveryView();
  if(target.name==='supplierId'&&this.draft&&!this.draft.lines.length){this.draft=this.readOrder(target.closest('form')!);const supplier=this.state!.suppliers.find(s=>s.value.id===target.value)?.value;if(supplier){this.draft.supplierId=supplier.id;this.draft.supplierName=supplier.name;this.draft.method=supplier.method;}this.render();}
 this.wwUI.updateCosts();if(target.closest('form')&&!['receiptDelivery','inventoryFilter','deliveryView','sourceSeason','orderStatus'].includes(target.name)){this.dirty=true;this.rememberDraft();}}catch(e){this.showError(e);}};
 public constructor(private readonly root:HTMLElement,private readonly store:SharePointStore,private readonly user:string){this.local=new LocalState(root,store.storageScope||root.ownerDocument.baseURI,user);const choice=this.local.read<ContextChoice>('context');if(choice&&['Küche','Zunftscheuer'].includes(choice.area)){this.area=choice.area;this.seasonId=choice.seasonId;}root.ownerDocument.defaultView?.addEventListener('beforeunload',this.beforeUnload);root.ownerDocument.defaultView?.addEventListener('popstate',this.popstate);root.addEventListener('click',this.click);root.addEventListener('keydown',this.keydown);root.addEventListener('submit',this.submit);root.addEventListener('input',this.input);root.addEventListener('change',this.change);this.wwUI=new WwController({root,state:()=>this.state!,loadWorkspace:()=>this.store.load(),season:()=>this.seasonId,area:()=>this.area,actor:this.user,store:this.store.ww,inbox:this.store.inbox,canLeave:()=>this.canLeave(),resetDirty:()=>{this.dirty=false;this.error='';this.info='';this.local.remove('draft');},markDirty:()=>{this.dirty=true;this.rememberDraft();},redraw:()=>this.render(),mutate:(work,message,after)=>this.run(work,message,after),ingredient:async(article,offer,operationId,after)=>this.run(async()=>{await this.store.saveMaster('articles',article,undefined,operationId+'-article');await this.store.saveMaster('offers',offer,undefined,operationId+'-offer');},'Zutat und Liefergebinde angelegt.',after),orders:async(orders,operationId)=>{for(const order of orders)await this.store.saveOrder(order,this.state!.orders.find(o=>o.value.id===order.id),operationId+'-'+order.id);}});}
 public async start():Promise<void>{this.render();await this.run(async()=>{},'',undefined,false);const draft=this.local.read<LocalDraft<RecoveryData>>('draft');if(draft?.version===1&&draft.data&&draft.fields){this.recovery=draft;this.render();}}
 public dispose():void{this.rememberDraft();this.wwUI.clear();this.root.ownerDocument.defaultView?.removeEventListener('beforeunload',this.beforeUnload);this.root.ownerDocument.defaultView?.removeEventListener('popstate',this.popstate);this.root.removeEventListener('keydown',this.keydown);this.root.removeEventListener('click',this.click);this.root.removeEventListener('submit',this.submit);this.root.removeEventListener('input',this.input);this.root.removeEventListener('change',this.change);}
 private season():Season|undefined{return this.state?.seasons.find(s=>s.value.id===this.seasonId)?.value;}
 private writable():boolean{return !!this.season()&&!this.season()!.archived;}
 private canLeave():boolean{if(!this.dirty)return true;this.showError(new Error('Ungespeicherte Eingaben: bitte zuerst speichern oder ausdrücklich abbrechen.'));return false;}
 private clearEditor():void{this.wwUI?.clear();this.quickIngredient=undefined;this.editing=undefined;this.draft=undefined;this.orderReview=false;this.mailOrder=undefined;this.previous=undefined;this.receiving=undefined;this.inventory=undefined;this.inventoryPrevious=undefined;this.countEdits.clear();this.copySource=undefined;this.copyPicker=false;this.reorderPicker=false;this.roundPicker=false;this.deliveryPicker=false;this.importKind=undefined;this.importItems=undefined;this.importErrors=[];this.importText=undefined;this.importStarted=false;this.pendingSave=undefined;this.selectedOrder='';this.dirty=false;this.operationId=uuid();this.info='';this.error='';}
 private showError(error:unknown):void{this.error=message(error);this.paintStatus(true);}
 /** fresh: the message was raised just now, so it may move the page to become visible. Repaints of an older message never do. */
 private paintStatus(fresh=false):void{const status=this.root.querySelector<HTMLElement>('[data-status]');if(status){status.textContent=this.error||this.info;status.setAttribute('role',this.error?'alert':'status');status.setAttribute('data-error',String(!!this.error));}this.paintInlineError(status,fresh);}
 /** The status line sits at the top of the page. On long pages it is scrolled away, so an error is repeated beside the control that caused it. */
 private paintInlineError(status:HTMLElement|null,fresh:boolean):void{
  this.root.querySelector('[data-inline-status]')?.remove();
  if(!this.error||!status||this.topVisible(status))return;
  const anchor=this.trigger;if(!anchor||!anchor.isConnected||!this.root.contains(anchor)){if(fresh)status.scrollIntoView?.({block:'nearest'});return;}
  const hint=this.root.ownerDocument.createElement('p');hint.className='inline-status';hint.setAttribute('data-inline-status','');hint.setAttribute('aria-hidden','true');hint.textContent=this.error;
  const group=anchor.closest<HTMLElement>('.actions,.calm-actions,.sticky-actions');if(group&&this.root.contains(group))group.prepend(hint);else anchor.insertAdjacentElement('afterend',hint);
  if(fresh)hint.scrollIntoView?.({block:'nearest'});
 }
 /**
  * Whether the top of an element can be seen: inside the window and not covered by the surrounding SharePoint or Teams page,
  * which scrolls the app inside its own region. Without layout information the element counts as visible.
  */
 private topVisible(element:HTMLElement):boolean{
  const rect=element.getBoundingClientRect();if(!rect.width&&!rect.height)return true;
  const hit=element.ownerDocument.elementFromPoint?.(rect.left+Math.min(rect.width/2,60),rect.top+Math.min(rect.height/2,12));
  return !!hit&&(hit===element||element.contains(hit));
 }
 private lock(value:boolean):void{this.busy=value;if(value){this.focusMemo=this.focusKey();this.locked=Array.from(this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement|HTMLTextAreaElement>('input,select,button,textarea')).map(el=>[el,el.disabled]);this.locked.forEach(([el])=>{el.disabled=true;});}else{this.locked.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});this.locked=[];const memo=this.focusMemo;this.focusMemo='';this.restoreFocus(memo);}}
 private async run(work:()=>Promise<unknown>,success:string,after?:()=>void,mutation=true):Promise<void>{
  if(this.busy)return;if(mutation)this.pendingSave={work,success,after};this.error='';this.info='Wird mit SharePoint abgeglichen …';this.paintStatus();this.lock(true);
  try{await work();const state=await this.store.load();const missingContext=!!this.seasonId&&!state.seasons.some(s=>s.value.id===this.seasonId);this.state=state;this.needsSetup=false;if(!this.seasonId||!state.seasons.some(s=>s.value.id===this.seasonId))this.seasonId=[...state.seasons].sort((a,b)=>Number(a.value.archived)-Number(b.value.archived)||b.value.year-a.value.year)[0]?.value.id||'';if(this.store.ww&&this.seasonId)this.state.ww=await this.store.ww.load(this.seasonId);if(mutation)this.local.remove('draft');this.clearEditor();this.info=success||(missingContext?'Die bisherige Saison ist nicht mehr verfügbar. Aktuelle Saison ausgewählt; bitte oben prüfen.':'');this.error='';after?.();this.rememberContext();this.render();}
  catch(error){this.error=message(error);this.needsSetup=this.error.includes('noch nicht eingerichtet');this.paintStatus(true);if(!this.state)this.render();}
  finally{this.lock(false);if(this.pendingSave)this.showRecovery();}
 }
 private showRecovery():void{
  this.root.querySelector('[data-recovery]')?.remove();for(const el of Array.from(this.root.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLButtonElement|HTMLTextAreaElement>('input,select,button,textarea')))el.disabled=true;
  const box=document.createElement('section');box.className='panel warning';box.setAttribute('data-recovery','');box.innerHTML='<h2>Gespeicherten Stand prüfen</h2><p>Die Eingaben bleiben bis zur Klärung gesperrt. Ihr könnt denselben Vorgang sicher erneut versuchen oder den aktuellen Stand laden und die Eingabemaske schließen.</p><div class="actions">'+button('save-retry','Denselben Vorgang erneut versuchen','',true)+button('save-reconcile','Stand laden und Eingaben schließen')+'</div>';this.root.querySelector('main')!.prepend(box);
  const status=this.root.querySelector<HTMLElement>('[data-status]');if(status&&!this.topVisible(status))status.scrollIntoView?.({block:'start'});
 }
 private render():void{
  const s=this.state;const season=this.season();
  let body='';
  if(!s)body=panel('Arbeitsbereich',`<p>Die Daten werden auf der SharePoint-Seite dieses Kanals gespeichert.</p>${this.needsSetup?button('setup','Arbeitsbereich einrichten','',true):'<p>Verbindung wird geprüft.</p>'}`);
  else if(this.quickIngredient)body=ingredientForm(this.quickIngredient,s);
  else if(this.wwUI.screen)body=this.wwUI.render();
  else if(this.receiving)body=receiptForm(this.receiving.previous.value,this.receiving.deliveryId,!!s.ww?.ready);
  else if(this.inventory)body=inventoryForm(this.inventory,[...new Set(s.orders.filter(o=>o.value.seasonId===this.seasonId&&o.value.area===this.area&&o.value.status!=='Storniert').flatMap(o=>o.value.lines.map(l=>l.articleId)))],Object.fromEntries(s.articles.map(a=>[a.value.id,a.value.storagePlace||''])),Object.fromEntries(s.articles.map(a=>[a.value.id,a.value.category||''])));
  else if(this.editing)body=masterForm(this.editing,s);
  else if(this.mailOrder)body=orderMailView(this.mailOrder,this.supplierFor(this.mailOrder));
  else if(this.draft)body=this.orderReview?orderReview(this.draft,s):orderForm(this.draft,s);
  else if(this.copySource)body=copyForm(this.copySource.value,s,this.season());
  else if(this.importKind)body=this.importForm();
  else if(this.selectedOrder)body=this.orderDetail(s.orders.find(o=>o.value.id===this.selectedOrder));
  else if(this.copyPicker)body=this.copyList();
  else if(this.reorderPicker)body=this.reorderList();
  else if(this.deliveryPicker)body=deliveryRound(s,season,this.area);
  else if(this.roundPicker)body=orderRound(s,season,this.area);
  else if(this.view==='heute')body=this.home();
  else if(this.view==='articles')body=this.articles();
  else if(this.view==='suppliers')body=this.suppliers();
  else if(this.view==='stock')body=stockOverview(s,season,this.area,this.query);
  else if(this.view==='planning')body=this.wwUI.renderPlanning();
  else if(this.view==='reports')body=reportsOverview(s,season,this.area);
  else if(this.view==='management')body=settingsView(season,this.area);
  else body=this.orders();

  const page=this.pageKey(),samePage=page===this.shownPage,opened=samePage?this.openSections():undefined,focus=this.focusKey()||this.focusMemo;
  this.root.innerHTML=`<div class="app-layout">${sidebar(s,season,this.area,this.seasonId,this.view)}<div class="workspace-main">${this.store.testMode?'<p class="test-banner">Abnahme mit künstlichen Daten · vom Vereinsbestand getrennt</p>':''}<p data-status class="status" aria-live="polite"></p><main tabindex="-1"><p class="work-context">${h(this.area)} · ${h(season?.name||'Keine Saison gewählt')}</p>${season?.archived?'<p class="archive">Archiv: Bestellungen und Bestandsmeldungen dieser Saison sind schreibgeschützt.</p>':''}${this.recovery?'<section class="resume"><h2>Unterbrochene Eingaben fortsetzen</h2><p>'+h(this.recovery.context.area)+' · '+h(this.state?.seasons.find(x=>x.value.id===this.recovery!.context.seasonId)?.value.name||'Saison nicht mehr verfügbar')+' · '+h(stamp(this.recovery.at))+' · nur auf diesem Gerät gespeichert</p><div class="actions">'+button('draft-resume','Entwurf fortsetzen','',true)+button('draft-download','Eingaben herunterladen')+button('draft-discard','Entwurf verwerfen')+'</div></section>':''}${body}</main><footer>Angemeldet: ${h(this.user.split(' · ')[0])} · Speicherung in SharePoint${this.store.testMode?' · Testdaten':''}</footer></div></div>`;this.root.querySelector('.app-layout')?.classList.toggle('task-mode',!!this.root.querySelector('main form.calm-workflow .calm-heading button'));const dayViews=Array.from(this.root.querySelectorAll<HTMLInputElement>('input[name=deliveryView]'));if(dayViews.length>1&&this.root.ownerDocument.defaultView?.matchMedia?.('(max-width:600px)').matches)dayViews[1].checked=true;this.applyDeliveryView();if(opened)this.reopenSections(opened);this.paintStatus();this.filterRows();if(!samePage){const first=this.shownPage===undefined||this.shownPage==='setup';this.shownPage=page;if(!first)this.scrollToTop();}if(this.importStarted){for(const el of Array.from(this.root.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLTextAreaElement>('input[type=file],textarea,[data-action=import-preview]')))el.disabled=true;}
  this.restoreFocus(focus);this.syncHistory();
 }
 /** Anything deeper than the overview: an open task or list, or another area. */
 private deep():boolean{return !!this.state&&(!this.pageKey().startsWith('view:')||this.view!=='heute');}
 /** Keeps exactly one own history entry while the app is deeper than the overview, and takes it back when the app returns there by itself. */
 private syncHistory():void{
  const history=this.root.ownerDocument.defaultView?.history;if(!history?.pushState)return;
  try{
   const deep=this.deep(),current=ownEntry(history.state);
   if(deep&&!this.guard){if(!current)history.pushState({zunftkueche:true},'');this.guard=true;}
   else if(!deep&&this.guard){this.guard=false;if(current){this.ignorePop++;history.back();}}
  }catch{/* No session history here, for example in a restricted frame. The app works without it. */}
 }
 private stepBack():void{
  if(!this.state||this.busy){this.syncHistory();return;}
  if(this.orderReview&&this.draft){this.action('order-edit-sheet','').catch(e=>this.showError(e));return;}
  const task=!this.pageKey().startsWith('view:');if(!task&&this.view==='heute')return;
  if(!this.canLeave()){this.syncHistory();return;}
  this.clearEditor();if(!task){this.view='heute';this.query='';this.statusFilter='';}
  this.render();this.root.querySelector<HTMLElement>('main')?.focus({preventScroll:true});
 }
 /** Names the focused control so it can be found again after the markup is replaced. */
 private focusKey():string{
  const el=this.root.ownerDocument.activeElement;if(!el||el===this.root||!this.root.contains(el))return '';
  const quote=(value:string):string=>value.replace(/["\\]/g,'\\$&'),name=el.getAttribute('name'),action=el.getAttribute('data-action');
  if(name)return el.tagName.toLowerCase()+'[name="'+quote(name)+'"]'+((el as HTMLInputElement).type==='radio'?'[value="'+quote((el as HTMLInputElement).value)+'"]':'');
  if(action)return 'button[data-action="'+quote(action)+'"][data-id="'+quote(el.getAttribute('data-id')||'')+'"]';
  const section=el.tagName==='SUMMARY'?el.parentElement?.getAttribute('data-section-key'):null;
  return section?'details[data-section-key="'+quote(section)+'"]>summary':'main';
 }
 /** Replacing the markup drops keyboard focus to the page start. Put it back on the same control, or on the content area. */
 private restoreFocus(key:string):void{
  if(!key)return;const doc=this.root.ownerDocument,now=doc.activeElement;if(now&&now!==doc.body&&now!==doc.documentElement)return;
  const same=key==='main'?null:this.root.querySelector<HTMLElement>(key);same?.focus({preventScroll:true});
  if(doc.activeElement!==same)this.root.querySelector<HTMLElement>('main')?.focus({preventScroll:true});
 }
 private closeMenu(focus=false):boolean{
  const bar=this.root.querySelector<HTMLElement>('.sidebar[data-menu-open="true"]');if(!bar)return false;
  const more=bar.querySelector<HTMLElement>('[data-action="mobile-menu"]');bar.dataset.menuOpen='false';more?.setAttribute('aria-expanded','false');if(focus)more?.focus();return true;
 }
 private applyDeliveryView():void{const selected=this.root.querySelector<HTMLInputElement>('input[name=deliveryView]:checked')?.value||'all';for(const column of Array.from(this.root.querySelectorAll<HTMLElement>('[data-delivery-column]')))column.hidden=selected!=='all'&&column.dataset.deliveryColumn!==selected;}
 /** Mirrors the order of render(): one key per page a person would call a different screen. */
 private pageKey():string{
  if(!this.state)return 'setup';
  if(this.quickIngredient)return 'ingredient';
  if(this.wwUI.screen)return 'ww:'+this.wwUI.pageKey();
  if(this.receiving)return 'receipt:'+this.receiving.previous.value.id;
  if(this.inventory)return 'inventory:'+this.inventory.id;
  if(this.editing)return 'edit:'+this.editing.kind+':'+this.editing.id;
  if(this.mailOrder)return 'mail:'+this.mailOrder.id;
  if(this.draft)return (this.orderReview?'order-review:':'order-form:')+this.draft.id;
  if(this.copySource)return 'copy:'+this.copySource.value.id;
  if(this.importKind)return 'import:'+this.importKind;
  if(this.selectedOrder)return 'order:'+this.selectedOrder;
  if(this.copyPicker)return 'copy-list';
  if(this.reorderPicker)return 'reorder-list';
  if(this.deliveryPicker)return 'delivery-round';
  if(this.roundPicker)return 'order-round';
  return 'view:'+this.view;
 }
 private sectionKey(section:HTMLDetailsElement):string{return section.dataset.sectionKey||(Array.from(section.children).find(child=>child.tagName==='SUMMARY')?.textContent||'').trim();}
 /** Sections the person opened; only those with a unique title can be found again after a redraw. */
 private openSections():Set<string>{
  const all=Array.from(this.root.querySelectorAll<HTMLDetailsElement>('details')).map(section=>({key:this.sectionKey(section),open:section.open}));
  return new Set(all.filter(item=>item.open&&item.key&&all.filter(other=>other.key===item.key).length===1).map(item=>item.key));
 }
 private reopenSections(keys:Set<string>):void{
  const all=Array.from(this.root.querySelectorAll<HTMLDetailsElement>('details'));
  for(const section of all){const key=this.sectionKey(section);if(keys.has(key)&&all.filter(other=>this.sectionKey(other)===key).length===1)section.open=true;}
 }
 /** A new page starts at its top. The page is only moved when its top is out of sight. */
 private scrollToTop():void{const top=this.root.querySelector<HTMLElement>('.workspace-main')||this.root;if(!this.topVisible(top))top.scrollIntoView?.({block:'start'});}
 private home():string{return dashboard(this.state!,this.season(),this.area);}
 private articles():string{
  const state=this.state!;
  const priceLists=documents(state.ww,'prices');
  const date=documents(state.ww,'slot').map(slot=>slot.date).sort()[0]||new Date().toISOString().slice(0,10);
  const rows=state.articles.map(({value:article})=>{
   const offers=state.offers.filter(row=>row.value.articleId===article.id);
   const supplierName=(id:string):string=>state.suppliers.find(row=>row.value.id===id)?.value.name||'Lieferant fehlt';
   const keywords=[article.name,article.category,article.unit,...offers.map(({value:offer})=>supplierName(offer.supplierId))].join(' ');
   const offerRows=offers.map(({value:offer})=>{
    const supplier=supplierName(offer.supplierId);
    const price=effectiveOffer(offer,priceLists,date);
    const amount=price.priceNet===null?'Preis offen':money(price.priceNet)+' netto';
    return `<tr><td><strong>${h(supplier)}</strong>${offer.active?'':'<small>Inaktiv</small>'}</td>
     <td>${h(offer.packName)} à ${n(offer.packSize)} ${h(article.unit)}</td>
     <td>${h(amount)}${price.priceDate?'<small>Stand '+h(displayDate(price.priceDate))+'</small>':''}</td>
     <td><button type="button" data-action="offer-edit" data-id="${h(offer.id)}" aria-label="Angebot von ${h(supplier)} bearbeiten">Bearbeiten</button></td></tr>`;
   }).join('');
   const comparison=offerRows
    ? `<table class="article-offers" aria-label="Lieferangebote für ${h(article.name)}"><thead><tr><th scope="col">Lieferant</th>
     <th scope="col">Gebinde</th><th scope="col">Preis je Gebinde</th><th scope="col"><span class="sr-only">Aktion</span></th></tr></thead>
     <tbody>${offerRows}</tbody></table>`
    : '<p class="muted">Noch kein Lieferangebot.</p>';
   return `<details class="article-list-row" data-search="${h(keywords)}"><summary><span class="article-name">${icon('chevron')}
    <span><strong>${h(article.name)}</strong>${article.active?'':' <small>Inaktiv</small>'}</span></span>
    <span>${h(article.category||'Ohne Kategorie')}</span><span>${h(article.unit)}</span>
    <span>${offers.length} ${offers.length===1?'Angebot':'Angebote'}<span class="sr-only">Angebote ansehen</span></span></summary>
    <div class="article-detail">${comparison}<div class="actions">${button('article-edit','Artikel bearbeiten',article.id)}
    ${article.active?button('offer-new','Lieferangebot hinzufügen',article.id):''}</div></div></details>`;
  }).join('');
  return `<div class="page-heading"><div><h1>Artikel</h1><p>Gemeinsame Stammdaten für Küche und Zunftscheuer.</p></div><div class="actions">${button('import','CSV importieren','articles')}${button('article-new','Artikel anlegen','',true)}</div></div><div class="toolbar">${searchField(this.query,'Artikel oder Lieferanten suchen')}</div><section class="article-list" aria-label="Artikelliste"><div class="article-list-head"><span>Artikel</span><span>Kategorie</span><span>Einheit</span><span>Lieferangebote</span></div>${rows||empty('Noch keine Artikel angelegt.')}</section><p data-filter-empty hidden>Keine passenden Artikel.</p>`;
 }
 private suppliers():string{
  const s=this.state!;return `<div class="page-heading"><div><h1>Lieferanten</h1><p>Kontakte und Absprachen an einem Ort.</p></div><div class="actions">${button('supplier-new','Lieferant anlegen','',true)}${button('import','CSV importieren','suppliers')}</div></div><div class="toolbar">${searchField(this.query,'Lieferanten suchen')}</div><section class="supplier-list">${s.suppliers.map(({value:v})=>`<details class="supplier-profile" data-search="${h([v.name,v.contactPerson||'',v.address||'',v.phone,v.email].join(' '))}"><summary><span><strong>${h(v.name)}</strong><small>${v.active?h(v.method):'Inaktiv'}${v.active&&supplierNeedsReview(v)?' · Bestellweg / Angaben prüfen':''}</small></span><span>Profil öffnen</span></summary><div class="profile-content"><dl><div><dt>Ansprechpartner</dt><dd>${h(v.contactPerson||'Nicht hinterlegt')}</dd></div><div><dt>Adresse</dt><dd>${h(v.address||'Nicht hinterlegt')}</dd></div><div><dt>Telefon</dt><dd>${h(v.phone||'Nicht hinterlegt')}</dd></div><div><dt>E-Mail</dt><dd>${h(v.email||'Nicht hinterlegt')}</dd></div><div><dt>Bestellweg</dt><dd>${h(v.method)}</dd></div><div><dt>Kundennummer</dt><dd>${h(v.customerNumber||'Nicht hinterlegt')}</dd></div></dl><p>Prüfstatus: ${h(v.reviewStatus==='geprueft'?'Manuell geprüft':v.reviewStatus==='offen'?'Klärung erforderlich':'Noch nicht festgelegt')}${v.reviewDate?' · '+h(displayDate(v.reviewDate)):''}${v.reviewReason?' · '+h(v.reviewReason):''}</p><h2>Notizen und Absprachen</h2><p>${h(v.note||'Keine Notizen hinterlegt.')}</p>${button('supplier-edit','Profil bearbeiten',v.id,true)}<h2>Artikel und Gebinde</h2>${s.offers.filter(o=>o.value.supplierId===v.id&&o.value.active).map(o=>'<div class="review-row"><div><strong>'+h(s.articles.find(a=>a.value.id===o.value.articleId)?.value.name||'Artikel')+'</strong><small>'+h(o.value.packName)+' à '+n(o.value.packSize)+' · '+money(effectiveOffer(o.value,documents(s.ww,'prices'),new Date().toISOString().slice(0,10)).priceNet)+' netto</small></div>'+button('offer-edit','Angebot bearbeiten',o.value.id)+'</div>').join('')||'<p>Noch keine Lieferangebote.</p>'}<div class="actions">${button('supplier-prices','Preisstand ergänzen',v.id)}${button('supplier-rules','Lieferregeln',v.id)}</div><h2>Bestellungen dieser Saison</h2>${s.orders.filter(o=>o.value.supplierId===v.id&&o.value.seasonId===this.seasonId&&o.value.area===this.area).map(o=>'<div class="review-row"><span>'+h(o.value.occasion)+' · '+h(o.value.status)+'</span>'+button('order-open','Bestellung öffnen',o.value.id)+'</div>').join('')||'<p>Noch keine Bestellung.</p>'}</div></details>`).join('')||empty('Noch keine Lieferanten angelegt.')}</section><p data-filter-empty hidden>Keine passenden Lieferanten.</p>`;
 }
 private orders():string{
  const rows=this.state!.orders.filter(o=>o.value.seasonId===this.seasonId&&o.value.area===this.area);
  return `<div class="page-heading"><div><h1>Bestellungen</h1><p>${h(this.season()?.name||'Bitte Saison wählen')} · ${h(this.area)}</p></div><div class="actions">${this.writable()?button('copy-list','Aus Vorjahr übernehmen')+button('order-new','Neue Bestellung','',true):''}</div></div><div class="toolbar order-list-tools">${searchField(this.query,'Bestellungen suchen')}${select('orderStatus','Status',[['','Alle Vorgänge'],['current-drafts','Aktuelle Entwürfe'],['open-deliveries','Offene Lieferungen'],['Entwurf','Alle Entwürfe'],['Bestellt','Bestellt'],['Abgeschlossen','Abgeschlossen'],['Storniert','Storniert']],this.statusFilter)}</div><section class="order-table"><div class="order-table-head"><span>Lieferant / Vorgang</span><span>Liefertermin</span><span>Status</span><span>Warenwert netto</span></div>${rows.map(({value:o})=>`<div class="order-table-row" data-search="${h(o.supplierName+' '+o.occasion+' '+o.lines.map(l=>l.articleName).join(' '))}" data-order-status="${h(o.status)}" data-order-current="${!/^historisch(?:e|er|es)?\b/i.test(o.occasion.trim())}" data-order-open="${o.status==='Bestellt'&&deliveryState(o)!=='Vollständig geliefert'}"><div><button type="button" class="order-supplier" data-action="order-open" data-id="${h(o.id)}" aria-label="Bestellung von ${h(o.supplierName)} öffnen">${h(o.supplierName)}</button><small>${h(o.occasion||'Ohne Anlass')} · ${o.lines.length} ${o.lines.length===1?'Position':'Positionen'}</small></div><span>${o.deliveries?o.deliveries.length+(o.deliveries.length===1?' Liefertag · ':' Liefertage · ')+h(o.deliveryDate?displayDate(o.deliveryDate):'Daten offen'):h(o.deliveryDate?displayDate(o.deliveryDate):'Noch offen')}</span><span>${badge(o.receipts?.length?deliveryState(o):o.status,o.status==='Entwurf'?'warning':deliveryState(o)==='Vollständig geliefert'?'success':'neutral')}</span><strong>${orderTotal(o)===null?'Preise offen':money(orderTotal(o))}</strong></div>`).join('')||empty('Noch keine Bestellungen. Einen Entwurf anlegen oder aus einem Vorjahr übernehmen.')}</section><p data-filter-empty hidden>Keine passenden Bestellungen.</p>`+supplierTools(this.state!);
 }
 private orderDetail(row?:Stored<Order>):string{
  if(!row)return empty('Bestellung nicht gefunden. Bitte neu laden.');const o=row.value,total=orderTotal(o),received=!!o.receipts?.length;
  const slips=documents(this.state!.ww,'deliverySlip').filter(slip=>slip.confirmed&&slip.orderId===o.id&&slip.scope===o.seasonId&&slip.area===o.area);
  const canAttach=!!this.state!.ww?.ready&&this.writable()&&o.seasonId===this.seasonId&&o.area===this.area&&['Bestellt','Abgeschlossen'].includes(o.status);
  return `<section class="panel"><div class="row"><div><h1>${h(o.supplierName)}</h1><p>${h(o.occasion||'Bestellung')}</p></div>${button('cancel','Zurück')}</div><div class="detail-meta">${badge(o.status,o.status==='Entwurf'?'warning':'neutral')}${badge(deliveryState(o),deliveryState(o)==='Vollständig geliefert'?'success':'neutral')}<span>${h(o.method)} · Liefertermin ${h(o.deliveryDate||'noch offen')}</span></div>${o.recordedAt?`<p class="muted">Bestellung dokumentiert am ${h(stamp(o.recordedAt))} · ${h(o.recordedBy)}</p>`:''}${o.sourceYear?`<p class="muted">Übernommen aus Saison ${o.sourceYear}. Die Ausgangsbestellung bleibt erhalten.</p>`:''}${o.deliveries?deliverySummary(o)+deliveryMatrix(o,false):''}<div class="detail-lines" ${o.deliveries?'hidden':''}>${o.lines.map(l=>`<div class="detail-line"><div><strong>${h(l.articleName)}</strong><small>${h(l.code)} · 1 ${h(l.packName)} = ${n(l.packSize)} ${h(l.unit)}</small>${received?`<small>Geliefert ${n(receivedQuantity(o,l.id))} ${h(l.packName)} · offen ${n(Math.max(0,(l.quantity||0)-receivedQuantity(o,l.id)))} ${h(l.packName)}</small>`:''}</div><strong>${l.quantity===null?'Menge offen':n(l.quantity)+' '+h(l.packName)}</strong><span>${l.quantity===null?'':n(l.quantity*l.packSize)+' '+h(l.unit)}</span><span>${money(l.priceNet)} netto / ${h(l.packName)}</span></div>`).join('')}</div><p class="total">${total===null?'Gesamtsumme offen · Preise oder Mengen fehlen':'Warenwert netto: '+money(total)+' · ohne Pfand'}</p>${o.note?`<p>${h(o.note)}</p>`:''}<div class="actions">${this.writable()&&o.status==='Bestellt'&&!o.deliveries&&deliveryState(o)!=='Vollständig geliefert'?button('receipt-new','Lieferung prüfen',o.id,true):''}${button('order-pdf','PDF herunterladen',o.id)}${this.writable()&&o.status==='Entwurf'?button('order-mail','Bestellmail vorbereiten',o.id):''}${button('order-bill','Rechnung zuordnen',o.id)}${this.writable()&&o.status==='Entwurf'?button('order-edit','Entwurf bearbeiten',o.id,true):''}${o.deliveries?o.deliveries.map(d=>'<div class="delivery-summary"><strong>'+h(d.date||'Datum offen')+'</strong><span>'+h(d.place)+' · '+h(d.time)+'</span>'+(this.writable()&&o.status==='Bestellt'?button('receipt-new','Lieferung prüfen',o.id+'|'+d.id):'')+'</div>').join(''):button('order-text','Bestelltext anzeigen',o.id)}${this.writable()&&o.status==='Bestellt'?button('order-follow','Nachbestellung anlegen',o.id)+button('order-close','Vorgang abschließen',o.id):''}</div><div data-order-text class="ordertext" hidden></div>${o.deliveryNotes?.length?`<details class="receipt-history" open><summary>Ausgefallene Lieferungen (${o.deliveryNotes.length})</summary>${o.deliveryNotes.map(x=>`<div><strong>Keine Lieferung · ${h(stamp(x.recordedAt))}</strong><p>${h(x.recordedBy)} · ${h(o.deliveries?.find(d=>d.id===x.deliveryId)?.date||'Termin offen')}</p><p>${h(x.note)}</p></div>`).join('')}</details>`:''}${received?`<details class="receipt-history"><summary>Lieferhistorie (${o.receipts!.length})</summary>${o.receipts!.map(r=>`<div><strong>${h(stamp(r.receivedAt))}</strong><p>${h(r.receivedBy)}</p>${r.lines.map(l=>{const original=o.lines.find(x=>x.id===l.lineId)!;return `<p>${h(original.articleName)} · ${n(l.quantity)} ${h(original.packName)}</p>`;}).join('')}${r.note?`<p>${h(r.note)}</p>`:''}</div>`).join('')}</details>`:''}${deliverySlipsView(o,slips,canAttach)}</section>`;
 }
 private reorderList():string{
  const counts=latestCounts(this.state!,this.seasonId,this.area).filter(c=>c.reorder);
  return '<section class="panel"><div class="page-heading"><div><h1>Nachbestellbedarf prüfen</h1><p>Die letzte Zählung zeigt einen Hinweis, keine automatisch berechnete Bestellmenge. Bestand und Bedarf vor der Bestellung prüfen.</p></div>'+button('cancel','Zurück')+'</div>'+(counts.map(c=>{const offers=this.state!.offers.filter(o=>o.value.articleId===c.articleId&&o.value.active);return '<section class="plain-section"><h2>'+h(c.articleName)+'</h2><p>Zuletzt gezählt: '+n(c.quantity)+' '+h(c.unit)+' · '+h(stamp(c.countedAt))+(c.note?' · '+h(c.note):'')+'</p>'+(offers.length?offers.map(o=>{const supplier=this.state!.suppliers.find(x=>x.value.id===o.value.supplierId)?.value;if(!supplier?.active)return '';const drafts=this.state!.orders.filter(r=>r.value.status==='Entwurf'&&r.value.supplierId===o.value.supplierId&&r.value.seasonId===this.seasonId&&r.value.area===this.area);return drafts.length?drafts.map(d=>button('reorder-existing','In '+d.value.supplierName+' · '+d.value.occasion+' vorbereiten',d.value.id+'|'+o.value.id)).join(''):button('order-reorder',supplier.name+' · Bestellung vorbereiten',o.value.id);}).join(''):'<p>Kein aktives Lieferangebot hinterlegt.</p>')+'</section>';}).join('')||empty('Aktuell wurde kein Nachbestellbedarf markiert.'))+'</section>';
 }
 private copyList():string{const s=this.state!;const seasons=s.seasons.filter(x=>x.value.id!==this.seasonId);if(!this.sourceSeason||!seasons.some(x=>x.value.id===this.sourceSeason))this.sourceSeason=[...seasons].sort((a,b)=>b.value.year-a.value.year)[0]?.value.id||'';const rows=s.orders.filter(o=>o.value.seasonId===this.sourceSeason&&o.value.area===this.area&&o.value.status!=='Storniert');return panel('Vorjahresbestellung wählen',`<div class="row">${select('sourceSeason','Ausgangssaison',seasons.map(s=>[s.value.id,s.value.name]),this.sourceSeason)}${button('cancel','Zurück')}</div>${rows.length?rows.map(o=>`<div class="listrow"><div><strong>${h(o.value.supplierName)}</strong><p>${h(o.value.occasion||'Ohne Anlass')} · ${h(o.value.status)} · ${o.value.lines.length} Positionen</p></div>${button('copy-pick','Positionen auswählen',o.value.id)}</div>`).join(''):empty('Für diese Ausgangssaison und diesen Bereich sind noch keine übernehmbaren Bestellungen erfasst.')}`);}
 private importForm():string{const kind=this.importKind!;return `<form data-form="import" class="panel"><div class="row"><h1 class="form-title">${kind==='articles'?'Artikel':'Lieferanten'} importieren</h1>${button('cancel','Zurück')}</div><p>Neue Datensätze ergänzen. Vorhandene Namen werden zur Prüfung gemeldet.</p>${button('template','CSV-Vorlage herunterladen',kind)}<label>CSV-Datei<input type="file" name="csvFile" accept=".csv,text/csv,text/plain" /></label>${note('csvText','Oder CSV-Text einfügen',this.importText??columns[kind].join(';')+'\n')}<div class="actions">${button('import-preview','Vorschau prüfen','',true)}</div>${this.importErrors.length?`<div role="alert">${this.importErrors.map(e=>`<p>${h(e)}</p>`).join('')}</div>`:''}${this.importItems?`<h3>${this.importItems.length} Datensätze in der Vorschau</h3>${this.importItems.map(i=>`<div class="listrow"><span>${h(i.value.name)}</span><span>${i.done?'Gespeichert':'Neu'}</span></div>`).join('')}<div class="actions">${button('import-apply','Geprüfte Datensätze übernehmen','',true)}</div>`:''}</form>`;}

 private async action(action:string,id:string,target?:HTMLElement):Promise<void>{
  if(action==='mobile-menu'){const bar=this.root.querySelector<HTMLElement>('.sidebar');if(bar){const open=bar.dataset.menuOpen!=='true';bar.dataset.menuOpen=String(open);target?.setAttribute('aria-expanded',String(open));if(open&&this.viaKeyboard)bar.querySelector<HTMLElement>('nav button[data-tab="more"]')?.focus();}return;}
  if(action==='draft-resume'){await this.resumeDraft();return;}
  if(action==='draft-discard'){this.local.remove('draft');this.recovery=undefined;this.render();return;}
  if(action==='draft-download'&&this.recovery){const url=URL.createObjectURL(new Blob([JSON.stringify(this.recovery,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Zunftkueche-lokaler-Entwurf.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(this.recovery)throw new Error('Bitte den unterbrochenen Entwurf fortsetzen oder ausdrücklich verwerfen.');
  if(action==='cancel'){this.local.remove('draft');}

  if(this.pendingSave&&!['save-retry','save-reconcile'].includes(action))throw new Error('Bitte zuerst den Speichervorgang über die angezeigten Schaltflächen klären.');
  if(action==='ww-open'&&!this.dirty)this.view=['recipes','plans','equipment'].includes(id)?'planning':['journal','next-use'].includes(id)?'stock':['inbox','bills','systems'].includes(id)?'reports':'orders';if(action.startsWith('ww-')){await this.wwUI.action(action,id,target);this.rememberDraft();return;}
  if(action==='save-retry'){const pending=this.pendingSave;if(pending)await this.run(pending.work,pending.success,pending.after);return;}
  if(action==='save-reconcile'){await this.run(async()=>{},'Aktuellen Stand geladen. Nicht bestätigte Eingaben geschlossen.',undefined,false);return;}
  if(this.pendingSave)throw new Error('Bitte zuerst den Speichervorgang über die angezeigten Schaltflächen klären.');
  if(action==='supplier-rules'||action==='supplier-prices'){if(!this.canLeave())return;this.clearEditor();this.view='suppliers';this.wwUI.openSupplier(action==='supplier-rules'?'rules':'prices',id);return;}
  if(action==='setup'){await this.run(()=>this.store.initialize(),'Arbeitsbereich eingerichtet. Bitte eure Daten anlegen.');return;}
  if(action==='reload'){if(this.canLeave())await this.run(async()=>{},'Aktueller Stand aus SharePoint geladen.',undefined,false);return;}
  if(!this.state)throw new Error('Bitte zuerst den Arbeitsbereich einrichten.');
  if(this.importStarted&&(action==='nav'||action==='cancel'||action==='reload')){await this.run(async()=>{},'Import geschlossen und gespeicherter Stand neu geladen.',undefined,false);return;}
  if(action==='cancel'&&this.editing&&this.draft){this.editing=undefined;this.render();return;}
  if(action==='dashboard-orders'){if(!this.canLeave())return;this.clearEditor();this.view='orders';this.query='';this.statusFilter=id;this.render();this.root.querySelector<HTMLElement>('main')?.focus({preventScroll:true});return;}
  if(action==='nav'||action==='cancel'){if(action==='nav'&&!this.canLeave())return;this.clearEditor();if(action==='nav'){this.view=id as View;this.query='';this.statusFilter='';}this.render();this.root.querySelector<HTMLElement>('main')?.focus({preventScroll:true});return;}
  if(action==='receipt-new'){if(!this.writable())throw new Error('Bitte eine aktive Saison wählen.');const [orderId,deliveryId]=id.split('|');const previous=this.state.orders.find(o=>o.value.id===orderId);if(!previous||previous.value.status!=='Bestellt'||deliveryState(previous.value)==='Vollständig geliefert')throw new Error('Für diese Bestellung ist keine Lieferannahme offen.');if(!this.canLeave())return;this.clearEditor();this.view='orders';this.receiving={previous,id:uuid(),deliveryId:deliveryId||previous.value.deliveries?.[0]?.id};this.render();return;}
  if(action==='receipt-missing'){const form=this.root.querySelector<HTMLFormElement>('form[data-form=receipt]');const entry=this.receiving;if(!form||!entry)throw new Error('Bitte zuerst eine Lieferung öffnen.');if(form.querySelector<HTMLInputElement>('[name=deliverySlipFile]')?.files?.length)throw new Error('Bitte die ausgewählte Datei entfernen, bevor ihr eine ausgefallene Lieferung vermerkt.');const data=new FormData(form);if(entry.previous.value.lines.some(l=>parseDecimal(String(data.get('received_'+l.id)||''))!==null&&parseDecimal(String(data.get('received_'+l.id)||''))!==0))throw new Error('Es sind Liefermengen eingetragen. Bitte diese als Wareneingang bestätigen oder die Mengen entfernen.');const note=String(data.get('note')||'').trim();if(!note)throw new Error('Bitte einen kurzen Hinweis zur ausgefallenen Lieferung eingeben.');const date=new Date(String(data.get('receivedAt')));if(!Number.isFinite(date.getTime()))throw new Error('Bitte den Zeitpunkt prüfen.');const value:DeliveryNote={id:entry.id,...(entry.deliveryId?{deliveryId:entry.deliveryId}:{}),recordedAt:date.toISOString(),recordedBy:this.user,note};await this.run(()=>this.store.saveDeliveryNote(entry.previous,value,this.operationId),'Ausgefallene Lieferung vermerkt. Die Mengen bleiben offen.',()=>{this.selectedOrder=entry.previous.value.id;this.view='orders';});return;}
  if(action==='receipt-all'){const form=this.root.querySelector<HTMLFormElement>('form[data-form=receipt]');if(form&&this.receiving){const o=this.receiving.previous.value;for(const l of o.lines){const input=form.querySelector<HTMLInputElement>('[name=received_'+l.id+']');if(input)input.value=n(o.deliveries?deliveryRemaining(o,l.id,this.receiving.deliveryId!):Math.max(0,(l.quantity||0)-receivedQuantity(o,l.id)));}this.dirty=true;this.rememberDraft();this.info='Mengen eingetragen. Bitte prüfen und bei Bedarf ändern; noch nicht gespeichert. '+this.info;this.paintStatus();}return;}
  if(action==='inventory-setup'){await this.run(()=>this.store.initialize(),'Abendabschluss eingerichtet und nachgelesen.');return;}
  if(action==='inventory-new'||action==='inventory-edit'){if(!this.writable())throw new Error('Bitte eine aktive Saison wählen.');if(this.state.inventoriesReady===false)throw new Error('Bitte zuerst im Bestand den Abendabschluss einrichten.');if(!this.canLeave())return;const old=this.state.inventories?.find(r=>r.value.id===id);if(action==='inventory-edit'&&(!old||old.value.status!=='Entwurf'||old.value.seasonId!==this.seasonId||old.value.area!==this.area))throw new Error('Entwurf nicht gefunden.');this.clearEditor();this.query='';this.view='stock';this.inventoryPrevious=old;this.inventory=old?structuredClone(old.value):{id:uuid(),seasonId:this.seasonId,area:this.area,status:'Entwurf',createdAt:new Date().toISOString(),completedAt:null,countedBy:this.user,lines:this.state.articles.filter(a=>articleAvailable(a.value,this.seasonId)).sort((a,b)=>(a.value.storagePlace||'').localeCompare(b.value.storagePlace||'','de')||a.value.name.localeCompare(b.value.name,'de')).map(({value:a})=>{const offer=this.state!.offers.find(o=>o.value.active&&o.value.articleId===a.id)?.value;return{articleId:a.id,articleName:a.name,unit:a.unit,packName:offer?.packName||a.unit,packSize:offer?.packSize||1,packs:null,loose:null,assessment:'ok',note:''};})};if(!this.inventory.lines.length){this.clearEditor();throw new Error('Bitte zuerst Artikel anlegen.');}this.render();return;}
  if(action==='inventory-review-back'){const form=this.root.querySelector<HTMLFormElement>('form[data-form=inventory]');if(form){delete form.dataset.review;form.querySelector('[data-inventory-review]')?.replaceChildren();}return;}
  if(action==='inventory-finish'||action==='inventory-confirm'){const form=this.root.querySelector<HTMLFormElement>('form[data-form="inventory"]');if(form)await this.saveInventory(form,true,action==='inventory-confirm');return;}
  if(action==='season-new'||action==='season-edit'){if(!this.canLeave())return;this.clearEditor();const old=this.state.seasons.find(s=>s.value.id===id)?.value;const year=new Date().getFullYear()+1;this.editing={kind:'seasons',id:old?.id||'',value:old?structuredClone(old):{id:uuid(),name:'Fasnet '+year,year,archived:false}};this.render();return;}
  if(action==='supplier-new'||action==='supplier-edit'){if(this.draft){this.draft=this.readOrder(this.root.querySelector<HTMLFormElement>('form[data-form=order]')!);}else this.clearEditor();const old=this.state.suppliers.find(s=>s.value.id===id)?.value;this.editing={kind:'suppliers',id:old?.id||'',value:old?structuredClone(old):{id:uuid(),name:'',phone:'',email:'',method:'Telefon',customerNumber:'',note:'',active:true}};this.render();return;}
  if(action==='article-new'||action==='article-edit'){this.clearEditor();const old=this.state.articles.find(a=>a.value.id===id)?.value;this.editing={kind:'articles',id:old?.id||'',value:old?structuredClone(old):{id:uuid(),name:'',unit:'',category:'',active:true}};this.render();return;}
  if(action==='offer-new'||action==='offer-edit'){this.clearEditor();const old=this.state.offers.find(o=>o.value.id===id)?.value;this.editing={kind:'offers',id:old?.id||'',value:old?structuredClone(old):{id:uuid(),articleId:id,supplierId:'',code:'',packName:'',packSize:1,priceNet:null,priceDate:null,deposit:null,note:'',active:true}};this.render();return;}
  if(action==='count-new'){if(!this.writable())throw new Error('Bitte eine aktive Saison wählen.');this.clearEditor();this.editing={kind:'counts',id:'',value:{id:uuid(),seasonId:this.seasonId,area:this.area,articleId:'',articleName:'',unit:'',quantity:0,countedAt:'',countedBy:this.user,note:'',reorder:false}};this.render();return;}
  if(action==='order-open'){this.clearEditor();this.view='orders';this.selectedOrder=id;this.render();return;}
  if(action==='order-dates'){const options=this.root.querySelector<HTMLDetailsElement>('.sheet-options');if(options){options.open=true;options.querySelector<HTMLInputElement>('[name="date_'+id+'"]')?.focus();}return;}
  if(action==='order-review'||action==='order-edit-sheet'){if(!this.draft)return;this.draft=this.readOrder(this.root.querySelector<HTMLFormElement>('form[data-form=order]')!);if(action==='order-review')validateOrder(this.draft,catalog(this.state!));this.orderReview=action==='order-review';this.render();this.rememberDraft();return;}
  if(action==='order-ingredient'){if(!this.draft)return;this.draft=this.readOrder(this.root.querySelector<HTMLFormElement>('form[data-form=order]')!);this.quickIngredient={articleId:uuid(),offerId:uuid(),supplierId:this.draft.supplierId};this.render();return;}
  if(action==='ingredient-cancel'){this.quickIngredient=undefined;this.render();return;}
  if(action==='delivery-list'){if(!this.canLeave())return;this.clearEditor();this.view='orders';this.deliveryPicker=true;this.render();return;}
  if(action==='supplier-orders'){if(!this.canLeave())return;const supplier=this.state.suppliers.find(s=>s.value.id===id)?.value;if(!supplier)throw new Error('Lieferant nicht gefunden.');this.clearEditor();this.view='orders';this.query=supplier.name;this.statusFilter='';this.render();return;}
  if(action==='order-round'){if(!this.canLeave())return;this.clearEditor();this.view='orders';this.roundPicker=true;this.render();return;}
  if(action==='reorder-list'){if(!this.canLeave())return;this.clearEditor();this.view='stock';this.reorderPicker=true;this.render();return;}
  if(action==='reorder-existing'){const [orderId,offerId]=id.split('|');const target=this.state.orders.find(x=>x.value.id===orderId&&x.value.status==='Entwurf'&&x.value.seasonId===this.seasonId&&x.value.area===this.area),offer=this.state.offers.find(x=>x.value.id===offerId&&x.value.active);if(!target||!offer||target.value.supplierId!==offer.value.supplierId)throw new Error('Bestellung oder Lieferangebot wurde geändert. Bitte neu laden.');await this.action('order-edit',orderId);if(!this.draft!.lines.some(l=>l.offerId===offerId)){const chooser=this.root.querySelector<HTMLSelectElement>('[name=addOffer]');if(!chooser)throw new Error('Lieferangebot nicht verfügbar.');chooser.value=offerId;if(chooser.value!==offerId)throw new Error('Artikel ist in dieser Saison nicht verfügbar.');await this.action('line-add','');const added=this.draft!.lines.find(l=>l.offerId===offerId)!;added.schedule=Object.fromEntries(this.draft!.deliveries!.map(d=>[d.id,null]));added.quantity=null;this.render();}this.info='Bitte Liefertermin und nachzubestellende Menge prüfen und Entwurf speichern.';this.paintStatus();return;}
  if(action==='order-reorder'){const offer=this.state.offers.find(o=>o.value.id===id)?.value;if(!offer)throw new Error('Lieferangebot fehlt.');await this.action('order-new','');this.draft!.supplierId=offer.supplierId;const supplier=this.state.suppliers.find(s=>s.value.id===offer.supplierId)!.value;this.draft!.supplierName=supplier.name;this.draft!.method=supplier.method;this.render();this.root.querySelector<HTMLSelectElement>('[name=addOffer]')!.value=id;await this.action('line-add','');const added=this.draft!.lines.find(l=>l.offerId===id)!;added.schedule=Object.fromEntries(this.draft!.deliveries!.map(d=>[d.id,null]));added.quantity=null;this.render();this.info='Bitte Liefertermin und nachzubestellende Menge prüfen und Entwurf speichern.';this.paintStatus();return;}
  if(action==='order-new'||action==='order-edit'||action==='order-follow'){if(!this.writable())throw new Error('Bitte eine aktive Saison wählen.');this.clearEditor();const old=this.state.orders.find(o=>o.value.id===id);if(action==='order-edit'&&old?.value.status!=='Entwurf')throw new Error('Bestellte Positionen bleiben erhalten. Bitte Nachbestellung anlegen.');this.previous=action==='order-edit'?old:undefined;this.draft=old?structuredClone(old.value):{id:uuid(),seasonId:this.seasonId,area:this.area,supplierId:'',supplierName:'',status:'Entwurf',occasion:'',deliveryDate:null,method:'Telefon',note:'',sourceId:null,sourceYear:null,recordedBy:null,recordedAt:null,lines:[]};if(action==='order-follow'&&old){this.draft={...this.draft,id:uuid(),status:'Entwurf',sourceId:old.value.id,sourceYear:this.season()!.year,occasion:('Nachbestellung · '+old.value.occasion).slice(0,160),deliveryDate:null,recordedAt:null,recordedBy:null,lines:this.draft.lines.map(l=>{const clean={...l};delete clean.sources;return {...clean,id:uuid(),quantity:null,reviewed:false,...(l.schedule?{schedule:Object.fromEntries(Object.keys(l.schedule).map(k=>[k,null]))}:{})};})};}if(action==='order-follow'){delete this.draft.receipts;delete this.draft.deliveryNotes;delete this.draft.contributions;}this.draft=withSchedule(this.draft,action==='order-new'?documents(this.state.ww,'slot').map(d=>({id:d.id,date:d.date,time:d.time,place:d.place})):undefined);if(action==='order-new'&&id){const chosen=this.state.suppliers.find(s=>s.value.id===id&&s.value.active)?.value;if(!chosen)throw new Error('Lieferant nicht verfügbar. Bitte neu laden.');this.draft.supplierId=chosen.id;this.draft.supplierName=chosen.name;this.draft.method=chosen.method;}this.draft.occasion ||=this.season()!.name;this.render();return;}
  if(action==='delivery-add'||action==='delivery-remove'){if(!this.draft)return;this.draft=this.readOrder(this.root.querySelector<HTMLFormElement>('form[data-form=order]')!);if(action==='delivery-add'){if(this.draft.deliveries!.length>=31)throw new Error('Höchstens 31 Liefertage je Bestellung.');const d={id:uuid(),date:null,time:'',place:this.area};this.draft.deliveries!.push(d);this.draft.lines.forEach(l=>{l.schedule![d.id]=0;});}else{if(this.draft.deliveries!.length===1)throw new Error('Mindestens einen Liefertag behalten.');if(this.draft.lines.some(l=>(l.schedule![id]||0)>0))throw new Error('Dieser Tag enthält Mengen. Bitte zuerst Mengen auf einen anderen Tag verteilen.');this.draft.deliveries=this.draft.deliveries!.filter(d=>d.id!==id);this.draft.lines.forEach(l=>{delete l.schedule![id];});}this.draft=scheduledOrder(this.draft);this.dirty=true;this.render();return;}
  if(action==='price-adopt'&&this.draft){const form=this.root.querySelector<HTMLFormElement>('form[data-form=order]')!;const current=this.readOrder(form),line=current.lines.find(l=>l.id===id);if(!line)throw new Error('Artikel fehlt.');const proposal=priceSuggestion(current,line,this.state!);if(proposal.price===null)throw new Error(proposal.note);const input=form.querySelector<HTMLInputElement>('[name="price_'+id+'"]');if(!input)throw new Error('Preisfeld fehlt.');input.value=n(proposal.price);this.dirty=true;this.info='Preisvorschlag im Entwurf übernommen. Bitte noch speichern und prüfen.';this.paintStatus();this.updateOrderTotals();return;}
  if(action==='slip-download'){
   const row=this.state.ww?.records.find(r=>r.value.id===id);
   const slip=row?.value;
   if(!row||slip?.kind!=='deliverySlip'||!slip.confirmed||slip.orderId!==this.selectedOrder||slip.scope!==this.seasonId||slip.area!==this.area)
    throw new Error('Lieferschein nicht gefunden. Bitte Bestellung erneut öffnen.');
   const bytes=await this.store.ww.readOriginal(row);
   if(await sha256(bytes)!==slip.fileHash)throw new Error('Die gespeicherte Datei stimmt nicht mit dem Original überein.');
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/octet-stream'}));
   const link=document.createElement('a');link.href=url;link.download=slip.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   return;
  }
  if(action==='order-pdf'||action==='order-preview-pdf'){const o=action==='order-preview-pdf'?this.readOrder(this.root.querySelector<HTMLFormElement>('form[data-form=order]')!):this.state.orders.find(o=>o.value.id===id)!.value;this.downloadPdf(o);return;}
  if(action==='order-mail'||action==='order-preview-mail'){
   const form=action==='order-preview-mail'?this.root.querySelector<HTMLFormElement>('form[data-form=order]'):null;
   const source=form?this.readOrder(form):this.state.orders.find(row=>row.value.id===id)?.value;
   if(!source||source.status!=='Entwurf'||!this.writable()||source.seasonId!==this.seasonId||source.area!==this.area)
    throw new Error('Bitte einen Bestellentwurf der aktiven Saison wählen.');
   const order=withSchedule(source);
   validateOrder(order,catalog(this.state),true);
   if(form){this.draft=order;this.rememberDraft();}
   this.mailOrder=order;
   this.render();
   this.root.querySelector<HTMLElement>('[data-order-mail] h1')?.focus();
   return;
  }
  if(action==='order-mail-back'){
   this.mailOrder=undefined;this.info='';this.error='';this.render();
   this.root.querySelector<HTMLElement>('[data-action=order-preview-mail], [data-action=order-mail]')?.focus();
   return;
  }
  if(action==='order-dispatch-pdf'&&this.mailOrder){this.downloadPdf(this.mailOrder,true);return;}
  if(action==='order-mail-copy'&&this.mailOrder){
   const field=this.root.querySelector<HTMLTextAreaElement>('[name=orderMailBody]');
   if(!field)return;
   try{
    const clipboard=this.root.ownerDocument.defaultView?.navigator.clipboard;
    if(!clipboard)throw new Error('Zwischenablage nicht verfügbar.');
    await clipboard.writeText(field.value);
    this.info='Bestelltext kopiert.';
   }catch{
    field.focus();field.select();
    this.info='Bestelltext markiert. Bitte mit dem Kopierbefehl übernehmen.';
   }
   this.paintStatus();return;
  }
  if(action==='order-bill'){this.wwUI.billForOrder(id);this.render();return;}
  if(action==='order-slot'&&this.draft){const slot=documents(this.state.ww,'slot').find(s=>s.id===id);if(!slot)throw new Error('Liefertermin fehlt.');this.draft=this.readOrder(this.root.querySelector<HTMLFormElement>('form[data-form=order]')!);this.draft.deliveryDate=slot.date;this.draft.note=[this.draft.note,slot.time,slot.place].filter(Boolean).join(' · ');this.dirty=true;this.render();return;}
  if(action==='line-add'||action==='line-remove'){if(!this.draft)return;const form=this.root.querySelector<HTMLFormElement>('form[data-form="order"]')!;const data=new FormData(form);this.draft=this.readOrder(form);if(action==='line-remove')this.draft.lines=this.draft.lines.filter(l=>l.id!==id);else{const offer=this.state.offers.find(o=>o.value.id===String(data.get('addOffer')))?.value;if(!offer)throw new Error('Bitte ein Lieferangebot wählen.');if(this.draft.lines.some(l=>l.offerId===offer.id))throw new Error('Dieser Artikel ist bereits enthalten. Bitte die vorhandene Menge ändern.');const article=this.state.articles.find(a=>a.value.id===offer.articleId)!.value;const quoted=effectiveOffer(offer,documents(this.state.ww,'prices'),this.draft.deliveryDate||new Date().toISOString().slice(0,10));this.draft.lines.push({id:uuid(),articleId:article.id,offerId:offer.id,articleName:article.name,code:offer.code,unit:article.unit,packName:offer.packName,packSize:offer.packSize,quantity:null,priceNet:quoted.priceNet,priorPriceNet:null,priceYear:null,reviewed:false,schedule:Object.fromEntries(this.draft.deliveries!.map(d=>[d.id,0]))});}this.dirty=true;this.render();return;}
  if(action==='order-record'||action==='order-record-confirm'){const form=this.root.querySelector<HTMLFormElement>('form[data-form="order"]');if(form)await this.saveOrder(form,true,action==='order-record-confirm');return;}
  if(action==='order-record-back'){this.root.querySelector('[data-order-confirm]')?.remove();return;}
  if(action==='order-text'){
   const order=this.state.orders.find(row=>row.value.id===id)?.value;
   const box=this.root.querySelector<HTMLElement>('[data-order-text]');
   if(!order||!box)throw new Error('Bestellung fehlt.');
   box.hidden=false;
   box.textContent=supplierOrderText(order,this.supplierFor(order));
   return;
  }
  if(action==='order-close'||action==='order-close-confirm'){if(!this.writable())throw new Error('Bitte eine aktive Saison wählen.');const old=this.state.orders.find(o=>o.value.id===id)!;if(action==='order-close'&&deliveryState(old.value)!=='Vollständig geliefert'){const box=document.createElement('section');box.className='warning';box.innerHTML='<p>Es sind noch Liefermengen offen. Soll der Vorgang trotzdem abgeschlossen werden? Die fehlenden Mengen werden nicht als geliefert gebucht.</p>'+button('order-close-confirm','Trotz Fehlmengen abschließen',id);this.root.querySelector('main')!.append(box);return;}await this.run(()=>this.store.saveOrder({...old.value,status:'Abgeschlossen'},old,this.operationId),'Abschluss dokumentiert und nachgelesen.');return;}
  if(action==='copy-list'){this.clearEditor();this.copyPicker=true;this.render();return;}
  if(action==='copy-pick'){const old=this.state.orders.find(o=>o.value.id===id);this.clearEditor();this.copySource=old;this.render();return;}
  if(action==='import'){this.clearEditor();this.importKind=id as ImportKind;this.render();return;}
  if(action==='template'){this.download((columns[id as ImportKind].join(';')+'\r\n'),'Zunftkueche-'+id+'-Vorlage.csv');return;}
  if(action==='import-preview'){await this.previewImport();return;}
  if(action==='import-apply'){await this.applyImport();return;}
 }
 private filterRows():void{
  const rows=Array.from(this.root.querySelectorAll<HTMLElement>('[data-search]'));let shown=0;const planned=this.root.querySelector<HTMLInputElement>('input[name=inventoryFilter]:checked,select[name=inventoryFilter]')?.value==='planned';const query=this.query.trim().toLocaleLowerCase('de-DE');
  for(const row of rows){row.hidden=!(row.dataset.search||'').toLocaleLowerCase('de-DE').includes(query)||(this.view==='orders'&&row.dataset.orderStatus!==undefined&&!!this.statusFilter&&(this.statusFilter==='current-drafts'?(row.dataset.orderStatus!=='Entwurf'||row.dataset.orderCurrent!=='true'):this.statusFilter==='open-deliveries'?(row.dataset.orderOpen!=='true'||row.dataset.orderCurrent!=='true'):row.dataset.orderStatus!==this.statusFilter))||(planned&&row.dataset.relevant==='false');if(!row.hidden)shown++;}
  const emptyState=this.root.querySelector<HTMLElement>('[data-filter-empty]');if(emptyState)emptyState.hidden=!rows.length||shown>0;
  for(const group of Array.from(this.root.querySelectorAll<HTMLElement>('[data-count-group]'))){const lines=group.querySelectorAll('.count-line:not([hidden])').length,count=group.querySelector('[data-group-count]');group.hidden=!lines;if(count)count.textContent=String(lines);}
  if(this.inventory)this.updateCountTotals();
 }
 private readInventory(form:HTMLFormElement):InventorySession{
  const data=new FormData(form),session=this.inventory!;return {...session,lines:session.lines.map(l=>{
   const packs=fieldNumber(form,'packs_'+l.articleId,{integer:true}),loose=fieldNumber(form,'loose_'+l.articleId);
   const quantity=countQuantity(packs,loose,l.packSize),old=countQuantity(l.packs,l.loose,l.packSize);
   const renewed=this.countEdits.get(l.articleId)||(quantity!==old?new Date().toISOString():undefined);
   const line={...l,note:String(data.get('countnote_'+l.articleId)||'').trim(),packs,loose,assessment:String(data.get('assessment_'+l.articleId)||'ok') as 'ok'|'reorder'|'surplus'};
   if(quantity===null){delete line.countedAt;delete line.countedBy;}else{line.countedAt=renewed||l.countedAt||session.createdAt;line.countedBy=renewed?this.user:l.countedBy||session.countedBy;}
   return line;
  })};
 }
 private updateCountTotals():void{
  const form=this.root.querySelector<HTMLFormElement>('form[data-form="inventory"]');if(!form||!this.inventory)return;const data=new FormData(form);let counted=0;const visible=new Set(this.inventory.lines.filter(l=>form.querySelector('[data-count-total="'+l.articleId+'"]')?.closest<HTMLElement>('.count-line')?.hidden!==true).map(l=>l.articleId));
  for(const l of this.inventory.lines){const el=form.querySelector<HTMLElement>('[data-count-total="'+l.articleId+'"]');try{const quantity=countQuantity(parseDecimal(String(data.get('packs_'+l.articleId)||'')),parseDecimal(String(data.get('loose_'+l.articleId)||'')),l.packSize);if(quantity!==null&&visible.has(l.articleId))counted++;if(el){el.textContent=quantity===null?'Noch nicht gezählt':n(quantity)+' '+l.unit;el.dataset.state=quantity===null?'open':'counted';}}catch{if(el){el.textContent='Menge bitte prüfen';el.dataset.state='error';}}}
  const progress=form.querySelector('[data-count-progress]');if(progress)progress.innerHTML=countProgress(counted,visible.size,this.inventory.lines.length);const bar=form.querySelector<HTMLElement>('[data-count-bar]');if(bar)bar.style.width=countShare(counted,visible.size)+'%';const review=form.querySelector('[data-inventory-review]');if(review)review.replaceChildren();
 }
 private async readSlip(form:HTMLFormElement):Promise<SlipFile|undefined>{
  const file=form.querySelector<HTMLInputElement>('[name=deliverySlipFile]')?.files?.[0];
  if(!file)return undefined;
  if(file.size>slipFileLimit)throw new Error('Der Lieferschein darf höchstens 8 MB groß sein.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  slipExtension(bytes);
  return {name:file.name,bytes};
 }
 private async saveSlip(form:HTMLFormElement):Promise<void>{
  const order=this.state!.orders.find(row=>row.value.id===this.selectedOrder)?.value;
  if(!order||!this.writable()||order.seasonId!==this.seasonId||order.area!==this.area)throw new Error('Bestellung bitte erneut öffnen.');
  const deliveryId=String(new FormData(form).get('slipDelivery')||'')||undefined;
  const file=await this.readSlip(form);
  if(!file)throw new Error('Bitte zuerst eine Lieferscheindatei auswählen.');
  await this.run(()=>this.store.saveDeliverySlip(order.id,deliveryId,file,this.user),'Lieferschein gespeichert.',()=>{this.selectedOrder=order.id;});
 }
 private async saveReceipt(form:HTMLFormElement):Promise<void>{
  const entry=this.receiving!,data=new FormData(form);const receipt:Receipt={...(entry.deliveryId?{deliveryId:entry.deliveryId}:{}),id:entry.id,receivedAt:new Date(String(data.get('receivedAt'))).toISOString(),receivedBy:this.user,note:[String(data.get('deviation')||''),String(data.get('note')||'').trim()].filter(Boolean).join(' · '),lines:entry.previous.value.lines.flatMap(l=>{const maximum=entry.previous.value.deliveries?deliveryRemaining(entry.previous.value,l.id,entry.deliveryId!):Math.max(0,(l.quantity||0)-receivedQuantity(entry.previous.value,l.id));const quantity=fieldNumber(form,'received_'+l.id,{maximum});return quantity!==null&&quantity>0?[{lineId:l.id,quantity}]:[];})};
  validateReceipt(entry.previous.value,receipt);
  const operationId=this.operationId, file=await this.readSlip(form);
  await this.run(async()=>{
   if(file)await this.store.saveDeliverySlip(entry.previous.value.id,entry.deliveryId,file,this.user);
   await this.store.saveReceipt(entry.previous,receipt,operationId);
  },file?'Wareneingang und Lieferschein gespeichert.':'Wareneingang gespeichert.',()=>{this.selectedOrder=entry.previous.value.id;this.view='orders';});
 }
 private async saveInventory(form:HTMLFormElement,finish:boolean,confirmed=false):Promise<void>{
  const value=this.readInventory(form);value.status=finish?'Abgeschlossen':'Entwurf';value.completedAt=finish?new Date().toISOString():null;value.countedBy=this.user;validateInventory(value);
  if(finish&&!confirmed){const previous=latestCounts(this.state!,this.seasonId,this.area);const changes=value.lines.filter(l=>{const old=previous.find(c=>c.articleId===l.articleId),q=countQuantity(l.packs,l.loose,l.packSize);return old&&q!==null&&old.quantity>0&&Math.abs(q-old.quantity)/old.quantity>0.5;});const counted=value.lines.filter(l=>countQuantity(l.packs,l.loose,l.packSize)!==null).length;const open=value.lines.length-counted;const review=form.querySelector('[data-inventory-review]')!;form.dataset.review='true';const marked=value.lines.filter(l=>countQuantity(l.packs,l.loose,l.packSize)!==null&&(l.assessment!=='ok'||!!l.note));const notes=marked.map(l=>'<li><strong>'+h(l.articleName)+'</strong> · '+n(countQuantity(l.packs,l.loose,l.packSize))+' '+h(l.unit)+' · '+(l.assessment==='reorder'?'Nachbestellen':l.assessment==='surplus'?'Überhang':'Übergabe')+(l.note?' · '+h(l.note):'')+'</li>').join('');review.innerHTML='<section class="warning"><h2>Abendabschluss prüfen</h2><p>'+counted+' Artikel gezählt. '+(open?open+' Artikel '+(open===1?'bleibt':'bleiben')+' ungeprüft. Leere Felder werden nicht als null übernommen.':'Alle Artikel sind erfasst.')+'</p>'+(notes?'<h3>Für das Team</h3><ul>'+notes+'</ul>':'<p>Keine Engpässe oder Überhänge markiert.</p>')+(changes.length?'<details><summary>Auffällige Veränderungen ('+changes.length+')</summary><ul>'+changes.map(l=>'<li>'+h(l.articleName)+': zuletzt '+n(previous.find(c=>c.articleId===l.articleId)!.quantity)+' → jetzt '+n(countQuantity(l.packs,l.loose,l.packSize))+' '+h(l.unit)+'</li>').join('')+'</ul><p>Abweichung über 50 %. Kann durch Verbrauch oder Lieferung erklärbar sein; bitte kurz prüfen.</p></details>':'')+'<div class="calm-actions">'+button('inventory-review-back','Weiter zählen')+button('inventory-confirm',open?'Trotzdem abschließen':'Abschließen','',true)+'</div></section>';review.scrollIntoView?.({block:'nearest'});return;}
  const previous=this.inventoryPrevious;await this.run(()=>this.store.saveInventory(value,previous,this.operationId),finish?'Abendabschluss abgeschlossen und nachgelesen.':'Entwurf gespeichert. Ihr könnt den Abendabschluss im Bestand fortsetzen.',()=>{
   this.view='stock';
   if(finish&&nextUsePlans(this.state!,value.seasonId,value.area).length)this.wwUI.screen='next-use';
  });
 }
 private readOrder(form:HTMLFormElement,showFieldErrors=true):Order{return readSheetOrder(form,this.draft!,this.state!,showFieldErrors);}
 private updateOrderTotals():void{try{const form=this.root.querySelector<HTMLFormElement>('form[data-form=order]');if(!form)return;const o=this.readOrder(form,false);for(const l of o.lines){const el=form.querySelector('[data-line-total="'+l.id+'"]');if(el)el.textContent=n(l.quantity)+' '+l.packName;}const sheetSummary=form.querySelector('[data-sheet-summary]');if(sheetSummary)sheetSummary.textContent=o.lines.length?o.lines.length+' Artikel':'Mengen eintragen';const summary=form.querySelector('[data-order-summary]');if(summary)summary.innerHTML=deliverySummary(o);const guidance=form.querySelector('[data-order-guidance]');if(guidance)guidance.innerHTML=orderGuidance(o);const prices=form.querySelector('[data-price-review]');if(prices){const wasOpen=prices.querySelector('details')?.open;prices.innerHTML=priceReview(o,this.state!);if(wasOpen===false)prices.querySelector('details')?.removeAttribute('open');}const total=form.querySelector('[data-order-total]');if(total)total.textContent=orderTotal(o)===null?'Warenwert offen · Mengen oder Preise fehlen':'Warenwert gesamt netto: '+money(orderTotal(o))+' · ohne Pfand und Lieferkosten';}catch{/* Invalid input is explained at save without interrupting typing. */}}
 private supplierFor(order:Order):Supplier{
  const supplier=this.state!.suppliers.find(row=>row.value.id===order.supplierId)?.value;
  if(!supplier)throw new Error('Bitte Lieferanten wählen.');
  return supplier;
 }
 private downloadPdf(order:Order,forDispatch=false):void{const bytes=supplierPdf(order,this.supplierFor(order),undefined,forDispatch),url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=('Bestellung-'+order.supplierName+'-'+this.season()?.year+'.pdf').replace(/[^a-zA-Z0-9äöüÄÖÜß._-]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

 private async saveOrder(form:HTMLFormElement,record:boolean,confirmed=false):Promise<void>{const order=this.readOrder(form);if(record){order.status='Bestellt';order.recordedBy=this.user;order.recordedAt=new Date().toISOString();}validateOrder(order,catalog(this.state!));if(record&&!confirmed){form.querySelector('[data-order-confirm]')?.remove();const confirmation=document.createElement('section');confirmation.className='warning';confirmation.setAttribute('data-order-confirm','');confirmation.setAttribute('aria-label','Bestellung dokumentieren');confirmation.innerHTML='<p>Ist diese Bestellung bereits tatsächlich beim Lieferanten aufgegeben? Bestellweg, Mengen und Gebinde werden so festgehalten.</p><div class="actions">'+button('order-record-confirm','Ja, Bestellung ist aufgegeben','',true)+button('order-record-back','Zurück zum Entwurf')+'</div>';form.append(confirmation);confirmation.scrollIntoView({block:'nearest'});return;}const previous=this.previous;await this.run(()=>this.store.saveOrder(order,previous,this.operationId),'Gespeichert und durch erneutes Lesen bestätigt.',()=>{this.selectedOrder=order.id;});}
 private async save(form:HTMLFormElement):Promise<void>{
  if(form.dataset.form==='ingredient'){const {article,offer}=readIngredient(form,this.quickIngredient!),draft=structuredClone(this.draft!),previous=this.previous,operationId=this.operationId;this.uniqueName('articles',article);await this.run(async()=>{await this.store.saveMaster('articles',article,undefined,operationId+'-article');await this.store.saveMaster('offers',offer,undefined,operationId+'-offer');},'Artikel und Liefergebinde angelegt.',()=>{this.draft=draft;this.previous=previous;if(!this.draft.supplierId){this.draft.supplierId=offer.supplierId;const supplier=this.state!.suppliers.find(s=>s.value.id===offer.supplierId)!.value;this.draft.supplierName=supplier.name;this.draft.method=supplier.method;}if(this.draft.supplierId===offer.supplierId)this.draft.lines.push({id:uuid(),articleId:article.id,articleName:article.name,offerId:offer.id,code:offer.code,packName:offer.packName,packSize:offer.packSize,unit:article.unit,quantity:0,priceNet:offer.priceNet,priorPriceNet:null,priceYear:null,reviewed:false,schedule:Object.fromEntries(this.draft.deliveries!.map(d=>[d.id,0]))});this.dirty=true;});return;}
  if(form.dataset.form?.startsWith('ww-')){await this.wwUI.save(form);return;}
  if(form.dataset.form==='delivery-slip'){await this.saveSlip(form);return;}
  if(form.dataset.form==='receipt'){await this.saveReceipt(form);return;}
  if(form.dataset.form==='inventory'){await this.saveInventory(form,false);return;}
  if(form.dataset.form==='order'){await this.saveOrder(form,false);return;}
  if(form.dataset.form==='copy'){const source=this.copySource!.value,data=new FormData(form);const dates=Object.fromEntries(withSchedule(source).deliveries!.map(d=>[d.id,String(data.get('copydate_'+d.id)||'')]));const copied=copyScheduledOrder(source,this.season()!,this.area,this.state!,dates,withSchedule(source).lines.filter(l=>data.has('copyline_'+l.id)).map(l=>l.id));const existing=this.state!.orders.find(o=>o.value.id===copied.id);if(existing){this.clearEditor();this.selectedOrder=existing.value.id;this.info='Diese Vorjahresübernahme ist bereits vorhanden.';this.render();return;}const target=this.state!.seasons.find(x=>x.value.id===this.seasonId)!;const mapped={...target.value.copyDates};for(const d of withSchedule(source).deliveries!){if(d.date&&dates[d.id])mapped[d.date]=dates[d.id];}await this.run(async()=>{await this.store.saveOrder(copied,undefined,this.operationId);await this.store.saveMaster('seasons',{...target.value,copyDates:mapped},target,this.operationId+'-dates');},'Ausgewählte Positionen als neuer Entwurf übernommen.',()=>{this.draft=structuredClone(copied);this.previous=this.state!.orders.find(o=>o.value.id===copied.id);});return;}

  if(form.dataset.form!=='master'||!this.editing)return;
  const resume=this.draft?structuredClone(this.draft):undefined,previousOrder=this.previous;const resumeOrder=():void=>{if(resume){this.draft=resume;this.previous=previousOrder;this.dirty=true;}};const editing=this.editing,data=new FormData(form);const get=(name:string):string=>String(data.get(name)||'').trim();
  if(editing.kind==='seasons'){const old=editing.value as Season;const list=(name:string):string[]=>[...new Set(get(name).split(/\r?\n/).map(x=>x.trim()).filter(Boolean))];const value:Season={...old,id:old.id,name:get('name'),year:Number(get('year')),archived:data.has('archived'),operatingDays:list('operatingDays').sort(),deliveryPlaces:list('deliveryPlaces'),storagePlaces:list('storagePlaces'),units:list('units'),contact:get('contact')};if(this.state!.seasons.some(s=>s.value.id!==value.id&&s.value.year===value.year))throw new Error('Für dieses Jahr gibt es bereits eine Saison. Bitte die vorhandene Saison wählen.');await this.run(()=>this.store.saveMaster('seasons',value,this.state!.seasons.find(s=>s.value.id===editing.id),this.operationId),'Saison gespeichert und nachgelesen.',()=>{this.seasonId=value.id;});return;}
  if(editing.kind==='articles'){const old=editing.value as Article;const value:Article={id:old.id,name:get('name'),unit:get('unit'),category:get('category'),active:data.has('active'),storagePlace:get('storagePlace'),unavailableSeasons:this.state!.seasons.filter(s=>data.has('unavailable_'+s.value.id)).map(s=>s.value.id)};this.uniqueName('articles',value);await this.run(()=>this.store.saveMaster('articles',value,this.state!.articles.find(a=>a.value.id===editing.id),this.operationId),'Artikel gespeichert und nachgelesen.');return;}
  if(editing.kind==='suppliers'){const old=editing.value as Supplier;const value:Supplier={...old,id:old.id,name:get('name'),contactPerson:get('contactPerson'),address:get('address'),phone:get('phone'),email:get('email'),method:get('method') as Method,customerNumber:get('customerNumber'),note:get('note'),active:data.has('active'),reviewStatus:(get('reviewStatus')||undefined) as Supplier['reviewStatus'],reviewDate:get('reviewDate')||undefined,reviewReason:get('reviewReason')};this.uniqueName('suppliers',value);await this.run(()=>this.store.saveMaster('suppliers',value,this.state!.suppliers.find(s=>s.value.id===editing.id),this.operationId),'Lieferant gespeichert und nachgelesen.',resumeOrder);return;}
  if(editing.kind==='offers'){const old=editing.value as Offer;const value:Offer={...old,supplierId:get('supplierId'),code:get('code'),packName:get('packName'),packSize:parseDecimal(get('packSize'))??0,priceNet:parseDecimal(get('priceNet')),priceDate:get('priceDate')||null,priceStatus:get('priceStatus') as Offer['priceStatus'],deposit:parseDecimal(get('deposit')),note:get('note'),active:data.has('active')};if(!this.state!.suppliers.some(s=>s.value.id===value.supplierId&&s.value.active))throw new Error('Bitte einen aktiven Lieferanten wählen.');if(this.state!.offers.some(o=>o.value.id!==value.id&&o.value.articleId===value.articleId&&o.value.supplierId===value.supplierId&&o.value.packName.toLocaleLowerCase('de-DE')===value.packName.toLocaleLowerCase('de-DE')&&o.value.active))throw new Error('Ein solches Lieferangebot ist bereits vorhanden. Bitte das vorhandene Angebot bearbeiten.');await this.run(()=>this.store.saveMaster('offers',value,this.state!.offers.find(o=>o.value.id===editing.id),this.operationId),'Lieferangebot gespeichert und nachgelesen.');return;}
  if(editing.kind==='counts'){if(!this.writable())throw new Error('Bitte eine aktive Saison wählen.');const article=this.state!.articles.find(a=>a.value.id===get('articleId')&&a.value.active)?.value;if(!article)throw new Error('Bitte einen aktiven Artikel wählen.');const amount=parseDecimal(get('quantity'));if(amount===null)throw new Error('Bitte die gezählte Menge eingeben; null ist eine gültige Menge.');const value:Count={id:editing.value.id,seasonId:this.seasonId,area:this.area,articleId:article.id,articleName:article.name,unit:article.unit,quantity:amount,countedAt:new Date().toISOString(),countedBy:this.user,note:get('note'),reorder:get('assessment')==='reorder',surplus:get('assessment')==='surplus'};await this.run(()=>this.store.saveMaster('counts',value,undefined,this.operationId),'Bestandsmeldung gespeichert und nachgelesen.');}
 }
 private uniqueName(kind:'articles'|'suppliers',value:Article|Supplier):void{if(this.state![kind].some(r=>r.value.id!==value.id&&r.value.name.trim().toLocaleLowerCase('de-DE')===value.name.trim().toLocaleLowerCase('de-DE')))throw new Error('Dieser Name ist bereits vorhanden. Bitte den vorhandenen Datensatz bearbeiten.');}
 private async previewImport():Promise<void>{if(this.importStarted)throw new Error('Die laufende Übernahme bitte zuerst abschließen oder ausdrücklich schließen.');const kind=this.importKind!;const form=this.root.querySelector<HTMLFormElement>('form[data-form="import"]')!;const data=new FormData(form);const file=form.querySelector<HTMLInputElement>('input[type="file"]')!.files?.[0];const raw=file?await file.text():String(data.get('csvText')||'');this.importText=raw;const preview=previewMasters(kind,raw,this.state![kind].map(s=>s.value.name));const items:ImportItem[]=preview.rows.map(r=>({kind,value:kind==='articles'?{id:uuid(),name:r.Name,unit:r.Einheit,category:r.Kategorie||'',active:true}:{id:uuid(),name:r.Name,phone:r.Telefon||'',email:r['E-Mail']||'',method:(r.Bestellweg||'Telefon') as Method,customerNumber:r.Kundennummer||'',note:r.Hinweise||'',active:true},done:false}));for(const item of items)try{validateEntity(item.kind,item.value);}catch(e){preview.errors.push(item.value.name+': '+message(e));}this.importItems=preview.errors.length?undefined:items;this.importErrors=preview.errors;this.render();}
 private async applyImport():Promise<void>{const items=this.importItems;if(!items?.length)return;this.importStarted=true;this.lock(true);try{for(const item of items){if(item.done)continue;if(item.kind==='articles')await this.store.saveMaster('articles',item.value as Article,undefined,item.value.id);else await this.store.saveMaster('suppliers',item.value as Supplier,undefined,item.value.id);item.done=true;}this.state=await this.store.load();if(this.store.ww&&this.seasonId)this.state.ww=await this.store.ww.load(this.seasonId);this.clearEditor();this.error='';this.info=items.length+' Datensätze importiert und durch Lesen bestätigt.';this.render();}catch(e){this.error=items.filter(i=>i.done).length+' Datensätze bereits bestätigt. '+message(e)+' Die Übernahme kann für die übrigen Datensätze erneut gestartet werden.';this.render();}finally{this.lock(false);}}
 private download(text:string,name:string):void{const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
}
