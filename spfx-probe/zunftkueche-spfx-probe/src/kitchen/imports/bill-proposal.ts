/* eslint-disable @rushstack/no-new-null -- Missing proposals remain explicitly unknown. */
import type {BillLine} from '../ww/model';
import {importedNumber} from './preview.ts';
export interface BillProposal {number:string;date:string;net:number|null;tax:number|null;gross:number|null;lines:BillLine[]}
export function billProposal(text:string):BillProposal {
 const unique=(pattern:RegExp):string=>{const values=[...text.matchAll(pattern)].map(m=>m[1].trim());return new Set(values).size===1?values[0]:'';};
 const number=unique(/(?:Rechnungsnummer|Rechnung\s*(?:Nr\.?|Nummer)|Belegnummer)\s*[:#]?\s*([A-Z0-9][A-Z0-9_\/-]*)/gi);
 const rawDate=unique(/(?:Rechnungsdatum|Belegdatum|Datum)\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})/gi),parts=rawDate.split('.');const date=rawDate?parts[2]+'-'+parts[1].padStart(2,'0')+'-'+parts[0].padStart(2,'0'):'';
 const value=(pattern:RegExp):number|null=>{const raw=unique(pattern);try{return raw?importedNumber({text:raw},',',true):null;}catch{return null;}};
 return{number,date,net:value(/(?:Nettobetrag|Summe\s*Netto|Gesamt\s*Netto)\s*:?\s*(-?[\d.]+,\d{2})/gi),tax:value(/(?:MwSt\.?|Umsatzsteuer|Mehrwertsteuer)(?:\s+\d+[,.]?\d*\s*%)?\s*:?\s*(-?[\d.]+,\d{2})/gi),gross:value(/(?:Gesamtbetrag|Rechnungsbetrag|Endbetrag|Summe\s*Brutto)\s*:?\s*(-?[\d.]+,\d{2})/gi),lines:[]};
}
