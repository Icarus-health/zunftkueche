/* eslint-disable @rushstack/no-new-null -- Blank counts remain explicitly unknown. */
import type { Count, InventorySession, Order, Receipt, Workspace } from './model';

function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Vorgang ist ungültig.'); return value as Record<string, unknown>; }
function text(value: unknown, label: string, max = 1000, optional = false): void { if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw new Error(label+' bitte prüfen.'); }
function key(value: unknown): void { if(typeof value!=='string'||!/^[a-zA-Z0-9:_-]{1,240}$/.test(value))throw new Error('Vorgangskennung ist ungültig.'); }
function amount(value: unknown): asserts value is number { if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>10000000||Math.abs(value*10000-Math.round(value*10000))>.0001)throw new Error('Menge bitte als positive Zahl mit höchstens vier Nachkommastellen eingeben.'); }
function time(value: unknown): void { if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new Error('Zeitpunkt bitte prüfen.'); }
export function receivedQuantity(order: Order, lineId: string): number { return (order.receipts||[]).reduce((sum,r)=>sum+r.lines.filter(l=>l.lineId===lineId).reduce((s,l)=>s+Math.round(l.quantity*10000),0),0)/10000; }
export function deliveryState(order: Order): string { if(!(order.receipts||[]).length)return 'Nicht geliefert';return order.lines.every(l=>Math.round(receivedQuantity(order,l.id)*10000)>=Math.round((l.quantity||0)*10000))?'Vollständig geliefert':'Teilgeliefert'; }
export function validateReceipt(order: Order, receipt: Receipt): void {
 const r=record(receipt);key(r.id);time(r.receivedAt);text(r.receivedBy,'Erfassende Person',200);text(r.note,'Hinweis',1000,true);
 if(order.status!=='Bestellt')throw new Error('Lieferungen nur zu tatsächlich aufgegebenen, bestellten Vorgängen erfassen.');
 if((order.receipts||[]).some(x=>x.id===receipt.id))throw new Error('Doppelte Lieferannahme.');
 if(!Array.isArray(r.lines)||!r.lines.length||r.lines.length>200)throw new Error('Bitte mindestens eine gelieferte Menge angeben.');
 const seen=new Set<string>();
 for(const raw of receipt.lines){const l=record(raw);key(l.lineId);if(seen.has(String(l.lineId)))throw new Error('Doppelte Lieferposition.');seen.add(String(l.lineId));amount(l.quantity);if(l.quantity===0)throw new Error('Gelieferte Menge muss größer als null sein.');const ordered=order.lines.find(x=>x.id===l.lineId);if(!ordered||ordered.quantity===null)throw new Error('Bestellposition ist nicht vorhanden.');if(Math.round((receivedQuantity(order,ordered.id)+l.quantity)*10000)>Math.round(ordered.quantity*10000))throw new Error('Die Menge überschreitet die offene Restmenge. Überlieferung bitte zunächst mit dem Lieferanten klären.');}
}
export function validateStoredReceipts(order: Order): void { if(order.receipts===undefined)return;if(!Array.isArray(order.receipts)||order.receipts.length>100)throw new Error('Lieferhistorie ist ungültig.');if(order.receipts.length&&order.status==='Entwurf')throw new Error('Ein Entwurf kann keine Lieferungen enthalten.');const prior:Receipt[]=[];for(const r of order.receipts){validateReceipt({...order,status:'Bestellt',receipts:prior},r);prior.push(r);} }
export function countQuantity(packs: number | null, loose: number | null, packSize: number): number | null {
 amount(packSize);if(packSize===0)throw new Error('Gebindegröße bitte prüfen.');if(packs===null&&loose===null)return null;
 if(packs!==null){amount(packs);if(!Number.isInteger(packs))throw new Error('Bitte ganze Gebinde und die übrige Einzelmenge angeben.');}if(loose!==null)amount(loose);
 const value=Math.round(((packs||0)*packSize+(loose||0))*10000)/10000;amount(value);return value;
}
export function validateInventory(value: InventorySession): void {
 const v=record(value);key(v.id);key(v.seasonId);if(v.area!=='Küche'&&v.area!=='Zunftscheuer')throw new Error('Bereich bitte prüfen.');time(v.createdAt);text(v.countedBy,'Erfassende Person',200);
 if(v.status!=='Entwurf'&&v.status!=='Abgeschlossen')throw new Error('Zählstatus bitte prüfen.');if(v.status==='Entwurf'&&v.completedAt!==null)throw new Error('Der Zählentwurf darf nicht abgeschlossen sein.');if(v.status==='Abgeschlossen')time(v.completedAt);
 if(!Array.isArray(v.lines)||!v.lines.length||v.lines.length>300)throw new Error('Bitte zwischen einem und 300 Artikeln zählen.');const seen=new Set<string>();let counted=0;
 for(const raw of value.lines){const l=record(raw);key(l.articleId);if(seen.has(String(l.articleId)))throw new Error('Doppelter Artikel in der Zählung.');seen.add(String(l.articleId));text(l.articleName,'Artikelname',160);text(l.unit,'Einheit',40);text(l.packName,'Gebinde',40);text(l.note,'Hinweis',1000,true);if(!['ok','reorder','surplus'].includes(String(l.assessment)))throw new Error('Einschätzung bitte prüfen.');if(countQuantity(l.packs as number|null,l.loose as number|null,l.packSize as number)!==null)counted++;}
 if(v.status==='Abgeschlossen'&&!counted)throw new Error('Bitte mindestens eine Menge zählen.');
 if(JSON.stringify(value).length>58000)throw new Error('Die Zählliste ist zu groß. Bitte Hinweise kürzen oder weniger Artikel gemeinsam erfassen.');
}
export function observedCounts(state: Workspace): Count[] {
 const counts=state.counts.map(c=>c.value);
 for(const {value:s}of state.inventories||[]){if(s.status!=='Abgeschlossen'||!s.completedAt)continue;for(const l of s.lines){const quantity=countQuantity(l.packs,l.loose,l.packSize);if(quantity===null)continue;counts.push({id:s.id+':'+l.articleId,seasonId:s.seasonId,area:s.area,articleId:l.articleId,articleName:l.articleName,unit:l.unit,quantity,countedAt:s.completedAt,countedBy:s.countedBy,note:l.note,reorder:l.assessment==='reorder',surplus:l.assessment==='surplus'});}}
 return counts;
}
export function latestCounts(state: Workspace, seasonId: string, area: string): Count[] { const latest=new Map<string,Count>();for(const c of observedCounts(state).filter(c=>c.seasonId===seasonId&&c.area===area).sort((a,b)=>a.countedAt.localeCompare(b.countedAt)||a.id.localeCompare(b.id)))latest.set(c.articleId,c);return [...latest.values()]; }
