import type {ExtractDraft} from '../data/documents.ts';
import {parseMoney} from './facts.ts';
import {parseQuantity} from '../domain/kitchen.ts';

export interface ReceiptEdit {
  draft: ExtractDraft;
  raw: {total: string; lines: Record<string,{quantity:string; grossCents:string}>};
}
const decimal=(value:number|null)=>value===null?'':String(value).replace('.',',');
export function createReceiptEdit(draft:ExtractDraft):ReceiptEdit {
  return {
    draft,
    raw: {
      total:decimal(draft.header.grossCents===null?null:draft.header.grossCents/100),
      lines:Object.fromEntries(draft.lines.map(line=>[line.id,{
        quantity:decimal(line.quantity),grossCents:decimal(line.grossCents===null?null:line.grossCents/100),
      }])),
    },
  };
}
/** Keep every keystroke until an acknowledged save/open establishes a new baseline. */
export function receiptEditDirty(edit:ReceiptEdit,baseline:string,queued:number):boolean {
  return queued>0 || JSON.stringify(edit)!==baseline;
}
export function replaceReceiptDraft(edit:ReceiptEdit,draft:ExtractDraft):ReceiptEdit {
  const defaults=createReceiptEdit(draft);
  return {draft,raw:{total:edit.raw.total,lines:Object.fromEntries(draft.lines.map(line=>[
    line.id,edit.raw.lines[line.id]??defaults.raw.lines[line.id],
  ]))}};
}
export function parseReceiptEdit(edit:ReceiptEdit):ExtractDraft {
  return {
    ...edit.draft,
    header:{...edit.draft.header,grossCents:parseMoney(edit.raw.total)},
    lines:edit.draft.lines.map(line=>({
      ...line,quantity:parseQuantity(edit.raw.lines[line.id].quantity),grossCents:parseMoney(edit.raw.lines[line.id].grossCents),
    })),
  };
}
