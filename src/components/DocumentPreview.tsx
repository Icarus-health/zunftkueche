import { useEffect, useState } from 'react';
/** Local object URLs are revoked. Original bytes are never converted or overwritten. */
export function DocumentPreview({blob,name,onViewed}:{blob:Blob;name:string;onViewed?:()=>void}) {
  const [url,setUrl]=useState('');
  const [failed,setFailed]=useState(false);
  useEffect(()=>{const value=URL.createObjectURL(blob);setUrl(value);setFailed(false);return()=>URL.revokeObjectURL(value);},[blob]);
  if(!url)return <p>Vorschau wird vorbereitet …</p>;
  return <div className="document-preview">
    {blob.type==='application/pdf'
      ? <><object data={url} type="application/pdf" aria-label={name}><p>PDF-Vorschau hier nicht verfügbar. Das vollständige Original unten öffnen.</p></object><p>PDF bleibt vollständig. Die Seitenzahl wird hier nicht automatisch ermittelt.</p></>
      : <img src={url} alt={`Originalvorschau ${name}`} onError={()=>setFailed(true)}/>}
    {failed&&<p role="alert">Bild kann nicht angezeigt werden. Bitte das Original herunterladen oder erneut als JPEG/PNG exportieren. Es wird keine leere Seite übernommen.</p>}
    <a download={name} href={url}>Original herunterladen</a>
    <a className="button secondary" href={url} target="_blank" rel="noreferrer" onClick={onViewed}>Original öffnen</a>
  </div>;
}
