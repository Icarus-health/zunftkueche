import {mkdir,writeFile,readFile,mkdtemp,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {validateKitchenBackup} from '../../src/data/backup.ts';
import type {KitchenBackup} from '../../src/data/backup.ts';
/** Local evidence only. No production imports or Microsoft writes. Directory must not exist. */
export async function restoreLocalTest(backup:KitchenBackup,target:{kind:'isolated-local-test';directory:string;authorized:boolean}) {
 if(target.kind!=='isolated-local-test'||target.authorized!==true)throw new Error('Separate autorisierte Testumgebung erforderlich.');
 const dir=resolve(target.directory);if(dir.split('/').some(p=>p==='.local-state'||p==='.git')||dir===process.cwd())throw new Error('Produktivbestand ist kein Testziel.');
 if((await validateKitchenBackup(backup)).complete!==true)throw new Error('Unvollständige Sicherung: keine vollständige Wiederherstellung.');
 if(backup.documentManifest.some(m=>m.bytesBase64===undefined))throw new Error("Getrennt gesicherte Originale müssen vor der Wiederherstellung gelesen und als geprüfte Bytes bereitgestellt werden.");
 // Fixed offline validator; no arbitrary command, environment or production target.
 const root=fileURLToPath(new URL('../../',import.meta.url));const temp=await mkdtemp(join(tmpdir(),'kitchen-backup-validation-'));
 try {const path=join(temp,'state.json');await writeFile(path,JSON.stringify(backup.state),{flag:'wx',mode:0o600});await promisify(execFile)(resolve(root,'../dotnet/dotnet'),[join(root,'server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll'),'--validate-backup-state',path],{timeout:30000,maxBuffer:65536});} finally {await rm(temp,{recursive:true,force:true});}
 await mkdir(dir,{recursive:false,mode:0o700});
 await writeFile(join(dir,'backup.json'),JSON.stringify(backup),{flag:'wx',mode:0o600});
 for(const [i,original] of backup.documentManifest.entries())if(original.bytesBase64!==undefined)await writeFile(join(dir,`original-${i}.bin`),Buffer.from(original.bytesBase64,'base64'),{flag:'wx',mode:0o600});
 for(const [i,original] of backup.documentManifest.entries())if(!Buffer.from(original.bytesBase64!,"base64").equals(await readFile(join(dir,`original-${i}.bin`))))throw new Error("Original-Readback weicht ab.");
 const readback=JSON.parse(await readFile(join(dir,'backup.json'),'utf8'));await validateKitchenBackup(readback);
 return {status:'local-isolated-restore-verified',directory:dir,microsoftRestore:'not-tested'};
}
