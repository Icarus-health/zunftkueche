import { validateEntity, validateOrder } from './domain.ts';
import { catalog } from './model.ts';
import type { EntityMap, MasterKind, Order, OrderLine, Stored, Workspace } from './model';

export interface HttpResponse { status: number; ok: boolean; json(): Promise<unknown> }
export interface HttpOptions { method: string; headers: Record<string,string>; body?: string }
export type HttpRequest = (url: string, options: HttpOptions) => Promise<HttpResponse>;
type ListKind = MasterKind | 'orders' | 'positions';
interface Envelope<T> { schema: number; operationId: string; entity: T }
interface Header extends Omit<Order,'lines'> { revision: string; lineIds: string[] }
interface Position { id: string; orderId: string; revision: string; line: OrderLine }
const names: Record<ListKind,string> = {seasons:'Saisons',suppliers:'Lieferanten',articles:'Artikel',offers:'Lieferangebote',orders:'Bestellungen',positions:'Bestellpositionen',counts:'Bestandsmeldungen'};
const kinds = Object.keys(names) as ListKind[];
const conflict = (): Error => new Error('Der Datensatz wurde inzwischen geändert. Bitte neu laden; fremde Änderungen werden nicht überschrieben.');
const same = (a: unknown,b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
function key(value: string): void { if (!/^[a-zA-Z0-9:_-]{1,240}$/.test(value)) throw new Error('Datensatzkennung ist ungültig.'); }

export class SharePointStore {
 public readonly testMode: boolean;
 private readonly site: string;
 private readonly prefix: string;
 public constructor(site: string, private readonly request: HttpRequest, testMode = false) {
  const url = new URL(site); if (url.protocol !== 'https:' || url.search || url.hash) throw new Error('SharePoint-Ziel ist ungültig.');
  this.site=site.replace(/\/$/,'');this.testMode=testMode;this.prefix=testMode?'ZK_AbnahmeV1_':'ZK_V1_';
 }
 private list(kind: ListKind): string { return `${this.site}/_api/web/lists/getbytitle('${this.prefix+names[kind]}')`; }
 private async http(url: string, method = 'GET', body?: object, extra: Record<string,string> = {}): Promise<HttpResponse> {
  if (!url.startsWith(this.site+'/_api/')) throw new Error('Unerwartetes SharePoint-Ziel.');
  const result=await this.request(url,{method,headers:{Accept:'application/json;odata=minimalmetadata','Content-Type':'application/json;odata=nometadata','odata-version':'',...extra},...(body?{body:JSON.stringify(body)}:{})});
  if (result.status===412) throw conflict();
  if (result.status===404) throw new Error('Der Arbeitsbereich ist noch nicht eingerichtet oder nicht erreichbar.');
  if (!result.ok) throw new Error(`SharePoint meldet ${result.status}. Bitte Verbindung und vorhandene Rechte prüfen.`);
  return result;
 }
 public async initialize(): Promise<void> {
  for (const kind of kinds) {
   const url=this.list(kind); const found=await this.request(url+'?$select=Description',{method:'GET',headers:{Accept:'application/json;odata=nometadata','odata-version':''}});
   if(found.status===404) await this.http(this.site+'/_api/web/lists','POST',{Title:this.prefix+names[kind],Description:'[ZK-V1] Zunftküche – App-Daten Schema 1. '+(this.testMode?'Ausschließlich künstliche Abnahmedaten.':'Vereinsverwaltung.'),BaseTemplate:100,EnableVersioning:true});
   else {if(!found.ok)throw new Error(`Einrichtung nicht möglich (${found.status}).`);const meta=await found.json() as {Description?:string};if(!meta.Description?.includes('[ZK-V1]'))throw new Error('Eine gleichnamige fremde Liste wird nicht verändert.');}
   const fields=await (await this.http(url+'/fields?$select=InternalName,FieldTypeKind,Indexed,EnforceUniqueValues,SchemaXml')).json() as {value?:Array<{InternalName:string;FieldTypeKind:number;Indexed?:boolean;EnforceUniqueValues?:boolean;SchemaXml?:string}>};
   if(!Array.isArray(fields.value))throw new Error('Listenschema konnte nicht geprüft werden.');
   for(const [name,type] of [['ZKKey',2],['ZKData',3]] as const){const field=fields.value.find(f=>f.InternalName===name);if(!field)await this.http(url+'/fields','POST',{Title:name,FieldTypeKind:type,Required:true,...(type===2?{Indexed:true,EnforceUniqueValues:true}:{SchemaXml:'<Field Type="Note" Name="ZKData" DisplayName="ZKData" Required="TRUE" RichText="FALSE" AppendOnly="FALSE" />'})});else if(field.FieldTypeKind!==type||(type===2&&(!field.Indexed||!field.EnforceUniqueValues))||(type===3&&/RichText="TRUE"|AppendOnly="TRUE"/i.test(field.SchemaXml||'')))throw new Error('Vorhandenes Listenschema passt nicht. Es wird nichts umgebaut.');}
  }
 }
 private decode<T extends {id:string}>(raw: unknown): Stored<T> {
  const row=raw as {Id?:number;ZKKey?:string;ZKData?:string;'odata.etag'?:string;'@odata.etag'?:string};
  let doc: Envelope<T>;try {doc=JSON.parse(row.ZKData || '') as Envelope<T>;}catch{throw new Error('Ein App-Datensatz ist nicht lesbar. Bitte Administrator informieren.');}
  const etag=row['odata.etag']||row['@odata.etag'];
  if(doc.schema!==1||!doc.entity||doc.entity.id!==row.ZKKey||!doc.operationId||!etag||etag==='*'||!Number.isInteger(row.Id))throw new Error('Datenschema oder Versionskennung passt nicht. Es wird nichts überschrieben.');
  key(doc.entity.id);return {itemId:row.Id!,etag,operationId:doc.operationId,value:doc.entity};
 }
 private async rows<T extends {id:string}>(kind: ListKind, filter?: string): Promise<Stored<T>[]> {
  let url: string | undefined=this.list(kind)+`/items?$select=Id,ZKKey,ZKData&$top=${filter?'2':'500'}`+(filter?'&$filter='+encodeURIComponent(`ZKKey eq '${filter}'`):'');
  const result: Stored<T>[]=[];const visited=new Set<string>();
  while(url){if(visited.has(url))throw new Error('SharePoint-Seitenfolge ist ungültig.');visited.add(url);const page=await (await this.http(url)).json() as {value?:unknown[];'odata.nextLink'?:string;'@odata.nextLink'?:string};if(!Array.isArray(page.value))throw new Error('SharePoint-Antwort ist unvollständig.');result.push(...page.value.map(x=>this.decode<T>(x)));url=page['odata.nextLink']||page['@odata.nextLink'];if(url && !url.startsWith(this.site+'/_api/'))throw new Error('Unerwartete SharePoint-Seitenadresse.');}
  return result;
 }
 private async one<T extends {id:string}>(kind: ListKind,id: string): Promise<Stored<T> | undefined> {key(id);const rows=await this.rows<T>(kind,id);if(rows.length>1)throw new Error('Doppelter Datensatzschlüssel. Bitte Administrator informieren.');return rows[0];}
 private async put<T extends {id:string}>(kind: ListKind,value: T,previous: Stored<T> | undefined,operationId: string): Promise<Stored<T>> {
  key(value.id);key(operationId);if(previous&&previous.value.id!==value.id)throw new Error('Datensatzkennung darf nicht geändert werden.');
  const current=await this.one<T>(kind,value.id);
  if(current?.operationId===operationId){if(!same(current.value,value))throw new Error('Dieser Speichervorgang hat andere Eingaben. Bitte neu laden.');return current;}
  if(previous&&(!current||current.etag!==previous.etag))throw conflict();
  if(!previous&&current)throw new Error('Dieser Datensatz oder diese Vorjahresübernahme ist bereits vorhanden. Bitte neu laden.');
  const label=(value as unknown as {name?:string;supplierName?:string}).name||(value as unknown as {supplierName?:string}).supplierName||names[kind];
  await this.http(this.list(kind)+'/items'+(current?'('+current.itemId+')':''),'POST',{Title:label.slice(0,200),ZKKey:value.id,ZKData:JSON.stringify({schema:1,operationId,entity:value})},current?{'X-HTTP-Method':'MERGE','IF-MATCH':previous!.etag}:{});
  let confirmed: Stored<T> | undefined;try{confirmed=await this.one<T>(kind,value.id);}catch{throw new Error('Speicherung noch nicht bestätigt. Bitte neu laden und den Stand prüfen.');}
  if(!confirmed||confirmed.operationId!==operationId||!same(confirmed.value,value))throw new Error('Speicherung noch nicht bestätigt. Bitte neu laden und den Stand prüfen.');return confirmed;
 }
 private hydrate(header: Stored<Header>,positions: Stored<Position>[]): Stored<Order> {
  const h=header.value;if(!Array.isArray(h.lineIds)||!h.lineIds.length||new Set(h.lineIds).size!==h.lineIds.length)throw new Error('Bestellpositionen sind unvollständig.');
  const lines=h.lineIds.map(id=>{const matches=positions.filter(p=>p.value.orderId===h.id&&p.value.revision===h.revision&&p.value.line.id===id);if(matches.length!==1)throw new Error('Bestellpositionen sind unvollständig. Bitte neu laden.');return matches[0].value.line;});
  const value: Order={id:h.id,seasonId:h.seasonId,area:h.area,supplierId:h.supplierId,supplierName:h.supplierName,status:h.status,occasion:h.occasion,deliveryDate:h.deliveryDate,method:h.method,note:h.note,sourceId:h.sourceId,sourceYear:h.sourceYear,recordedBy:h.recordedBy,recordedAt:h.recordedAt,lines};validateOrder(value);return {...header,value};
 }
 public async load(): Promise<Workspace> {
  const [seasons,suppliers,articles,offers,headers,positions,counts]=await Promise.all([this.rows<EntityMap['seasons']>('seasons'),this.rows<EntityMap['suppliers']>('suppliers'),this.rows<EntityMap['articles']>('articles'),this.rows<EntityMap['offers']>('offers'),this.rows<Header>('orders'),this.rows<Position>('positions'),this.rows<EntityMap['counts']>('counts')]);
  for(const [kind,records] of [['seasons',seasons],['suppliers',suppliers],['articles',articles],['offers',offers],['counts',counts]] as const)for(const row of records)validateEntity(kind,row.value);
  return {seasons,suppliers,articles,offers,orders:headers.map(h=>this.hydrate(h,positions)),counts};
 }
 public async saveMaster<K extends MasterKind>(kind: K,value: EntityMap[K],previous: Stored<EntityMap[K]> | undefined,operationId: string): Promise<Stored<EntityMap[K]>> {
  validateEntity(kind,value);if(kind==='counts'&&previous)throw new Error('Bestandsmeldungen bleiben erhalten. Bitte eine neue Zählung erfassen.');
  const committed=await this.one<EntityMap[K]>(kind,value.id);
  if(committed?.operationId===operationId)return this.put(kind,value,previous,operationId);
  const state=await this.load();
  if(kind==='offers'){const offer=value as EntityMap['offers'];if(!state.articles.some(a=>a.value.id===offer.articleId&&a.value.active))throw new Error('Artikel fehlt oder ist inaktiv.');if(!state.suppliers.some(s=>s.value.id===offer.supplierId&&s.value.active))throw new Error('Lieferant fehlt oder ist inaktiv.');}
  if(kind==='counts'){const count=value as EntityMap['counts'];if(!state.seasons.some(s=>s.value.id===count.seasonId&&!s.value.archived))throw new Error('Bitte eine aktive Saison wählen.');const article=state.articles.find(a=>a.value.id===count.articleId&&a.value.active)?.value;if(!article||article.unit!==count.unit)throw new Error('Artikel oder Einheit wurde geändert. Bitte neu laden und erneut zählen.');}
  if(kind==='articles'){const article=value as EntityMap['articles'];const current=state.articles.find(a=>a.value.id===article.id);if(current&&current.value.unit!==article.unit&&(state.offers.some(o=>o.value.articleId===article.id)||state.counts.some(c=>c.value.articleId===article.id)||state.orders.some(o=>o.value.lines.some(l=>l.articleId===article.id))))throw new Error('Die Einheit eines verwendeten Artikels bleibt erhalten. Bitte einen neuen Artikel anlegen.');}
  return this.put(kind,value,previous,operationId);
 }
 public async saveOrder(order: Order,previous: Stored<Order> | undefined,operationId: string): Promise<Stored<Order>> {
  validateOrder(order);
  if(previous&&previous.value.status!=='Entwurf'){
   const allowed=previous.value.status==='Bestellt'&&['Abgeschlossen','Storniert'].includes(order.status);
   if(!allowed||!same({...previous.value,status:order.status},order))throw new Error('Bestellte Positionen bleiben erhalten. Bitte eine verknüpfte Nachbestellung anlegen.');
  }
  const {lines,...base}=order;const header: Header={...base,revision:operationId,lineIds:lines.map(l=>l.id)};
  const existing=await this.one<Header>('orders',order.id);
  if(existing?.operationId===operationId){if(!same(existing.value,header))throw new Error('Dieser Speichervorgang hat andere Eingaben. Bitte neu laden.');const restored=this.hydrate(existing,await this.rows<Position>('positions'));if(!same(restored.value,order))throw new Error('Bestellpositionen des Speichervorgangs unterscheiden sich.');return restored;}
  if(!previous||previous.value.status==='Entwurf')validateOrder(order,catalog(await this.load()));
  if(previous&&existing?.etag!==previous.etag)throw conflict();
  if(!previous&&existing)throw new Error('Diese Bestellung oder Vorjahresübernahme ist bereits vorhanden. Bitte neu laden.');
  for(const line of lines){const position: Position={id:`${order.id}:${operationId}:${line.id}`,orderId:order.id,revision:operationId,line};await this.put('positions',position,undefined,operationId);}
  const previousHeader=previous&&existing?existing:undefined;const saved=await this.put('orders',header,previousHeader,operationId);
  const confirmed=this.hydrate(saved,await this.rows<Position>('positions'));if(!same(confirmed.value,order))throw new Error('Bestellung noch nicht bestätigt. Bitte neu laden.');return confirmed;
 }
}
