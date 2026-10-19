import {prepareReceiptAcceptance} from '../domain/receipt-draft.ts';
import type {ReceiptAcceptance,ReviewDecisions} from '../domain/receipt-draft.ts';
import type {DocumentRepository,ExtractDraft} from '../data/documents.ts';
import type {KitchenState} from '../domain/state.ts';
import type {ReceiptEdit} from './receipt-intake-draft.ts';
interface AcceptanceOptions {
  edit:ReceiptEdit;state:KitchenState;documents:DocumentRepository;decisions:ReviewDecisions;
  commit:(payload:ReceiptAcceptance)=>Promise<boolean>;
  refresh:DocumentRepository['list'];currentEdit:()=>ReceiptEdit;
  onAccepted:(draft:ExtractDraft)=>void;onPending:(pending:boolean)=>void;
}
export class ReceiptAcceptanceSession {
  private active=false;
  get pending():boolean {return this.active;}
  edit(action:()=>void):boolean {if(this.active)return false;action();return true;}
  async accept(options:AcceptanceOptions):Promise<boolean> {
    if(this.active)return false;
    // The owner is locked synchronously, before list/original reads or React's next render.
    this.active=true;
    try {
      options.onPending(true);
      const edit=structuredClone(options.edit),fingerprint=JSON.stringify(edit);
      const payload=await prepareReceiptAcceptance(edit,structuredClone(options.state),options.documents,structuredClone(options.decisions));
      if(!await options.commit(payload))return false;
      // SaveController keeps this await unresolved after acknowledgement loss. Its exact retry
      // must resolve before the owner unlocks; no local cancellation can stop that operation.
      const inventory=await options.refresh();
      if(JSON.stringify(options.currentEdit())!==fingerprint)throw new Error('Prüfentwurf inzwischen geändert. Lokale Angaben bleiben erhalten; Übernahmestand neu prüfen.');
      const accepted=inventory.drafts.find(d=>d.id===edit.draft.id&&d.eventId===payload.eventId);
      if(accepted?.reviewStatus!=='accepted'||accepted.acceptance?.receiptId!==edit.draft.id)throw new Error('Übernahme bestätigt, endgültiger Prüfentwurf noch nicht frisch geladen. Angaben bleiben erhalten.');
      options.onAccepted(accepted);
      return true;
    } finally {
      this.active=false;
      options.onPending(false);
    }
  }
}
