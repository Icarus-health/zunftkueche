import type {KitchenState,Operation} from '../domain/state.ts';
import type {Repository} from './repository.ts';
import {RejectedError} from './repository.ts';
export interface SaveStatus {busy:boolean;pending:Operation|null;error:string;message:string}
export class SaveController {
 status:SaveStatus={busy:false,pending:null,error:'',message:''};
 repo:()=>Repository; onState:(state:KitchenState)=>void;onStatus:(status:SaveStatus)=>void;
 private active:{op:Operation;resolve:(ok:boolean)=>void}|null=null;
 constructor(repo:()=>Repository,onState:(state:KitchenState)=>void,onStatus:(status:SaveStatus)=>void){this.repo=repo;this.onState=onState;this.onStatus=onStatus;}
 private publish(status:SaveStatus){this.status=status;this.onStatus({...status});}
 save(op:Operation):Promise<boolean>{
   if(this.active)return Promise.resolve(false);
   return new Promise(resolve=>{this.active={op,resolve};void this.send();});
 }
 retry():Promise<void>{if(!this.active||this.status.busy)return Promise.resolve();return this.send();}
 clearNotice():void{if(!this.active)this.publish({busy:false,pending:null,error:'',message:''});}
 private async send():Promise<void>{
   const active=this.active;if(!active)return;
   this.publish({busy:true,pending:active.op,error:'',message:'Wird gespeichert …'});
   try{
     const result=await this.repo().commit(active.op);this.onState(result.state);
     const saved=result.status==='saved';this.active=null;
     this.publish({busy:false,pending:null,error:saved?'':'Die Daten wurden inzwischen geändert. Der aktuelle Stand wurde geladen. Bitte prüfe deine Eingabe und speichere erneut.',message:saved?'Lokal gespeichert':'Änderung nicht übernommen'});
     active.resolve(saved);
   }catch(error){
     if(error instanceof RejectedError){this.active=null;this.publish({busy:false,pending:null,error:error.message,message:'Eingabe nicht übernommen'});active.resolve(false);}
     else this.publish({busy:false,pending:active.op,error:`Speicherung nicht bestätigt: ${(error as Error).message}`,message:'Änderung noch offen'});
   }
 }
}
