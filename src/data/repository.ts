import {getMicrosoftRepository} from './microsoft-runtime.ts';
import type {KitchenState,Operation,CommitResult} from '../domain/state.ts';
export interface Repository {mode:'local'|'microsoft';canWrite?:boolean;load:()=>Promise<KitchenState>;commit:(op:Operation)=>Promise<CommitResult>}
export class RejectedError extends Error {}
export function createLocalRepository(fetcher:typeof fetch=fetch):Repository {
 return {mode:'local',canWrite:true,load:async()=>{
   const response=await fetcher('/api/kitchen',{cache:'no-store'}),result=await response.json();
   if(!response.ok)throw new Error(result.error??'Daten konnten nicht geladen werden.');return result.state;
 },commit:async(op)=>{
   const response=await fetcher('/api/kitchen/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)}),result=await response.json();
   if(response.status===400)throw new RejectedError(result.error??'Eingabe wurde abgelehnt.');
   if(!response.ok&&response.status!==409)throw new Error(result.error??'Speicherung nicht bestätigt.');return result;
 }};
}
export function getRepository():Repository {
 const microsoft=getMicrosoftRepository();if(microsoft)return microsoft;
 if(!import.meta.env.DEV)throw new Error('Die Microsoft-Datenverbindung ist noch nicht eingerichtet.');
 return createLocalRepository();
}
