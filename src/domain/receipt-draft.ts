import type {ExtractDraft,DocumentRepository,DocumentRow,DraftPage} from '../data/documents.ts';
import type {KitchenState,Operation,Receipt} from './state.ts';
import type {ReceiptEdit} from '../ui/receipt-intake-draft.ts';
import {parseReceiptEdit} from '../ui/receipt-intake-draft.ts';
export interface ReviewDecisions {receipt:boolean;fields:boolean;originals:boolean;prices:'separate';stock:'separate'}
export interface ReceiptAcceptance {
  eventId:string;expectedWorkspaceRevision:number;draftId:string;draftRowVersion:string;
  documentVersion:DraftPage[];reviewedFields:{header:ExtractDraft['header'];lines:ExtractDraft['lines'];raw:ReceiptEdit['raw']};
  reviewDecisions:ReviewDecisions;operationId?:string;
}
export function receiptFromAcceptance(state:KitchenState,op:Operation):Receipt {
  const p=op.payload as ReceiptAcceptance,d=p.reviewDecisions,f=p.reviewedFields;
  if(p.eventId!==state.event.id||p.expectedWorkspaceRevision!==op.baseRevision||p.operationId!==op.id||!p.draftRowVersion||!p.draftId
    ||!d?.receipt||!d.fields||!d.originals||d.prices!=='separate'||d.stock!=='separate'||!p.documentVersion.length||p.documentVersion.some(page=>!page.originalReviewed))throw new Error('Belegprüfung, Veranstaltung oder Fassung unbestätigt.');
  if(state.invoices.some(r=>r.id===p.draftId||r.intake?.draftId===p.draftId))throw new Error('Prüfentwurf bereits übernommen.');
  // Original-byte and native row checks are repeated at the repository/server boundaries.
  return {id:p.draftId,...f.header,date:f.header.date||null,netCents:null,status:'Erfasst',documentUrl:null,
    lines:f.lines.map(l=>({...(l.articleId?{articleId:l.articleId}:{}),name:l.description,quantity:l.quantity,unit:l.unit,netCents:null,grossCents:l.grossCents})),
    intake:{draftId:p.draftId,operationId:op.id}};
}
export async function prepareReceiptAcceptance(edit:ReceiptEdit,state:KitchenState,repo:DocumentRepository,decisions:ReviewDecisions):Promise<ReceiptAcceptance> {
  const draft=parseReceiptEdit(edit);
  if(!draft.rowVersion||draft.reviewStatus!=='reviewed'||draft.acceptance)throw new Error('Geprüften Entwurf zuerst speichern.');
  const inventory=await repo.list(),stored=inventory.drafts.find(d=>d.id===draft.id);
  if(!stored||stored.eventId!==state.event.id||stored.rowVersion!==draft.rowVersion||stored.acceptance
    ||JSON.stringify(stored.header)!==JSON.stringify(draft.header)||JSON.stringify(stored.lines)!==JSON.stringify(draft.lines)
    ||JSON.stringify(stored.pages)!==JSON.stringify(draft.pages))throw new Error('Prüfentwurf geändert. Bitte neu öffnen und prüfen.');
  for(const page of draft.pages){const row=inventory.documents.find(d=>d.id===page.documentId);requireCurrentOriginal(row,page,state.event.id);await repo.getOriginal(row!.ref!);}
  return {eventId:state.event.id,expectedWorkspaceRevision:state.revision,draftId:draft.id,draftRowVersion:draft.rowVersion,documentVersion:structuredClone(draft.pages),reviewedFields:{header:draft.header,lines:draft.lines,raw:structuredClone(edit.raw)},reviewDecisions:decisions};
}
export function requireCurrentOriginal(row:DocumentRow|undefined,page:DraftPage,eventId:string):void {
  if(!row?.ref||row.status!=='linked'||row.eventId!==eventId||row.rowVersion!==page.documentRowVersion||row.ref.version!==page.version||row.sha256!==page.sha256||!page.originalReviewed)throw new Error('Original oder Dokumentfassung geändert / nicht geprüft.');
}
