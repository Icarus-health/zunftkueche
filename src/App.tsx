import {useEffect,useState} from 'react';
import {ChefHat,House,ForkKnife,ClipboardText,Truck,Receipt,ChartBar,ArrowClockwise,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import type {KitchenState,Operation} from './domain/state.ts';
import {getRepository,RejectedError} from './data/repository.ts';
import Home from './screens/Home.tsx';
import Planning from './screens/Planning.tsx';
import Orders from './screens/Orders.tsx';
import Deliveries from './screens/Deliveries.tsx';
import Receipts from './screens/Receipts.tsx';
import Analysis from './screens/Analysis.tsx';
export type Screen='Übersicht'|'Planung'|'Bestellungen'|'Lieferungen'|'Belege'|'Auswertung';
export interface ScreenProps{state:KitchenState;busy:boolean;commit:(type:string,payload:unknown)=>Promise<boolean>;go:(screen:Screen,supplier?:string)=>void}
const nav=[['Übersicht',House],['Planung',ForkKnife],['Bestellungen',ClipboardText],['Lieferungen',Truck],['Belege',Receipt],['Auswertung',ChartBar]] as const;
export default function App(){
 const [state,setState]=useState<KitchenState|null>(null),[screen,setScreen]=useState<Screen>('Übersicht'),[supplier,setSupplier]=useState('s-wiggenhauser');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState<Operation|null>(null);
 useEffect(()=>{try{getRepository().load().then(setState).catch(e=>setError(e.message));}catch(e){setError((e as Error).message);}},[]);
 useEffect(()=>{if(!pending)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[pending]);
 async function send(op:Operation){setBusy(true);setError('');setMessage('Wird gespeichert …');try{const result=await getRepository().commit(op);setState(result.state);setPending(null);if(result.status==='conflict'){setError('Die Daten wurden inzwischen geändert. Der aktuelle Stand wurde geladen. Bitte prüfe deine Eingabe und speichere erneut.');setMessage('Änderung nicht übernommen');return false;}setMessage('Lokal gespeichert');return true;}catch(e){const rejected=e instanceof RejectedError;setPending(rejected?null:op);setError(rejected?(e as Error).message:`Speicherung nicht bestätigt: ${(e as Error).message}`);setMessage(rejected?'Eingabe nicht übernommen':'Änderung noch offen');return false;}finally{setBusy(false);}}
 async function commit(type:string,payload:unknown){if(!state||busy||pending)return false;return send({id:crypto.randomUUID(),baseRevision:state.revision??0,type,payload});}
 function go(target:Screen,supplierId?:string){if(supplierId)setSupplier(supplierId);setScreen(target);setError('');setMessage('');}
 async function refresh(){setBusy(true);try{setState(await getRepository().load());setMessage('Aktueller Stand geladen');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!state)return <div className="loading-shell"><ChefHat size={42}/><h1>Zunftküche</h1><p>{error||'Deine Küche wird geladen …'}</p></div>;
 const props={state,busy:busy||Boolean(pending),commit,go};
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><ChefHat size={34} weight="regular"/><strong>Zunftküche</strong></div><nav aria-label="Küchenverwaltung">{nav.map(([name,Icon])=><button key={name} className={screen===name?'nav-item active':'nav-item'} aria-current={screen===name?'page':undefined} onClick={()=>go(name)}><Icon size={23}/>{name}</button>)}</nav><div className="sidebar-footer"><span>Küche Zunftabend</span><small>Schelmenzunft Staufen</small></div></aside>
 <div className="main-shell"><div className="local-banner"><span>Lokale Arbeitsversion · Microsoft- und Teams-Anbindung stehen noch aus.</span></div><div className="context-bar"><span className="event-label">{state.event.name} {state.event.year}</span><div className="context-right"><span className="draft-badge">Datenstand 2026</span><button className="icon-button" aria-label="Daten neu laden" disabled={busy||Boolean(pending)} onClick={refresh}><ArrowClockwise size={21}/></button></div></div>
 <main>{error&&<div className="alert" role="alert"><WarningCircle size={23}/><div>{error}{pending&&<button className="button secondary small" disabled={busy} onClick={()=>send(pending)}>Erneut übertragen</button>}</div></div>}{message&&<div className="save-status" role="status"><CheckCircle size={17}/>{message}</div>}
 {screen==='Übersicht'&&<Home {...props}/>}{screen==='Planung'&&<Planning {...props}/>}{screen==='Bestellungen'&&<Orders {...props} initialSupplier={supplier}/>}{screen==='Lieferungen'&&<Deliveries {...props}/>}{screen==='Belege'&&<Receipts {...props}/>}{screen==='Auswertung'&&<Analysis {...props}/>}
 </main></div></div>;
}
