export type Day = 'Mittwoch'|'Freitag'|'Samstag'|'Sonntag'|'Allgemein'|'Alle Orte'|'Halle Küche'|'Zunftabende'|'Küche'|'Mitwirkende/Aufbau/Probe'|string;
export interface Source { file: string; hash: string; sheet?: string; cells?: string; page?:number; }
export interface PlanLine {id:string; supplierId:string; articleId:string; name:string; quantity:number|null; unit:string; day:Day; time:string|null; unitPriceCents:number|null; note?:string; lesson?:string; category?:string; location?:string; source?:Source;}
export interface OrderSnapshot {lines:ReadonlyArray<Readonly<PlanLine>>; groups:Array<{time:string|null;lines:ReadonlyArray<Readonly<PlanLine>>}>;totalCents:number|null;}
export function parseQuantity(raw:string):number|null {
  const value=raw.trim();
  if (!value) return null;
  if (!/^\d+(,\d{1,4})?$/.test(value)) throw new Error('Menge bitte als positive Zahl mit Dezimalkomma eingeben.');
  const quantity=Number(value.replace(',','.'));
  if (!Number.isFinite(quantity)||quantity>10000000) throw new Error('Menge liegt außerhalb des zulässigen Bereichs.');
  return quantity;
}
export function prepareOrder(lines:PlanLine[],supplierId:string,day:Day):OrderSnapshot {
  const selected=lines.filter(l=>l.supplierId===supplierId&&l.day===day).map(l=>Object.freeze(structuredClone(l)));
  const times=[...new Set(selected.map(l=>l.time))].sort((a,b)=>(a??'99:99').localeCompare(b??'99:99'));
  const priced=selected.every(l=>l.quantity!==null&&l.unitPriceCents!==null);
  return {
    lines:Object.freeze(selected),
    groups:times.map(time=>({time,lines:Object.freeze(selected.filter(l=>l.time===time))})),
    totalCents: selected.length&&priced? selected.reduce((sum,l)=>sum+Math.round(l.quantity!*l.unitPriceCents!),0):null,
  };
}
export function recipeCost(lines:Array<{quantity:number|null;unitPriceCents:number|null}>):{totalCents:number|null;missing:number} {
  const missing=lines.filter(l=>l.quantity===null||l.unitPriceCents===null).length;
  return {totalCents:!lines.length||missing?null:lines.reduce((sum,l)=>sum+Math.round(l.quantity!*l.unitPriceCents!),0),missing};
}
export function stockBalance(opening:number|null,movements:Array<{type:string;quantity:number}>):number|null {
  if (opening===null) return null;
  return movements.reduce((balance,m)=>balance+(['Lieferung','Zugang'].includes(m.type)?m.quantity:['Verbrauch','Abfall','Rückgabe'].includes(m.type)?-m.quantity:0),opening);
}
export function salesRevenue(lines:Array<{quantity:number|null;priceCents:number|null}>):{totalCents:number|null;missing:number} {
  const missing=lines.filter(l=>l.quantity===null||l.priceCents===null).length;
  return {totalCents:!lines.length||missing?null:lines.reduce((sum,l)=>sum+Math.round(l.quantity!*l.priceCents!),0),missing};
}
