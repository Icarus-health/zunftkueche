import {useDraftGuard} from '../hooks/useDraftGuard.ts';
import {DiscardChangesDialog} from '../components/DiscardChangesDialog.tsx';
import {useRef,useState} from 'react';
import type {ScreenProps} from '../App.tsx';
import type {DocumentRepository,DocumentRow} from '../data/documents.ts';
import type {ReceiptEdit} from '../ui/receipt-intake-draft.ts';
import {prepareReceiptAcceptance} from '../domain/receipt-draft.ts';
import {DocumentPreview} from '../components/DocumentPreview.tsx';
export default function ReceiptReview({state,documents,rows,edit,canAccept,commit,onAccepted,busy}:Pick<ScreenProps,'state'|'commit'|'busy'>&{documents:DocumentRepository;rows:DocumentRow[];edit:ReceiptEdit;canAccept:boolean;onAccepted:()=>Promise<void>}) {
  const [checked,setChecked]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
  const [preview,setPreview]=useState<{blob:Blob;name:string}|null>(null),[tab,setTab]=useState<'original'|'fields'>('fields');
  const d=edit.draft,accepted=!!d.acceptance;
  const root=useRef<HTMLElement|null>(null);
  const guard=useDraftGuard({dirty:checked&&!accepted,element:root,onDiscard:()=>setChecked(false)});
  async function open(row:DocumentRow){setWorking(true);setError('');try{setPreview({blob:await documents.getOriginal(row.ref!),name:row.originalName});setTab('original');}catch(e){setError((e as Error).message);}finally{setWorking(false);}}
  async function accept(){setWorking(true);setError('');try {
    const payload=await prepareReceiptAcceptance(edit,state,documents,{receipt:checked,fields:checked,originals:checked,prices:'separate',stock:'separate'});
    if(await commit('receipt.draft.accept',payload))await onAccepted();
    else setError('Übernahme nicht bestätigt. Angaben bleiben erhalten; aktuellen Stand prüfen.');
  }catch(e){setError((e as Error).message);}finally{setWorking(false);}}
  return <section className="panel receipt-review" ref={root}><h3>{accepted?'Übernommener Prüfentwurf':'Beleg bewusst übernehmen'}</h3>
    <div className="review-mobile-tabs" role="group" aria-label="Prüfansicht"><button onClick={()=>setTab('original')} aria-pressed={tab==='original'}>Originale</button><button onClick={()=>setTab('fields')} aria-pressed={tab==='fields'}>Geprüfte Angaben</button></div>
    <div className={`review-columns review-tab-${tab}`}><section className="review-original"><h4>Originale</h4>{d.pages.map((page,index)=>{const row=rows.find(r=>r.id===page.documentId);return <button key={page.documentId} disabled={working||busy||!row?.ref} onClick={()=>row&&open(row)}>{index+1}. {row?.originalName??'Original fehlt'}</button>;})}{preview?<DocumentPreview {...preview}/>:<p>Original auswählen und alle enthaltenen Seiten ansehen.</p>}</section>
    <section className="review-fields"><h4>Geprüfte Angaben</h4><dl><dt>Lieferant</dt><dd>{state.suppliers.find(s=>s.id===d.header.supplierId)?.name||'Offen'}</dd><dt>Nummer / Datum</dt><dd>{d.header.number||'Offen'} · {d.header.date||'Offen'}</dd><dt>Zuordnung</dt><dd>{d.header.scope||'Offen'}</dd><dt>Brutto gesamt</dt><dd>{edit.raw.total||'Offen'} €</dd></dl>
    {d.lines.map(line=><div className="panel" key={line.id}><strong>{line.description||'Bezeichnung offen'}</strong><p>{state.articles.find(a=>a.id===line.articleId)?.name||'Artikelzuordnung offen'} · {edit.raw.lines[line.id].quantity||'Menge offen'} {line.unit||'Einheit offen'} · {edit.raw.lines[line.id].grossCents||'Brutto offen'} €</p></div>)}
    {d.textAssist&&<details><summary>Eingefügter Text und Fundstellen</summary><p>Nutzertext · Vollständigkeit und Seitenzuordnung unbekannt · {d.textAssist.parserVersion}</p><pre>{d.textAssist.text}</pre>{d.textAssist.proposals.map(p=><p key={p.field}>{p.field}: {p.value??'offen'} — {p.evidence.map(e=>e.quote).join(' / ')}</p>)}</details>}</section></div>
    <p>Diese Übernahme erfasst ausschließlich den Beleg. Artikelpreise und Wareneingänge werden separat geprüft und gebucht. Fehlende Angaben bleiben offen; Positionsbrutto wird nicht als Netto übernommen.</p>
    {accepted?<p role="status">Beleg übernommen. Änderungen erfolgen über „Beleg berichtigen“; dieser Prüfstand bleibt erhalten.</p>:<><label className="checkbox-label"><input type="checkbox" checked={checked} disabled={!canAccept||working||busy} onChange={e=>setChecked(e.target.checked)}/>Ich habe alle Originale, Angaben, offenen Werte und Artikelzuordnungen geprüft und möchte den Beleg übernehmen.</label><button className="button primary" disabled={!canAccept||!checked||working||busy} onClick={accept}>Geprüften Beleg übernehmen</button>{!canAccept&&<p>Zuerst Originale prüfen und den geprüften Entwurf speichern.</p>}</>}
    {working&&<p role="status">Originalfassungen werden geprüft / Übernahme wird bestätigt …</p>}{error&&<p role="alert">{error}</p>}
    {guard.confirming&&<DiscardChangesDialog onDiscard={guard.confirmDiscard} onKeepEditing={guard.keepEditing}/>}
  </section>;
}
