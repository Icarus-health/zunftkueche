import ReceiptReview from './ReceiptReview.tsx';
import {suppliedText} from '../ocr/receipt-parser.ts';
import {useEffect,useRef,useState} from 'react';
import type {ScreenProps} from '../App.tsx';
import {DOCUMENT_LIMITS,validateOriginal} from '../data/documents.ts';
import type {DocumentRepository,DocumentRow,ExtractDraft} from '../data/documents.ts';
import {DocumentPreview} from '../components/DocumentPreview.tsx';
import {requestDraftNavigation,useDraftGuard} from '../hooks/useDraftGuard.ts';
import {DiscardChangesDialog} from '../components/DiscardChangesDialog.tsx';
import {createReceiptEdit,parseReceiptEdit,receiptEditDirty,replaceReceiptDraft} from '../ui/receipt-intake-draft.ts';

export default function ReceiptIntake({state,documents:repo,readOnly,onClose,commit,busy}:ScreenProps&{documents:DocumentRepository;onClose:()=>void}) {
  const closed=state.event.status==='Abgeschlossen';

  const fresh=():ExtractDraft=>({
    schemaVersion:1,id:crypto.randomUUID(),eventId:state.event.id,
    source:'manual',parserVersion:null,modelVersion:null,promptVersion:null,
    reviewStatus:'editing',pages:[],lines:[],
    header:{supplierId:'',number:'',date:'',scope:'',grossCents:null},
  });
  const [edit,setEdit]=useState(()=>createReceiptEdit(fresh()));
  const {draft,raw}=edit;
  const blocked=readOnly||closed||!!draft.acceptance;
  const [helperText,setHelperText]=useState('');
  const [saved,setSaved]=useState(()=>JSON.stringify(edit));
  function setDraft(next:ExtractDraft|((current:ExtractDraft)=>ExtractDraft)) {
    setEdit(current=>replaceReceiptDraft(current,typeof next==='function'?next(current.draft):next));
  }
  function resetDraft(value:ExtractDraft) {
    const next=createReceiptEdit(value);
    setEdit(next);
    setSaved(JSON.stringify(next));
    setViewed([]);
    setHelperText(value.textAssist?.text??'');
  }
  function changeRaw(value:string,lineId?:string,field:'quantity'|'grossCents'='grossCents') {
    setEdit(current=>({
      draft:{...current.draft,reviewStatus:'editing'},
      raw:lineId
        ? {...current.raw,lines:{...current.raw.lines,[lineId]:{...current.raw.lines[lineId],[field]:value}}}
        : {...current.raw,total:value},
    }));
  }
  const [rows,setRows]=useState<DocumentRow[]>([]),[drafts,setDrafts]=useState<ExtractDraft[]>([]);
  const [queue,setQueue]=useState<Array<{uploadId:string;file:File}>>([]),[preview,setPreview]=useState<{blob:Blob;name:string;documentId?:string}|null>(null);
  const [operation,setOperation]=useState<'upload'|'save'|'open'|'status'|null>(null);
  const working=operation!==null;
  const [message,setMessage]=useState(''),[step,setStep]=useState(0);
  const [viewed,setViewed]=useState<string[]>([]);
  const [uploadStatuses,setUploadStatuses]=useState<Record<string,string>>({});
  const root=useRef<HTMLElement|null>(null);
  const abort=useRef<AbortController|null>(null);
  const guard=useDraftGuard({
    dirty:receiptEditDirty(edit,saved,queue.length),
    element:root,
    onDiscard:()=>{abort.current?.abort();setQueue([]);resetDraft(fresh());},
  });
  async function refresh() {
    const inventory=await repo.list();
    setRows(inventory.documents.filter(row=>row.eventId===state.event.id));
    setDrafts(inventory.drafts.filter(row=>row.eventId===state.event.id));
    return inventory;
  }
  useEffect(()=>{
    void refresh().catch(error=>setMessage(error.message));
    return ()=>abort.current?.abort();
  },[repo,state.event.id]);
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
    setOperation('upload');
    setMessage('');
    setStep(0);
    abort.current=new AbortController();
    try {
      const pages=[...draft.pages];
      for(const [index,entry] of queue.entries()) {
        await repo.upload({...entry,eventId:state.event.id,signal:abort.current.signal});
        const inventory=await refresh();
        const row=inventory.documents.find(row=>row.uploadId===entry.uploadId)!;
        if(!pages.some(page=>page.documentId===row.id))pages.push({
          documentId:row.id,documentRowVersion:row.rowVersion,
          version:row.ref!.version,sha256:row.sha256,originalReviewed:false,
        });
        setDraft(current=>({...current,pages:[...pages],reviewStatus:'editing'}));
        setStep(index+1);
        setQueue(current=>current.filter(item=>item.uploadId!==entry.uploadId));
      }
      setMessage('Originale verknüpft. Bitte jedes Original öffnen, prüfen und die Angaben erfassen.');
    } catch(error) {
      setMessage((error as Error).message);
      await refresh().catch(()=>{});
    } finally {
      abort.current=null;
      setOperation(null);
    }
  }
  async function open(row:DocumentRow) {
    if(!row.ref)return;
    setOperation('open');
    setMessage('');
    try {
      const blob=await repo.getOriginal(row.ref);
      setPreview({blob,name:row.originalName,documentId:row.id});
      setViewed(values=>[...new Set([...values,row.id])]);
    } catch(error) {
      setMessage((error as Error).message);
    } finally {
      setOperation(null);
    }
  }
  function add(row:DocumentRow) {
    if(!row.ref||draft.pages.some(p=>p.documentId===row.id))return;
    if(draft.pages.length>=10||row.size+draft.pages.reduce((sum,page)=>sum+(rows.find(row=>row.id===page.documentId)?.size??0),0)>DOCUMENT_LIMITS.maxTotalBytes){setMessage('Höchstens zehn Originale und 20 MiB pro Entwurf.');return;}
    setDraft({...draft,reviewStatus:'editing',pages:[...draft.pages,{documentId:row.id,documentRowVersion:row.rowVersion,version:row.ref.version,sha256:row.sha256,originalReviewed:false}]});
  }
  function reorder(index:number,direction:number) {
    const pages=[...draft.pages],other=index+direction;
    if(other<0||other>=pages.length)return;
    [pages[index],pages[other]]=[pages[other],pages[index]];
    setDraft({...draft,pages,reviewStatus:'editing'});
  }
  async function save() {
    setOperation('save');
    setMessage('');
    try {
      const parsed=parseReceiptEdit(edit);
      // Fresh external reads before saving preserve the distinction from Dataverse RowVersion.
      for(const page of draft.pages) {
        const row=rows.find(row=>row.id===page.documentId);
        if(!row?.ref)throw new Error('Originalzuordnung fehlt.');
        await repo.getOriginal(row.ref);
      }
      const result=await repo.saveDraft(parsed);
      resetDraft(result);
      await refresh();
      setMessage('Manueller Prüfentwurf gespeichert. Noch keine Rechnung übernommen und keine Bestandsbuchung ausgelöst.');
    } catch(error) {
      setMessage((error as Error).message);
    } finally {
      setOperation(null);
    }
  }
  const changeHeader=(key:keyof ExtractDraft['header'],value:string|number|null)=>setDraft({...draft,reviewStatus:'editing',header:{...draft.header,[key]:value}});
  async function checkStatus(row:DocumentRow) {
    setOperation('status');
    try {
      const status=await repo.loadUpload(row.uploadId);
      const label=status==='uploaded-unlinked'
        ? 'Original gespeichert, Verknüpfung noch offen. Mit demselben Original wieder aufnehmen.'
        : status==='linked' ? 'Verknüpftes Original frisch geprüft.'
        : status==='selected' ? 'Upload noch nicht gestartet.' : 'Uploadausgang weiterhin unbestätigt.';
      setUploadStatuses(current=>({...current,[row.id]:label}));
    } catch(error) {
      setMessage((error as Error).message);
    } finally {
      setOperation(null);
    }
  }
  function changeLine(id:string,key:keyof ExtractDraft['lines'][number],value:string) {
    setDraft(current=>({...current,reviewStatus:'editing',lines:current.lines.map(line=>
      line.id===id ? {...line,[key]:value} : line,
    )}));
  }
  function addLine() {
    setDraft(current=>({...current,reviewStatus:'editing',lines:[...current.lines,{
      id:crypto.randomUUID(),description:'',articleId:'',quantity:null,unit:'',grossCents:null,
    }]}));
  }
  return <section className="receipt-intake" ref={root}>
    <div className="toolbar">
      <h2>Foto / PDF erfassen</h2>
      <button className="button secondary" disabled={working} onClick={onClose}>Zurück zu Belegen</button>
    </div>
    {closed && <p role="status">
      Diese Veranstaltung ist abgeschlossen. Originale und Entwürfe bleiben lesbar; neue Uploads und Änderungen
      sind gesperrt. Erst nach begründeter Wiederöffnung kann weiter erfasst werden.
    </p>}
    <p>Manuelle Erfassung · keine automatische Erkennung aktiv. Originale liegen in SharePoint;
      der Prüfentwurf bleibt getrennt von den Küchenbuchungen.</p>
    <p>Vorläufige Schutzgrenzen: JPEG, PNG oder PDF; 5 MiB je Original, Bilder höchstens 24 Millionen Pixel
      und 8192 Pixel Kantenlänge, höchstens 10 geordnete Originale und 20 MiB pro Entwurf.
      Die Gerätegrenzen sind noch in der echten App zu prüfen. Ein PDF wird vollständig aufbewahrt;
      keine Seiten werden abgeschnitten.</p>

    <fieldset disabled={working||blocked}>
      <label>Foto aufnehmen
        <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={event=>{
          void select(Array.from(event.target.files??[]));event.target.value='';
        }}/>
      </label>
      <label>Dateien auswählen
        <input type="file" accept="image/jpeg,image/png,application/pdf,.heic,.heif" multiple onChange={event=>{
          void select(Array.from(event.target.files??[]));event.target.value='';
        }}/>
      </label>
      <p>HEIC bitte vorab als JPEG/PNG exportieren oder die Kamera auf ein kompatibles Format stellen.</p>
      {queue.map((entry,index)=><div key={entry.uploadId} className="panel">
        <span>{index+1}. {entry.file.name} · {(entry.file.size/1024).toFixed(0)} KiB</span>
        <button type="button" onClick={()=>setPreview({blob:entry.file,name:entry.file.name})}>Vorschau</button>
        <button type="button" onClick={()=>setQueue(queue.filter(item=>item!==entry))}>
          Aus Auswahl entfernen / neu aufnehmen
        </button>
        <details><summary>Technische Angaben</summary><small>Upload-ID: {entry.uploadId}</small></details>
      </div>)}
      <button className="button primary" disabled={!queue.length} onClick={upload}>Originale hochladen</button>
    </fieldset>
    {working && <p role="status">Verbindung wird geprüft / Vorgang läuft …</p>}
    {operation==='upload' && <div role="status">
      <p>{step} Originale abgeschlossen.</p>
      <progress aria-label="Abgeschlossene Originale" value={step} max={step+queue.length||1}/>
      <button onClick={()=>abort.current?.abort()}>Nach aktuellem Schritt abbrechen</button>
      <p>Ein gestarteter Dienstaufruf lässt sich hier nicht sicher stoppen. Gespeicherte Originale bleiben erhalten.</p>
    </div>}
    {message && <p role="status">{message}</p>}
    {preview && <DocumentPreview blob={preview.blob} name={preview.name}/>}

    <section className="panel">
      <h3>Gespeicherte Originale und offene Uploads</h3>
      {rows.map(row=><div className="panel" key={row.id}>
        <strong>{row.originalName}</strong>
        <p>{row.status==='linked' ? 'Dokument verknüpft'
          : row.status==='selected' ? 'Ausgewählt; Upload noch nicht gestartet'
          : 'Uploadausgang prüfen / wieder aufnehmen'}</p>
        <details><summary>Technische Angaben</summary><small>Upload-ID: {row.uploadId}</small></details>
        {uploadStatuses[row.id] && <p>{uploadStatuses[row.id]}</p>}
        <button disabled={working} onClick={()=>checkStatus(row)}>Uploadstatus prüfen</button>
        {row.ref ? <>
          <button disabled={working} onClick={()=>open(row)}>Original frisch laden und ansehen</button>
          <button disabled={working||blocked} onClick={()=>add(row)}>Zum Prüfentwurf hinzufügen</button>
        </> : <label>Dasselbe Original zur Wiederaufnahme auswählen
          <input type="file" disabled={working||blocked} onChange={event=>{
            void select(Array.from(event.target.files??[]),row);event.target.value='';
          }}/>
        </label>}
      </div>)}
    </section>

    <section className="panel">
      <h3>Manueller Prüfplatz</h3>
      <button disabled={working||busy} onClick={()=>requestDraftNavigation(()=>resetDraft(fresh()))}>Neuen Prüfentwurf beginnen</button>
      <label>Gespeicherten Entwurf öffnen
        <select disabled={working} value="" onChange={event=>{
          const value=drafts.find(draft=>draft.id===event.target.value);
          if(value)requestDraftNavigation(()=>resetDraft(value));
        }}>
          <option value="">Entwurf auswählen</option>
          {drafts.map(draft=><option key={draft.id} value={draft.id}>
            {draft.header.number||'Ohne Nummer'} · {draft.reviewStatus==='accepted'?'übernommen':draft.reviewStatus==='reviewed'?'geprüft':'in Bearbeitung'}
          </option>)}
        </select>
      </label>
      <fieldset disabled={working||blocked||busy}>
        <details><summary>Text freiwillig als Vorschlagshilfe einfügen</summary>
          <p>Hier eingefügter Text wird lokal ausgewertet. Das ist keine automatische PDF-/Fotoerkennung. Herkunft, Seitenzuordnung und Vollständigkeit des Textes sind nicht verifiziert. Jeder Vorschlag muss am Original geprüft werden.</p>
          <label>Belegtext<textarea maxLength={16000} value={helperText} onChange={e=>{setHelperText(e.target.value);setDraft({...draft,reviewStatus:'editing',textAssist:{origin:'user-supplied',completeness:'unknown',parserVersion:'receipt-hints-v1',text:e.target.value,proposals:[]}});}}/></label>
          <button onClick={()=>{try{setDraft({...draft,reviewStatus:'editing',textAssist:suppliedText(helperText,state.suppliers)});}catch(e){setMessage((e as Error).message);}}}>Text lokal auswerten</button>
          {draft.textAssist?.proposals.map(p=><div key={p.field}><p>{({supplierId:'Lieferant',number:'Belegnummer',date:'Datum',grossCents:'Brutto gesamt'})[p.field]}: {p.value??'Offen / mehrdeutig'} · {p.evidence.map(e=>e.quote).join(' / ')}</p><button disabled={p.value===null} onClick={()=>{if(p.value===null)return;if(p.field==='grossCents'){const cents=Number(p.value);if(cents<0){setMessage('Gutschrift / negativer Betrag: separate wirtschaftliche Prüfung erforderlich; keine automatische Übernahme.');return;}changeRaw((cents/100).toFixed(2).replace('.',','));}else changeHeader(p.field,p.value);}}>Diesen Vorschlag ins Feld übernehmen</button></div>)}
        </details>
        {draft.pages.map((page,index)=>{
          const row=rows.find(row=>row.id===page.documentId);
          return <div className="panel" key={page.documentId}>
            <strong>{index+1}. {row?.originalName??page.documentId}</strong>
            <p>Dokument verknüpft · Dateiversion dokumentiert</p>
            <details><summary>Technische Angaben</summary><small>Dateiversion: {page.version}</small></details>
            <button disabled={!row} onClick={()=>row&&open(row)}>Original ansehen</button>
            <button disabled={index===0} onClick={()=>reorder(index,-1)}>Nach oben</button>
            <button disabled={index===draft.pages.length-1} onClick={()=>reorder(index,1)}>Nach unten</button>
            <button onClick={()=>setDraft({...draft,pages:draft.pages.filter(item=>item!==page),reviewStatus:'editing'})}>
              Aus Entwurf lösen
            </button>
            <label>
              <input type="checkbox" checked={page.originalReviewed} disabled={!viewed.includes(page.documentId)}
                onChange={event=>setDraft({...draft,reviewStatus:'editing',pages:draft.pages.map(item=>
                  item===page ? {...item,originalReviewed:event.target.checked} : item,
                )})}/>
              Original inhaltlich geprüft
            </label>
          </div>;
        })}
        <div className="form-row">
          <label>Lieferant
            <select value={draft.header.supplierId} onChange={event=>changeHeader('supplierId',event.target.value)}>
              <option value="">Noch offen</option>
              {state.suppliers.map(supplier=><option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label>Belegnummer
            <input maxLength={200} value={draft.header.number} onChange={event=>changeHeader('number',event.target.value)}/>
          </label>
          <label>Datum
            <input type="date" value={draft.header.date} onChange={event=>changeHeader('date',event.target.value)}/>
          </label>
          <label>Zuordnung
            <input maxLength={200} value={draft.header.scope} onChange={event=>changeHeader('scope',event.target.value)}/>
          </label>
          <label>Brutto gesamt (€)
            <input inputMode="decimal" value={raw.total} onChange={event=>changeRaw(event.target.value)}/>
          </label>
        </div>
        {draft.lines.map((line,index)=><div className="panel" key={line.id}>
          <h4>Position {index+1}</h4>
          <label>Bezeichnung
            <input value={line.description} maxLength={500} onChange={event=>changeLine(line.id,'description',event.target.value)}/>
          </label>
          <label>Artikel
            <select value={line.articleId} onChange={event=>changeLine(line.id,'articleId',event.target.value)}>
              <option value="">Noch nicht zugeordnet</option>
              {state.articles.map(article=><option key={article.id} value={article.id}>{article.name}</option>)}
            </select>
          </label>
          <label>Menge
            <input inputMode="decimal" value={raw.lines[line.id].quantity}
              onChange={event=>changeRaw(event.target.value,line.id,'quantity')}/>
          </label>
          <label>Einheit
            <input value={line.unit} onChange={event=>changeLine(line.id,'unit',event.target.value)}/>
          </label>
          <label>Positionsbrutto (€)
            <input inputMode="decimal" value={raw.lines[line.id].grossCents}
              onChange={event=>changeRaw(event.target.value,line.id,'grossCents')}/>
          </label>
          <button onClick={()=>setDraft({...draft,lines:draft.lines.filter(item=>item!==line),reviewStatus:'editing'})}>
            Position entfernen
          </button>
        </div>)}
        <button disabled={draft.lines.length>=100} onClick={addLine}>Position ergänzen</button>
        <label>
          <input type="checkbox" checked={draft.reviewStatus==='reviewed'}
            disabled={!draft.pages.length||draft.pages.some(page=>!page.originalReviewed)}
            onChange={event=>setDraft({...draft,reviewStatus:event.target.checked?'reviewed':'editing'})}/>
          Angaben mit allen Originalen abgeglichen
        </label>
        <button className="button primary" disabled={!draft.pages.length} onClick={save}>Prüfentwurf speichern</button>

      </fieldset>
    </section>
    <ReceiptReview key={`${draft.id}:${draft.rowVersion??'new'}`} state={state} documents={repo} rows={rows} edit={edit}
      busy={working||busy} commit={commit} canAccept={!blocked&&!receiptEditDirty(edit,saved,queue.length)&&draft.reviewStatus==='reviewed'&&!!draft.rowVersion}
      onAccepted={async()=>{const inventory=await refresh();const accepted=inventory.drafts.find(d=>d.id===draft.id);if(accepted)resetDraft(accepted);setMessage('Belegübernahme bestätigt. Preise und Bestände werden separat bearbeitet.');}}/>
    {guard.confirming && <DiscardChangesDialog onDiscard={guard.confirmDiscard} onKeepEditing={guard.keepEditing}/>}
  </section>;
}
