import {useEffect,useRef,useState} from 'react';
import {X,ArrowRight,WarningCircle} from '@phosphor-icons/react';
import {parseQuantity} from '../domain/kitchen.ts';
import type {Source} from '../domain/kitchen.ts';
import {parseMoney} from '../ui/facts.ts';
export const euros=(cents:number|null)=>cents===null?'Offen':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
export const unitEuros=(cents:number|null)=>cents===null?'Offen':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR',minimumFractionDigits:4,maximumFractionDigits:4}).format(cents/100);
export const amount=(value:number|null)=>value===null?'':new Intl.NumberFormat('de-DE',{useGrouping:false,maximumFractionDigits:4}).format(value);
export const shownAmount=(value:number|null)=>value===null?'Offen':amount(value);
export const priceInput=parseMoney;
export function Quantity({value,label,unit,disabled,onSave,whole=false}:{value:number|null;label:string;unit?:string;disabled?:boolean;whole?:boolean;onSave:(value:number|null)=>Promise<boolean>}){
 const [raw,setRaw]=useState(amount(value)),[error,setError]=useState('');
 useEffect(()=>{setRaw(amount(value));setError('');},[value]);
 async function save(){if(disabled)return;try{const parsed=parseQuantity(raw);if(whole&&parsed!==null&&!Number.isInteger(parsed))throw new Error('Bitte eine ganze Stückzahl eingeben.');if(parsed===value)return;const ok=await onSave(parsed);setError(ok?'':'Noch nicht gespeichert. Bitte den Hinweis oben beachten.');}catch(e){setError(e instanceof Error?e.message:'Ungültige Menge.');}}
 return <div className="quantity-wrap"><div className="quantity-field"><input aria-label={label} aria-invalid={Boolean(error)} inputMode={whole?'numeric':'decimal'} value={raw} disabled={disabled} placeholder="Offen" onChange={e=>{setRaw(e.target.value);setError('');}} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>{unit&&<span>{unit}</span>}</div>{error&&<span className="field-error" role="alert">{error}</span>}</div>;
}
export function Heading({eyebrow,title,children,action}:{eyebrow?:string;title:string;children?:React.ReactNode;action?:React.ReactNode}){return <header className="page-heading"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{children&&<p>{children}</p>}</div>{action}</header>;}
export function Money({value,label,disabled,onSave,precise=false}:{value:number|null;label:string;disabled?:boolean;precise?:boolean;onSave:(cents:number|null)=>Promise<boolean>}){
 const [raw,setRaw]=useState(value===null?'':amount(value/100)),[error,setError]=useState('');
 useEffect(()=>{setRaw(value===null?'':amount(value/100));setError('');},[value]);
 async function save(){if(disabled)return;try{const price=parseMoney(raw,precise);if(price===value)return;setError(await onSave(price)?'':'Noch nicht gespeichert. Bitte den Hinweis oben beachten.');}catch(e){setError((e as Error).message);}}
 return <div className="quantity-wrap"><div className={`quantity-field ${precise?'precise-money':''}`}><input aria-label={label} aria-invalid={Boolean(error)} inputMode="decimal" value={raw} disabled={disabled} placeholder="Offen" onChange={e=>{setRaw(e.target.value);setError('');}} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>€</span></div>{error&&<small className="field-error" role="alert">{error}</small>}</div>;
}
export function Notice({children}:{children:React.ReactNode}){return <div className="notice"><WarningCircle size={21}/><span>{children}</span></div>;}
export function Empty({title,children}:{title:string;children:React.ReactNode}){return <div className="empty"><h3>{title}</h3><p>{children}</p></div>;}
export function Jump({children,onClick}:{children:React.ReactNode;onClick:()=>void}){return <button className="button secondary" onClick={onClick}>{children}<ArrowRight size={18}/></button>;}
export function SourceDetails({source}:{source?:Source}){return source?<details className="source-details"><summary>Herkunft anzeigen</summary><p>{source.file}{source.sheet?` · ${source.sheet}`:''}{source.cells?` · ${source.cells}`:''}{source.page?` · Seite ${source.page}`:''}</p><small>Prüfsumme: {source.hash}</small></details>:null;}
export function Tabs({items,value,onChange,label}:{items:string[];value:string;onChange:(value:string)=>void;label:string}){return <div className="tabs" aria-label={label}>{items.map(item=><button key={item} aria-pressed={value===item} className={value===item?'selected':''} onClick={()=>onChange(item)}>{item}</button>)}</div>;}
export function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.focus();const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;previous?.focus();};},[]);
 function keyDown(e:React.KeyboardEvent){if(e.key==='Escape'){e.stopPropagation();onClose();}if(e.key==='Tab'){const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],summary,[tabindex="0"]')??[]).filter(el=>el.getClientRects().length);if(!items.length){e.preventDefault();return;}const first=items[0],last=items.at(-1)!;if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first.focus();}}}
 return <div className="modal-layer"><div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={keyDown}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={24}/></button></div>{children}</div></div>;
}
