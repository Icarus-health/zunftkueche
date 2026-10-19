import {BackupPanel} from '../components/BackupPanel.tsx';
import type {OriginalBackup} from '../data/backup.ts';
import {activeLocations,purchasingLocation} from "../domain/locations.ts";
import {useState} from 'react';
import type {ScreenProps} from '../App.tsx';
import type {UserPreferences} from '../data/preferences.ts';
import {startScreens} from '../data/preferences.ts';
import {deliveryDays} from '../ui/facts.ts';
import {useDraftGuard} from '../hooks/useDraftGuard.ts';
import {DiscardChangesDialog} from '../components/DiscardChangesDialog.tsx';
export default function Settings({state,busy,commit,saveError,mode,preferences,onPreferences,canConfigure,canClose,storageBytes,onBackup}:ScreenProps & {preferences:UserPreferences;onPreferences:(value:UserPreferences)=>void;canConfigure:boolean;canClose:boolean;storageBytes:number;onBackup:(originals:OriginalBackup[])=>Promise<string[]>}) {
 const initial={name:state.event.name,year:state.event.year,dates:{...state.event.dates},deliveryAddress:state.event.deliveryAddress??'',contact:state.event.contact??'',locations:state.event.locations??activeLocations(state).map(name=>({name,historicalNames:[]})),purchasingLocation:purchasingLocation(state)};
 const [draft,setDraft]=useState(initial),[error,setError]=useState('');
 const guard=useDraftGuard({dirty:JSON.stringify(draft)!==JSON.stringify(initial),onDiscard:()=>setDraft(initial)});
 const historical=[...new Set([...state.planLines.map(l=>l.location),...state.movements.map(l=>l.location),...state.invoices.map(l=>l.scope)].filter((v):v is string=>!!v))].sort();
 return <section><h1>Einstellungen</h1>
 <section className="panel"><h2>Persönlich</h2><p>{mode === "microsoft" ? "Diese Auswahl gilt nur für dein bestätigtes Microsoft-Konto in dieser Umgebung." : "In der lokalen Arbeitsversion gilt diese Auswahl nur für die aktuelle Sitzung; es ist kein Microsoft-Konto bestätigt."}</p>
 <label>Startansicht<select value={preferences.startScreen} onChange={e=>onPreferences({...preferences,startScreen:e.target.value})}>{startScreens.map(s=><option key={s}>{s}</option>)}</select></label>
 <label>Darstellung<select value={preferences.displayDensity} onChange={e=>onPreferences({...preferences,displayDensity:e.target.value as UserPreferences['displayDensity']})}><option value="comfortable">Großzügig</option><option value="compact">Kompakt</option></select></label></section>
 <section className="panel"><h2>Veranstaltung</h2><p>{canConfigure?'Du kannst diese Veranstaltung konfigurieren.':'Die Veranstaltungsverwaltung ist dem Eigentümer des Arbeitsbereichs vorbehalten.'}</p>
 <form onSubmit={async e=>{e.preventDefault();setError('');try {if(await commit('event.settings',draft))setDraft({...draft});}catch(e){setError((e as Error).message);}}}><fieldset disabled={busy||!canConfigure}>
 <label>Name<input required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
 <label>Jahr<input required type="number" min={1900} max={2200} value={draft.year} onChange={e=>setDraft({...draft,year:Number(e.target.value)})}/></label>
 <div className="form-row">{deliveryDays.map(day=><label key={day}>{day}<input type="date" value={draft.dates[day]??''} onChange={e=>setDraft({...draft,dates:{...draft.dates,[day]:e.target.value||null}})}/><small>Ohne Angabe: Termin offen</small></label>)}</div>
 <label>Lieferadresse<textarea maxLength={1000} value={draft.deliveryAddress} onChange={e=>setDraft({...draft,deliveryAddress:e.target.value})}/></label>
 <label>Ansprechpartner<input maxLength={200} value={draft.contact} onChange={e=>setDraft({...draft,contact:e.target.value})}/></label>
 <h3>Aktive Orte und historische Zuordnung</h3><p>Historische Angaben bleiben unverändert. Ordne einen alten Namen erst nach Bestätigung einem aktiven Ort zu.</p>
 {draft.locations.map((location,index)=><div key={index} className="panel"><label>Aktiver Ort<input required maxLength={100} value={location.name} onChange={e=>setDraft({...draft,locations:draft.locations.map((l,i)=>i===index?{...l,name:e.target.value}:l),purchasingLocation:draft.purchasingLocation===location.name?e.target.value:draft.purchasingLocation})}/></label>{historical.map(name=><label className="checkbox-label" key={name}><input type="checkbox" checked={location.historicalNames.includes(name)} onChange={e=>setDraft({...draft,locations:draft.locations.map((l,i)=>i===index?{...l,historicalNames:e.target.checked?[...l.historicalNames,name]:l.historicalNames.filter(n=>n!==name)}:l)})}/>{name} bestätigt zugeordnet</label>)}<button type="button" className="button secondary" onClick={()=>setDraft({...draft,locations:draft.locations.filter((_,i)=>i!==index),purchasingLocation:draft.purchasingLocation===location.name?null:draft.purchasingLocation})}>Aktiven Ort entfernen</button></div>)}
 <button type="button" className="button secondary" onClick={()=>setDraft({...draft,locations:[...draft.locations,{name:'',historicalNames:[]}]})}>Ort ergänzen</button>
 <label>Ort für Küchenplanung und Einkaufsbedarf<select value={draft.purchasingLocation??''} onChange={e=>setDraft({...draft,purchasingLocation:e.target.value||null})}><option value="">Noch nicht festgelegt</option>{draft.locations.filter(l=>l.name).map(l=><option key={l.name}>{l.name}</option>)}</select></label>
 <p>Nur dieser Ort und seine bestätigten historischen Namen zählen für Küchenbestand und Einkaufsdeckung. Ohne aktive Orte sind neue Ortsbuchungen gesperrt; historische Angaben bleiben lesbar.</p>
 <p>Historisch vorhanden: {historical.join(' · ')||'keine Angaben'}</p>
 <button className="button primary" type="submit">Veranstaltung speichern</button></fieldset>{(error||saveError)&&<p role="alert">{error||saveError}</p>}</form></section>
 <section className="panel"><h2>Verwaltung</h2><p>Arbeitsdaten: {(storageBytes/1024).toLocaleString('de-DE',{maximumFractionDigits:1})} von 512 KiB belegt.</p><progress max={524288} value={storageBytes} aria-label="Speicherbelegung"/><p>Veranstaltungsabschluss: {canClose?'Berechtigung bestätigt':'keine bestätigte Berechtigung'}.</p><p>Vorgesehene Dokumentenablage: Vereins-Team · Allgemein / Zunftküche / Rechnungen. Die eigene Microsoft-Verbindung und das Zugriffsrecht werden beim Öffnen des Belegeingangs geprüft; auf dieser Seite wird der Verbindungsstatus nicht geprüft.</p><p>Automatische Belegerkennung: deaktiviert. Manuelle Prüfentwürfe bleiben getrennt von Küchenbuchungen.</p></section>
 <BackupPanel state={state} busy={busy} canConfigure={canConfigure} canClose={canClose} onBackup={onBackup}/>

 {guard.confirming&&<DiscardChangesDialog onDiscard={guard.confirmDiscard} onKeepEditing={guard.keepEditing}/>}</section>;
}
