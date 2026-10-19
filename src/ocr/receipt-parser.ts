import type {ExtractionResult} from './engine.ts';
export const PARSER_VERSION='receipt-hints-v1';
export interface Evidence {page:number|null;start:number;end:number;quote:string}
export interface Proposal<T> {value:T|null;status:'proposed'|'missing'|'ambiguous'|'incomplete';evidence:Evidence[]}
export interface ReceiptDraft {
  parserVersion:typeof PARSER_VERSION;extraction:ExtractionResult;
  header:{supplierId:Proposal<string>;number:Proposal<string>;date:Proposal<string>;grossCents:Proposal<number>};
  lines:never[];warnings:string[];
}
/** Printed German amounts are separate from strict manually entered money. */
export function parseGermanCents(text:string):number|null {
  if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(text))return null;
  const negative=text.startsWith('-'),digits=text.replace(/[-.,]/g,'');
  const cents=Number(digits)*(negative?-1:1);
  return Number.isSafeInteger(cents)&&Math.abs(cents)<=100000000?cents:null;
}
export function parseReceipt(extraction:ExtractionResult,suppliers:Array<{id:string;name:string}>):ReceiptDraft {
  if(extraction.pages.reduce((sum,p)=>sum+p.text.length,0)>16000||extraction.pages.length>50)throw new Error('Texthelfer: höchstens 16.000 Zeichen; kein automatisches Kürzen.');
  const entries=extraction.pages.flatMap(p=>{let start=0;return p.text.split('\n').map(quote=>{const e={page:p.page,start,end:start+quote.length,quote};start+=quote.length+1;return e;});});
  function proposal<T>(get:(e:Evidence)=>T|null):Proposal<T>{
    const matches=entries.flatMap(e=>{const value=get(e);return value===null?[]:[{value,e}];});
    const unique=[...new Set(matches.map(m=>JSON.stringify(m.value)))];
    return {value:unique.length===1&&extraction.complete!==false?matches[0].value:null,status:extraction.complete===false?'incomplete':unique.length===0?'missing':unique.length===1?'proposed':'ambiguous',evidence:matches.map(m=>m.e)};
  }
  return {parserVersion:PARSER_VERSION,extraction:structuredClone(extraction),header:{
    supplierId:proposal(e=>{const found=suppliers.filter(s=>e.quote.trim().toLocaleLowerCase()===s.name.trim().toLocaleLowerCase());return found.length===1?found[0].id:null;}),
    number:proposal(e=>e.quote.trim().match(/^(?:Rechnungsnummer|Rechnung[ \t\u00a0]*Nr\.?|Belegnummer)(?:[ \t\u00a0]*:[ \t\u00a0]*|[ \t\u00a0]+)([\wÄÖÜäöüß./-]{1,100})$/i)?.[1]??null),
    date:proposal(e=>{const m=e.quote.trim().match(/^(?:Datum|Rechnungsdatum)(?:[ \t\u00a0]*:[ \t\u00a0]*|[ \t\u00a0]+)(\d{2})\.(\d{2})\.(\d{4})$/i);if(!m)return null;const date=`${m[3]}-${m[2]}-${m[1]}`;const parsed=new Date(date);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null;}),
    grossCents:proposal(e=>{const m=e.quote.trim().match(/^(?:Brutto|Gesamt(?:betrag)?[ \t\u00a0]+brutto|Bruttobetrag)(?:[ \t\u00a0]*:[ \t\u00a0]*|[ \t\u00a0]+)(-?[\d.,]+)[ \t\u00a0]*(?:EUR|€)?$/i);return m?parseGermanCents(m[1]):null;}),
  },lines:[],warnings:['Zeilen, Steuergruppen, Gebinde, Pfand, Rabatte und Gutschriften manuell prüfen. Netto wird nicht aus Brutto abgeleitet.',...(extraction.complete!==true?['Seitenzuordnung und Vollständigkeit sind nicht bestätigt.']:[])]};
}
export interface TextAssist {
  origin:'user-supplied';completeness:'unknown';parserVersion:typeof PARSER_VERSION;text:string;
  proposals:Array<{field:'supplierId'|'number'|'date'|'grossCents';value:string|null;status:Proposal<string>['status'];evidence:Evidence[]}>;
}
export function suppliedText(text:string,suppliers:Array<{id:string;name:string}>):TextAssist {
  const result=parseReceipt({provider:'user-supplied',providerVersion:'manual-paste-v1',documentId:null,documentVersion:null,sha256:null,complete:null,pageCount:null,pages:[{page:null,text}]},suppliers);
  return {origin:'user-supplied',completeness:'unknown',parserVersion:PARSER_VERSION,text,proposals:Object.entries(result.header).map(([field,p])=>({field:field as TextAssist['proposals'][number]['field'],value:p.value===null?null:String(p.value),status:p.status,evidence:p.evidence}))};
}
