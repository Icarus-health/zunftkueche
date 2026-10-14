import type {IOperationResult} from '@microsoft/power-apps/data';
import {createMicrosoftRepository} from './microsoft-repository.ts';
import type {Repository} from './repository.ts';
// Supply the REAL metadata-generated service classes after deploying the Custom APIs.
// Their own getClient(dataSourcesInfo) owns nativeAction/Dataverse routing; no fabricated metadata.
export interface KitchenGeneratedServices {
 load:{zk_KitchenLoad:(RequestJson:string)=>Promise<IOperationResult<{ResultJson?:string}>>};
 commit:{zk_KitchenCommit:(RequestJson:string)=>Promise<IOperationResult<{ResultJson?:string}>>};
}
let configured:Repository|undefined;
export function configureMicrosoftRuntime(workspaceId:string,services:KitchenGeneratedServices):Repository {
 if(configured)throw new Error('Microsoft-Verbindung ist bereits initialisiert.');
 configured=createMicrosoftRepository({load:q=>services.load.zk_KitchenLoad(q),commit:q=>services.commit.zk_KitchenCommit(q)},workspaceId,typeof sessionStorage==='undefined'?undefined:sessionStorage);
 return configured;
}
export function getMicrosoftRepository():Repository|undefined{return configured;}
