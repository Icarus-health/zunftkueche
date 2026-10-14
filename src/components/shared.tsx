import {useEffect,useRef,useState} from 'react';
import {X,ArrowRight,WarningCircle} from '@phosphor-icons/react';
import {parseQuantity} from '../domain/kitchen.ts';
export const euros=(cents:number|null)=>cents===null?'Offen':new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(cents/100);
export const amount=(value:number|null)=>value===null?'':new Intl.NumberFormat('de-DE',{useGrouping:false,maximumFractionDigits:4}).format(value);
export const priceInput=(raw:string)=>{if(raw.trim().split(',')[1]?.length>2)throw new Error('Preis mit höchstens zwei Nachkommastellen eingeben.');const value=parseQuantity(raw);return value===null?null:Math.round(value*100);};
export function Quantity({value,label,unit,disabled,onSave}:{value:number|null;label:string;unit?:string;disabled?:boolean;onSave:(value:number|null)=>Promise<boolean>}){
 const [raw,setRaw]=useState(amount(value)),[error,setError]=useState('');
 useEffect(()=>{setRaw(amount(value));setError('');},[value]);
 async function save(){try{const parsed=parseQuantity(raw);if(parsed===value)return;const ok=await onSave(parsed);if(!ok)setError('Noch nicht gespeichert.');else setError('');}catch(e){setError(e instanceof Error?e.message:'Ungültige Menge.');}}
 return <div className="quantity-wrap"><div className="quantity-field"><input aria-label={label} aria-invalid={Boolean(error)} inputMode="decimal" value={raw} disabled={disabled} placeholder="Offen" onChange={e=>{setRaw(e.target.value);setError('');}} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>{unit&&<span>{unit}</span>}</div>{error&&<span className="field-error" role="alert">{error}</span>}</div>;
}
export function Heading({eyebrow,title,children,action}:{eyebrow?:string;title:string;children?:React.ReactNode;action?:React.ReactNode}){
 return <header className="page-heading"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{children&&<p>{children}</p>}</div>{action}</header>;
}
export function Money({value,label,disabled,onSave}:{value:number|null;label:string;disabled?:boolean;onSave:(cents:number|null)=>Promise<boolean>}){
 const [raw,setRaw]=useState(value===null?'':amount(value/100)),[error,setError]=useState('');
 useEffect(()=>{setRaw(value===null?'':amount(value/100));},[value]);
 async function save(){try{const price=priceInput(raw);if(price===value)return;if(await onSave(price))setError('');else setError('Noch nicht gespeichert.');}catch(e){setError((e as Error).message);}}
 return <div className="quantity-wrap"><div className="quantity-field"><input aria-label={label} inputMode="decimal" value={raw} disabled={disabled} placeholder="Offen" onChange={e=>{setRaw(e.target.value);setError('');}} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/><span>€</span></div>{error&&<small className="field-error" role="alert">{error}</small>}</div>;
}
export function Notice({children}:{children:React.ReactNode}){return <div className="notice"><WarningCircle size={21}/><span>{children}</span></div>;}
export function Empty({title,children}:{title:string;children:React.ReactNode}){return <div className="empty"><h3>{title}</h3><p>{children}</p></div>;}
export function Jump({children,onClick}:{children:React.ReactNode;onClick:()=>void}){return <button className="button secondary" onClick={onClick}>{children}<ArrowRight size={18}/></button>;}
export function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement as HTMLElement;ref.current?.focus();return()=>previous?.focus();},[]);
 function keyDown(e:React.KeyboardEvent){if(e.key==='Escape')onClose();if(e.key==='Tab'){const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')??[]);if(!items.length)return;const first=items[0],last=items.at(-1)!;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}
 return <div className="modal-layer"><div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onKeyDown={keyDown}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={24}/></button></div>{children}</div></div>;
}
