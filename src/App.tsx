import {useEffect,useState} from 'react';
import {ChefHat,House,ForkKnife,ClipboardText,Truck,Receipt,ChartBar,ArrowClockwise,CheckCircle,WarningCircle} from '@phosphor-icons/react';
import type {KitchenState} from './domain/state.ts';
import {getRepository} from './data/repository.ts';
import {SaveController} from './data/save-controller.ts';
import type {SaveStatus} from './data/save-controller.ts';
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
 const [refreshing,setRefreshing]=useState(false),[loadError,setLoadError]=useState('');
 const [saveStatus,setSaveStatus]=useState<SaveStatus>({busy:false,pending:null,error:'',message:''});
 const [controller]=useState(()=>new SaveController(getRepository,setState,setSaveStatus));
 const {pending,message}=saveStatus, busy=saveStatus.busy||refreshing, error=saveStatus.error||loadError;
 useEffect(()=>{try{getRepository().load().then(setState).catch(e=>setLoadError(e.message));}catch(e){setLoadError((e as Error).message);}},[]);
 useEffect(()=>{if(!pending)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[pending]);
 async function commit(type:string,payload:unknown){if(!state||refreshing)return false;return controller.save({id:crypto.randomUUID(),baseRevision:state.revision??0,type,payload});}
 function go(target:Screen,supplierId?:string){if(supplierId)setSupplier(supplierId);setScreen(target);controller.clearNotice();setLoadError('');}
 async function refresh(){if(controller.status.pending)return;setRefreshing(true);try{setState(await getRepository().load());setLoadError('');controller.clearNotice();}catch(e){setLoadError((e as Error).message);}finally{setRefreshing(false);}}
 if(!state)return <div className="loading-shell"><ChefHat size={42}/><h1>Zunftküche</h1><p>{error||'Deine Küche wird geladen …'}</p></div>;
 const props={state,busy:busy||Boolean(pending),commit,go};
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><ChefHat size={34} weight="regular"/><strong>Zunftküche</strong></div><nav aria-label="Küchenverwaltung">{nav.map(([name,Icon])=><button key={name} className={screen===name?'nav-item active':'nav-item'} title={name} aria-current={screen===name?'page':undefined} onClick={()=>go(name)}><Icon size={23}/>{name}</button>)}</nav><div className="sidebar-footer"><span>Küche Zunftabend</span><small>Schelmenzunft Staufen</small></div></aside>
 <div className="main-shell"><div className="local-banner"><span>Lokale Arbeitsversion · Microsoft- und Teams-Anbindung stehen noch aus.</span></div><div className="context-bar"><span className="event-label">{state.event.name} {state.event.year}</span><div className="context-right"><span className="draft-badge">Datenstand 2026</span><button className="icon-button" aria-label="Daten neu laden" disabled={busy||Boolean(pending)} onClick={refresh}><ArrowClockwise size={21}/></button></div></div>
 <main>{error&&<div className="alert" role="alert"><WarningCircle size={23}/><div>{error}{pending&&<button className="button secondary small" disabled={busy} onClick={()=>controller.retry()}>Erneut übertragen</button>}</div></div>}{message&&<div className="save-status" role="status"><CheckCircle size={17}/>{message}</div>}
 {screen==='Übersicht'&&<Home {...props}/>}{screen==='Planung'&&<Planning {...props}/>}{screen==='Bestellungen'&&<Orders {...props} initialSupplier={supplier}/>}{screen==='Lieferungen'&&<Deliveries {...props}/>}{screen==='Belege'&&<Receipts {...props}/>}{screen==='Auswertung'&&<Analysis {...props}/>}
 </main></div></div>;
}
