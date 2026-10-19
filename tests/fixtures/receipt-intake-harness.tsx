// In-memory UI regression fixture. No storage, network, or provider writes.
import {useMemo,useState} from 'react';
import ReceiptIntake from '../../src/screens/ReceiptIntake.tsx';
import type {KitchenState} from '../../src/domain/state.ts';
import type {DocumentRepository,DocumentRow,ExtractDraft} from '../../src/data/documents.ts';
import {requestDraftNavigation} from '../../src/hooks/useDraftGuard.ts';

export function ReceiptIntakeHarness({state}:{state:KitchenState}) {
  const [open,setOpen]=useState(true);
  const [attempts,setAttempts]=useState(0);
  const [pending,setPending]=useState<(()=>void)|null>(null);
  const documents=useMemo<DocumentRepository>(()=>{
    const row={id:'11111111-1111-4111-8111-111111111111',uploadId:'11111111-1111-4111-8111-111111111111',eventId:state.event.id,
      workspaceId:'fixture',rowVersion:'3',status:'linked',principal:'fixture',sha256:'a'.repeat(64),size:3,
      originalName:'Isoliertes Testoriginal.png',mimeType:'image/png',ref:{version:'etag-1'}} as DocumentRow;
    const saved:ExtractDraft={schemaVersion:1,id:'22222222-1111-4111-8111-111111111111',eventId:state.event.id,
      rowVersion:'1',source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,reviewStatus:'editing',
      pages:[{documentId:row.id,documentRowVersion:row.rowVersion,version:'etag-1',sha256:row.sha256,originalReviewed:false}],
      header:{supplierId:'',number:'GESPEICHERTER TESTENTWURF',date:'',scope:'',grossCents:null},
      lines:[{id:'33333333-1111-4111-8111-111111111111',description:'Testposition',articleId:'',quantity:null,unit:'',grossCents:null}]};
    return {
      list:async()=>({documents:[row],drafts:[saved]}),
      upload:async()=>{throw Error('Fixture: kein Upload möglich.');},
      getOriginal:async()=>new Blob(['fixture'],{type:'application/pdf'}),
      loadUpload:async()=>{await new Promise<void>(resolve=>setPending(()=>resolve));return 'linked';},
      saveDraft:async()=>{setAttempts(value=>value+1);await new Promise<void>(resolve=>setPending(()=>resolve));throw Error('Fixture: Speichern abgelehnt; Eingaben bleiben erhalten.');},
    };
  },[state]);
  return <>
    <p>In-memory receipt fixture · Save attempts: <output>{attempts}</output></p>
    {pending && <button onClick={()=>{pending();setPending(null);}}>Testvorgang abschließen</button>}
    {open ? <ReceiptIntake state={state} busy={false} readOnly={false} mode="local" saveError=""
      commit={async()=>false} go={()=>{}} documents={documents}
      onClose={()=>requestDraftNavigation(()=>setOpen(false))}/>
      : <button onClick={()=>setOpen(true)}>Belegeingang erneut öffnen</button>}
  </>;
}
