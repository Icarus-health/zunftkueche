import {useEffect,useRef,useState} from 'react';
import type {ScreenProps} from '../App.tsx';
import {DOCUMENT_LIMITS,validateOriginal} from '../data/documents.ts';
import type {DocumentRepository,DocumentRow,ExtractDraft} from '../data/documents.ts';
import {DocumentPreview} from '../components/DocumentPreview.tsx';
import {requestDraftNavigation,useDraftGuard} from '../hooks/useDraftGuard.ts';
import {DiscardChangesDialog} from '../components/DiscardChangesDialog.tsx';
import {amount} from '../components/shared.tsx';
import {parseMoney} from '../ui/facts.ts';
import {parseQuantity} from '../domain/kitchen.ts';

export default function ReceiptIntake({state,documents:repo,readOnly,onClose}:ScreenProps&{documents:DocumentRepository;onClose:()=>void}) {
  const closed=state.event.status==='Abgeschlossen';
  const blocked=readOnly||closed;
  const fresh=():ExtractDraft=>({schemaVersion:1,id:crypto.randomUUID(),eventId:state.event.id,source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,reviewStatus:'editing',pages:[],header:{supplierId:'',number:'',date:'',scope:'',grossCents:null},lines:[]});
  const [draft,setDraft]=useState<ExtractDraft>(fresh),[saved,setSaved]=useState('');
  const [rows,setRows]=useState<DocumentRow[]>([]),[drafts,setDrafts]=useState<ExtractDraft[]>([]);
  const [queue,setQueue]=useState<Array<{uploadId:string;file:File}>>([]),[preview,setPreview]=useState<{blob:Blob;name:string;documentId?:string}|null>(null);
  const [working,setWorking]=useState(false),[message,setMessage]=useState(''),[step,setStep]=useState(0);
  const [viewed,setViewed]=useState<string[]>([]);
  const [uploadStatuses,setUploadStatuses]=useState<Record<string,string>>({});
  const root=useRef<HTMLElement|null>(null);
  const abort=useRef<AbortController|null>(null);
  const guard=useDraftGuard({dirty:!!queue.length||!!draft.pages.length&&JSON.stringify(draft)!==saved,onDiscard:()=>{abort.current?.abort();setQueue([]);setDraft(fresh());setSaved('');}});
  async function refresh(){const inventory=await repo.list();setRows(inventory.documents.filter(r=>r.eventId===state.event.id));setDrafts(inventory.drafts.filter(r=>r.eventId===state.event.id));return inventory;}
  useEffect(()=>{void refresh().catch(error=>setMessage(error.message));return()=>abort.current?.abort();},[repo,state.event.id]);
  async function select(files:File[],resume?:DocumentRow) {
    setMessage('');
    try {
      if(resume&&files.length!==1)throw new Error('Für die Wiederaufnahme genau dasselbe Original auswählen.');
      const linkedBytes=draft.pages.reduce((sum,page)=>sum+(rows.find(row=>row.id===page.documentId)?.size??0),0);
      const total=linkedBytes+queue.reduce((sum,q)=>sum+q.file.size,0)+files.reduce((sum,f)=>sum+f.size,0);
      if(draft.pages.length+queue.length+files.length>DOCUMENT_LIMITS.maxOriginals||total>DOCUMENT_LIMITS.maxTotalBytes)throw new Error('Höchstens 10 Originale mit zusammen 20 MiB auswählen.');
      for(const file of files)await validateOriginal(file);
      setQueue([...queue,...files.map(file=>({uploadId:resume?.uploadId??crypto.randomUUID(),file}))]);
      if(files[0])setPreview({blob:files[0],name:files[0].name});
    }catch(error){setMessage((error as Error).message);}
  }
  async function upload() {
    setWorking(true);setMessage('');setStep(0);abort.current=new AbortController();
    try {
      const pages=[...draft.pages];
      for(const [index,entry] of queue.entries()) {
        await repo.upload({...entry,eventId:state.event.id,signal:abort.current.signal});
        const inventory=await refresh();const row=inventory.documents.find(row=>row.uploadId===entry.uploadId)!;
        if(!pages.some(p=>p.documentId===row.id))pages.push({documentId:row.id,documentRowVersion:row.rowVersion,version:row.ref!.version,sha256:row.sha256,originalReviewed:false});
        setDraft(current=>({...current,pages:[...pages],reviewStatus:'editing'}));setStep(index+1);
        setQueue(current=>current.filter(item=>item.uploadId!==entry.uploadId));
      }
      setMessage('Originale verknüpft. Bitte jedes Original öffnen, prüfen und die Angaben erfassen.');
    }catch(error){setMessage((error as Error).message);await refresh().catch(()=>{});}finally{setWorking(false);}
  }
  async function open(row:DocumentRow) {
    if(!row.ref)return;
    setWorking(true);setMessage('');
    try{const blob=await repo.getOriginal(row.ref);setPreview({blob,name:row.originalName,documentId:row.id});setViewed(values=>[...new Set([...values,row.id])]);}
    catch(error){setMessage((error as Error).message);}finally{setWorking(false);}
  }
  function add(row:DocumentRow) {
    if(!row.ref||draft.pages.some(p=>p.documentId===row.id))return;
    if(draft.pages.length>=10||row.size+draft.pages.reduce((sum,page)=>sum+(rows.find(row=>row.id===page.documentId)?.size??0),0)>DOCUMENT_LIMITS.maxTotalBytes){setMessage('Höchstens zehn Originale und 20 MiB pro Entwurf.');return;}
    setDraft({...draft,reviewStatus:'editing',pages:[...draft.pages,{documentId:row.id,documentRowVersion:row.rowVersion,version:row.ref.version,sha256:row.sha256,originalReviewed:false}]});
  }
  function reorder(index:number,direction:number){const pages=[...draft.pages],other=index+direction;if(other<0||other>=pages.length)return;[pages[index],pages[other]]=[pages[other],pages[index]];setDraft({...draft,pages,reviewStatus:'editing'});}
  async function save() {
    if(root.current?.querySelector<HTMLInputElement>('input:invalid')){root.current.querySelector<HTMLInputElement>('input:invalid')!.reportValidity();return;}
    setWorking(true);setMessage('');
    try {
      // Fresh external reads before saving preserve the distinction from Dataverse RowVersion.
      for(const page of draft.pages){const row=rows.find(r=>r.id===page.documentId);if(!row?.ref)throw new Error('Originalzuordnung fehlt.');await repo.getOriginal(row.ref);}
      const result=await repo.saveDraft(draft);setDraft(result);setSaved(JSON.stringify(result));await refresh();
      setMessage('Manueller Prüfentwurf gespeichert. Noch keine Rechnung übernommen und keine Bestandsbuchung ausgelöst.');
    }catch(error){setMessage((error as Error).message);}finally{setWorking(false);}
  }
  const changeHeader=(key:keyof ExtractDraft['header'],value:string|number|null)=>setDraft({...draft,reviewStatus:'editing',header:{...draft.header,[key]:value}});
  return <section className="receipt-intake" ref={root}>
    <div className="toolbar"><h2>Foto / PDF erfassen</h2><button className="button secondary" disabled={working} onClick={onClose}>Zurück zu Belegen</button></div>
    {closed&&<p role="status">Diese Veranstaltung ist abgeschlossen. Originale und Entwürfe bleiben lesbar; neue Uploads und Änderungen sind gesperrt. Erst nach begründeter Wiederöffnung kann weiter erfasst werden.</p>}
    <p>Manuelle Erfassung · keine automatische Erkennung aktiv. Originale liegen in SharePoint; der Prüfentwurf bleibt getrennt von den Küchenbuchungen.</p>
    <p>Vorläufige Schutzgrenzen: JPEG, PNG oder PDF; 5 MiB je Original, Bilder höchstens 24 Millionen Pixel und 8192 Pixel Kantenlänge, höchstens 10 geordnete Originale und 20 MiB pro Entwurf. Die Gerätegrenzen sind noch in der echten App zu prüfen. Ein PDF wird vollständig aufbewahrt; keine Seiten werden abgeschnitten.</p>
    <fieldset disabled={working||blocked}>
      <label>Foto aufnehmen<input type="file" accept="image/jpeg,image/png" capture="environment" onChange={e=>{void select(Array.from(e.target.files??[]));e.target.value='';}}/></label>
      <label>Dateien auswählen<input type="file" accept="image/jpeg,image/png,application/pdf,.heic,.heif" multiple onChange={e=>{void select(Array.from(e.target.files??[]));e.target.value='';}}/></label>
      <p>HEIC bitte vorab als JPEG/PNG exportieren oder die Kamera auf ein kompatibles Format stellen.</p>
      {queue.map((entry,index)=><div key={entry.uploadId} className="panel"><span>{index+1}. {entry.file.name} · {(entry.file.size/1024).toFixed(0)} KiB</span><button type="button" onClick={()=>setPreview({blob:entry.file,name:entry.file.name})}>Vorschau</button><button type="button" onClick={()=>setQueue(queue.filter(q=>q!==entry))}>Aus Auswahl entfernen / neu aufnehmen</button><details><summary>Technische Angaben</summary><small>Upload-ID: {entry.uploadId}</small></details></div>)}
      <button className="button primary" disabled={!queue.length} onClick={upload}>Originale hochladen</button>
    </fieldset>
    {working&&<div role="status"><p>Verbindung wird geprüft / Vorgang läuft … {step} Originale abgeschlossen.</p><progress aria-label="Abgeschlossene Originale" value={step} max={step+queue.length||1}/><button onClick={()=>abort.current?.abort()}>Nach aktuellem Schritt abbrechen</button><p>Ein gestarteter Dienstaufruf lässt sich hier nicht sicher stoppen. Gespeicherte Originale bleiben erhalten.</p></div>}
    {message&&<p role="status">{message}</p>}
    {preview&&<DocumentPreview blob={preview.blob} name={preview.name}/>}
    <section className="panel"><h3>Gespeicherte Originale und offene Uploads</h3>{rows.map(row=><div className="panel" key={row.id}><strong>{row.originalName}</strong><p>{row.status==='linked'?'Dokument verknüpft':row.status==='selected'?'Ausgewählt; Upload noch nicht gestartet':'Uploadausgang prüfen / wieder aufnehmen'}</p><details><summary>Technische Angaben</summary><small>Upload-ID: {row.uploadId}</small></details>{uploadStatuses[row.id]&&<p>{uploadStatuses[row.id]}</p>}<button disabled={working} onClick={async()=>{setWorking(true);try{const status=await repo.loadUpload(row.uploadId);setUploadStatuses(current=>({...current,[row.id]:status==='uploaded-unlinked'?'Original gespeichert, Verknüpfung noch offen. Mit demselben Original wieder aufnehmen.':status==='linked'?'Verknüpftes Original frisch geprüft.':status==='selected'?'Upload noch nicht gestartet.':'Uploadausgang weiterhin unbestätigt.'}));}catch(error){setMessage((error as Error).message);}finally{setWorking(false);}}}>Uploadstatus prüfen</button>{row.ref?<><button disabled={working} onClick={()=>open(row)}>Original frisch laden und ansehen</button><button disabled={working||blocked} onClick={()=>add(row)}>Zum Prüfentwurf hinzufügen</button></>:<label>Dasselbe Original zur Wiederaufnahme auswählen<input type="file" disabled={working||blocked} onChange={e=>{void select(Array.from(e.target.files??[]),row);e.target.value='';}}/></label>}</div>)}</section>
    <section className="panel"><h3>Manueller Prüfplatz</h3>
      <label>Gespeicherten Entwurf öffnen<select disabled={working} value="" onChange={e=>{const value=drafts.find(d=>d.id===e.target.value);if(value)requestDraftNavigation(()=>{setDraft(value);setSaved(JSON.stringify(value));setViewed([]);});}}><option value="">Entwurf auswählen</option>{drafts.map(d=><option key={d.id} value={d.id}>{d.header.number||'Ohne Nummer'} · {d.reviewStatus==='reviewed'?'geprüft':'in Bearbeitung'}</option>)}</select></label>
      <fieldset disabled={working||blocked}>
        {draft.pages.map((page,index)=>{const row=rows.find(r=>r.id===page.documentId);return <div className="panel" key={page.documentId}><strong>{index+1}. {row?.originalName??page.documentId}</strong><p>Dokument verknüpft · Dateiversion dokumentiert</p><details><summary>Technische Angaben</summary><small>Dateiversion: {page.version}</small></details><button disabled={!row} onClick={()=>row&&open(row)}>Original ansehen</button><button disabled={index===0} onClick={()=>reorder(index,-1)}>Nach oben</button><button disabled={index===draft.pages.length-1} onClick={()=>reorder(index,1)}>Nach unten</button><button onClick={()=>setDraft({...draft,pages:draft.pages.filter(p=>p!==page),reviewStatus:'editing'})}>Aus Entwurf lösen</button><label><input type="checkbox" checked={page.originalReviewed} disabled={!viewed.includes(page.documentId)} onChange={e=>setDraft({...draft,reviewStatus:'editing',pages:draft.pages.map(p=>p===page?{...p,originalReviewed:e.target.checked}:p)})}/>Original inhaltlich geprüft</label></div>;})}
        <div className="form-row"><label>Lieferant<select value={draft.header.supplierId} onChange={e=>changeHeader('supplierId',e.target.value)}><option value="">Noch offen</option>{state.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Belegnummer<input maxLength={200} value={draft.header.number} onChange={e=>changeHeader('number',e.target.value)}/></label><label>Datum<input type="date" value={draft.header.date} onChange={e=>changeHeader('date',e.target.value)}/></label><label>Zuordnung<input maxLength={200} value={draft.header.scope} onChange={e=>changeHeader('scope',e.target.value)}/></label><label>Brutto gesamt (€)<input inputMode="decimal" defaultValue={amount(draft.header.grossCents===null?null:draft.header.grossCents/100)} key={`${draft.id}-total`} onInput={e=>e.currentTarget.setCustomValidity('')} onBlur={e=>{try{e.currentTarget.setCustomValidity('');changeHeader('grossCents',parseMoney(e.target.value));}catch(error){e.currentTarget.setCustomValidity((error as Error).message);setMessage((error as Error).message);}}}/></label></div>
        {draft.lines.map((line,index)=>{const change=(key:string,value:unknown)=>setDraft({...draft,reviewStatus:'editing',lines:draft.lines.map(l=>l===line?{...l,[key]:value}:l)});return <div className="panel" key={line.id}><h4>Position {index+1}</h4><label>Bezeichnung<input value={line.description} maxLength={500} onChange={e=>change('description',e.target.value)}/></label><label>Artikel<select value={line.articleId} onChange={e=>change('articleId',e.target.value)}><option value="">Noch nicht zugeordnet</option>{state.articles.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Menge<input inputMode="decimal" defaultValue={amount(line.quantity)} onInput={e=>e.currentTarget.setCustomValidity('')} onBlur={e=>{try{e.currentTarget.setCustomValidity('');change('quantity',parseQuantity(e.target.value));}catch(error){e.currentTarget.setCustomValidity((error as Error).message);setMessage((error as Error).message);}}}/></label><label>Einheit<input value={line.unit} onChange={e=>change('unit',e.target.value)}/></label><label>Positionsbrutto (€)<input inputMode="decimal" defaultValue={amount(line.grossCents===null?null:line.grossCents/100)} onInput={e=>e.currentTarget.setCustomValidity('')} onBlur={e=>{try{e.currentTarget.setCustomValidity('');change('grossCents',parseMoney(e.target.value));}catch(error){e.currentTarget.setCustomValidity((error as Error).message);setMessage((error as Error).message);}}}/></label><button onClick={()=>setDraft({...draft,lines:draft.lines.filter(l=>l!==line),reviewStatus:'editing'})}>Position entfernen</button></div>;})}
        <button disabled={draft.lines.length>=100} onClick={()=>setDraft({...draft,reviewStatus:'editing',lines:[...draft.lines,{id:crypto.randomUUID(),description:'',articleId:'',quantity:null,unit:'',grossCents:null}]})}>Position ergänzen</button>
        <label><input type="checkbox" checked={draft.reviewStatus==='reviewed'} disabled={!draft.pages.length||draft.pages.some(p=>!p.originalReviewed)} onChange={e=>setDraft({...draft,reviewStatus:e.target.checked?'reviewed':'editing'})}/>Angaben mit allen Originalen abgeglichen</label>
        <button className="button primary" disabled={!draft.pages.length} onClick={save}>Prüfentwurf speichern</button>
        <p>Die endgültige Übernahme in eine Rechnung ist noch nicht freigeschaltet.</p>
      </fieldset>
    </section>
    {guard.confirming&&<DiscardChangesDialog onDiscard={guard.confirmDiscard} onKeepEditing={guard.keepEditing}/>}
  </section>;
}
