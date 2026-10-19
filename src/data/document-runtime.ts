import type { KitchenGeneratedServices } from './microsoft-runtime.ts';
import type { Repository } from './repository.ts';
import { createDocumentRepository } from './documents.ts';
import type { DocumentStore, DocumentProvider, DocumentRow, ExtractDraft } from './documents.ts';

export function connectDocumentRepository(repo:Repository, services:KitchenGeneratedServices, provider:DocumentProvider, storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>) {
  let pinnedIdentity:string|undefined;
  function identity() {
    if(!repo.identity || !repo.canEdit)throw new Error('Belegeingang erfordert bestätigte Bearbeitungsrechte.');
    const current=JSON.stringify(repo.identity);
    if(pinnedIdentity && pinnedIdentity!==current)throw new Error('Konto geändert. Belegeingang neu öffnen.');
    pinnedIdentity=current;
    return structuredClone(repo.identity);
  }
  async function request(action?:string,value?:unknown) {
    const caller=identity();
    const base={protocolVersion:2,workspaceId:caller.workspaceId,identity:caller,view:'documents'};
    const key=`zunftkueche.document-pending.v1.${caller.organizationId}.${caller.workspaceId}.${caller.userId}`;
    async function send(raw:string,write:boolean) {
      const result=write?await services.commit.zk_KitchenCommit(raw):await services.load.zk_KitchenLoad(raw);
      if(!result.success||typeof result.data?.ResultJson!=='string')throw new Error('Dokumentvorgang nicht bestätigt. Bei erneutem Versuch bleibt derselbe Wiederholungsbezug erhalten.');
      const answer=JSON.parse(result.data.ResultJson);
      if(JSON.stringify(identity())!==JSON.stringify(caller)||answer.protocolVersion!==2||answer.workspaceId!==caller.workspaceId||answer.view!=='documents'
        ||Object.keys(caller).some(key=>answer.identity?.[key]!==caller[key as keyof typeof caller]))throw new Error('Dokumentantwort gehört zu anderem Konto oder Arbeitsbereich.');
      if(write)storage.removeItem(key);
      if(answer.status==='rejected')throw new Error(answer.message??'Dokumenteingabe abgelehnt. Bitte berichtigen.');
      return answer;
    }
    let raw=JSON.stringify(base);
    if(action) {
      const pending=storage.getItem(key);
      if(pending) {
        const prior=JSON.parse(pending);
        if(JSON.stringify(prior.identity)!==JSON.stringify(caller))throw new Error('Konto des unbestätigten Vorgangs stimmt nicht.');
        if(prior.action!==action||JSON.stringify(prior.value)!==JSON.stringify(value)) {
          const proposed=value as Record<string,unknown>;
          const same=prior.value.eventId===proposed.eventId && (prior.value.uploadId?prior.value.uploadId===proposed.uploadId:prior.value.id===proposed.id);
          if(!same)throw new Error('Ein anderer Dokumentvorgang ist noch unbestätigt. Zuerst diesen Vorgang wieder aufnehmen.');
          if(prior.value.uploadId && ['principal','sha256','mimeType','size','originalName'].some(k=>prior.value[k]!==proposed[k]))throw new Error('Wiederaufnahme braucht exakt dasselbe Original.');
          await send(pending,true);
          if(prior.action==='draft.save')throw new Error('Voriger Entwurf bestätigt. Bitte den gespeicherten Entwurf neu öffnen und Änderungen vergleichen.');
          return request(action,value);
        }
        raw=pending;
      } else {
        raw=JSON.stringify({...base,action,value,requestId:crypto.randomUUID()});
        storage.setItem(key,raw);
        if(storage.getItem(key)!==raw)throw new Error('Wiederholungsbezug konnte nicht gespeichert werden.');
      }
    }
    return send(raw,!!action);
  }
  function clean<T extends object>(value:T):T { const copy={...value} as T&{rawRow?:unknown};delete copy.rawRow;return copy; }
  const store:DocumentStore={
    list:async()=>{const result=await request();if(!Array.isArray(result.documents)||!Array.isArray(result.drafts))throw new Error('Dokumentinventar nicht gelesen.');return result;},
    begin:async value=>(await request('upload.begin',value)).value as DocumentRow,
    claim:async value=>(await request('upload.claim',clean(value))).value as DocumentRow,
    link:async value=>(await request('upload.link',clean(value))).value as DocumentRow,
    saveDraft:async value=>(await request('draft.save',clean(value))).value as ExtractDraft,
  };
  repo.documents=createDocumentRepository({api:provider,store});
}
