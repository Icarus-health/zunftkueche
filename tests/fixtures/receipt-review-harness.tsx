import {validateOriginal} from '../../src/data/documents.ts';
// Isolated UI/request fixture only. No SDK, provider, network, browser persistence or private source data.
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReceiptIntake from '../../src/screens/ReceiptIntake.tsx';
import {applyEventOperation} from '../../src/domain/event-context.ts';
import {receiptSnapshot} from '../../src/domain/corrections.ts';
import type {KitchenState,Operation} from '../../src/domain/state.ts';
import type {DocumentRepository,DocumentRow,ExtractDraft} from '../../src/data/documents.ts';
import {requestDraftNavigation} from '../../src/hooks/useDraftGuard.ts';
import '../../src/styles.css';
const initial:KitchenState={schemaVersion:2,revision:0,operationIds:[],operationRequests:{},event:{id:'fixture-event',name:'ISOLIERTER TESTABEND',year:2026,dates:{Freitag:'2026-10-23',Samstag:'2026-10-24'},status:'Offen'},sourceNotice:'Nur synthetische Prüfdaten',suppliers:[{id:'supplier',name:'Testmarkt',email:null}],articles:[{id:'article',supplierId:'supplier',name:'Kartoffeln',unit:'kg',unitPriceCents:200,category:'Lebensmittel'}],planLines:[],menu:[],invoices:[],sales:[],movements:[],orders:[],dishPlan:[],lessons:[]};
const pngBytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
function Harness(){
  const [state,setState]=useState(initial),[open,setOpen]=useState(true),[request,setRequest]=useState(''),[result,setResult]=useState('');
  const [failSave,setFailSave]=useState(false),[failAccept,setFailAccept]=useState(false),[loseAck,setLoseAck]=useState(false),[pending,setPending]=useState<Operation|null>(null);
  const flags=useRef({failSave,failAccept,loseAck});flags.current={failSave,failAccept,loseAck};
  const backend=useRef({state:structuredClone(initial),drafts:[] as ExtractDraft[],docs:[] as DocumentRow[],writes:0});
  const [repo]=useState<DocumentRepository>(()=>{
    const documentId='11111111-1111-4111-8111-111111111111',row:DocumentRow={id:documentId,uploadId:documentId,eventId:initial.event.id,rowVersion:'3',status:'linked',principal:'synthetic-user',sha256:'c97e255bba6143711779d73e61726eab398ef2d29caaa632083e59315d60f243',size:68,mimeType:'image/png',originalName:'SYNTHETISCHES TESTORIGINAL',ref:{provider:'sharepoint',siteCollectionId:'f8177aa4-4ba3-4ba1-8c26-5ed32d5b2923',webId:'c24ab669-3ca6-4530-aabf-6f42f8343ae7',libraryId:'9e71defe-f678-4c0c-b69c-45e4370a735a',itemId:'1',version:'etag-1',connectorIdentifier:'synthetic',webUrl:'https://schelmenzunft.sharepoint.com/synthetic-not-requested',sha256:'c97e255bba6143711779d73e61726eab398ef2d29caaa632083e59315d60f243',size:68,mimeType:'image/png',originalName:'SYNTHETISCHES TESTORIGINAL'}};
    backend.current.docs=[row];backend.current.drafts=[{schemaVersion:1,id:'22222222-1111-4111-8111-111111111111',eventId:initial.event.id,rowVersion:'1',source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,reviewStatus:'editing',pages:[{documentId,documentRowVersion:'3',version:'etag-1',sha256:row.sha256,originalReviewed:false}],header:{supplierId:'supplier',number:'TESTENTWURF ÖFFNEN',date:'2026-10-19',scope:'Küche',grossCents:null},lines:[{id:'33333333-1111-4111-8111-111111111111',description:'Kartoffeln',articleId:'article',quantity:null,unit:'kg',grossCents:null}]}];
    return {list:async()=>structuredClone({documents:backend.current.docs,drafts:backend.current.drafts}),upload:async()=>{throw Error('Fixture: Upload ausgeschaltet.');},loadUpload:async()=> 'linked',getOriginal:async()=>{const original=new File([pngBytes],'SYNTHETISCHES-1x1-TESTORIGINAL.png',{type:'image/png'});await validateOriginal(original);return original;},saveDraft:async d=>{if(flags.current.failSave)throw Error('Fixture: Speichern abgelehnt. Rohwerte bleiben erhalten.');const saved={...structuredClone(d),rowVersion:String(++backend.current.writes+1)};backend.current.drafts=backend.current.drafts.filter(x=>x.id!==d.id).concat(saved);return saved;}};
  });
  async function send(op:Operation):Promise<boolean>{
    setRequest(JSON.stringify(op,null,2));
    if(flags.current.failAccept){setResult('Fixture: definitive Ablehnung ohne Änderung');return false;}
    const replay=backend.current.state.operationIds.includes(op.id);
    const next=applyEventOperation(backend.current.state,op.targetEventId!,op).state;
    if(!replay){backend.current.state=next;backend.current.writes++;const draft=backend.current.drafts.find(d=>d.id===op.payload.draftId)!;draft.reviewStatus='accepted';draft.rowVersion=String(backend.current.writes+10);draft.acceptance={operationId:op.id,receiptId:draft.id,requestHash:'b'.repeat(64),appliedRevision:next.revision,actorId:'cccccccc-1111-4111-8111-111111111111',recordedAt:'2026-10-19T12:00:00.000Z',reviewedFields:op.payload.reviewedFields,reviewDecisions:op.payload.reviewDecisions,documentVersion:op.payload.documentVersion};const invoice=next.invoices.at(-1)!;invoice.documentUrl=backend.current.docs[0].ref!.webUrl;invoice.sourceBaseline=receiptSnapshot(invoice);}
    if(flags.current.loseAck&&!replay){setPending(op);setResult('Fixture: Antwort verloren; exakt dieselbe Anfrage wiederholen.');throw Error('Fixture: Antwort verloren.');}
    setPending(null);setState(structuredClone(backend.current.state));setResult(JSON.stringify({status:'saved',replayed:replay,revision:next.revision,invoiceCount:next.invoices.length,writes:backend.current.writes},null,2));return true;
  }
  return <main style={{maxWidth:1300,margin:'auto',padding:20}}><h1>Isolierter Belegprüfplatz</h1><p>Nur synthetische Daten im Arbeitsspeicher. Kein SDK, Netzwerk, Upload oder private Speicherung. Beweist UI und Anfragen; keine Microsoft-Transaktion, Rechte oder providerseitige Prüfung. Vorschau: echtes synthetisches 1×1-PNG aus document-files.mjs; kein lesbarer Rechnungsinhalt. Testwerte werden unten manuell bzw. als Text eingegeben.</p><label><input type="checkbox" checked={failSave} onChange={e=>setFailSave(e.target.checked)}/>Entwurfspeicherung ablehnen</label><label><input type="checkbox" checked={failAccept} onChange={e=>setFailAccept(e.target.checked)}/>Übernahme ablehnen</label><label><input type="checkbox" checked={loseAck} onChange={e=>setLoseAck(e.target.checked)}/>Erste Übernahmeantwort verlieren</label>{pending&&<button onClick={()=>void send(pending)}>Exakte offene Anfrage wiederholen</button>}
    <details open><summary>Erfasste Anfrage und Ergebnis</summary><pre data-testid="captured-request">{request||'Noch keine Übernahme'}</pre><pre data-testid="captured-result">{result||'Noch kein Ergebnis'}</pre></details>
    {open?<ReceiptIntake state={state} documents={repo} busy={!!pending} readOnly={false} mode="local" saveError="" go={()=>{}} onClose={()=>requestDraftNavigation(()=>setOpen(false))} commit={async(type,payload)=>{const id=crypto.randomUUID();return send({id,type,payload:{...payload as object,operationId:id},baseRevision:state.revision,targetEventId:state.event.id});}}/>:<button onClick={()=>setOpen(true)}>Belegeingang erneut öffnen</button>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
