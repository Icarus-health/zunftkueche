import { SHAREPOINT_TARGET as target } from './documents.ts';
import type { DocumentProvider, DocumentRef, ProviderFile } from './documents.ts';
import type { SharePointService } from '../generated/services/SharePointService';

type Result = { success: boolean; data?: unknown };
function data(result:Result):unknown {
  if(!result.success || result.data===undefined)throw new Error('SharePoint-Zugriff nicht bestätigt. Eigene Verbindung und Dokumentrecht prüfen.');
  return result.data;
}
function object(value:unknown):Record<string,unknown> {
  if(typeof value==='string')value=JSON.parse(value);
  if(!value || typeof value!=='object'||Array.isArray(value))throw new Error('SharePoint-Antwort ungültig.');
  const result=value as Record<string,unknown>;
  if('body' in result)return object(result.body);
  if('d' in result)return object(result.d);
  return result;
}
export function matchSharePointPrincipal(expected:string,value:Record<string,unknown>):boolean {
  const values=[value.Email,value.LoginName].filter(v=>v!==undefined&&v!==null&&v!=='');
  return !!expected && values.length>0 && values.every(v=>{
    if(typeof v!=='string'||v.length>512||/[\u0000-\u001f\u007f]/.test(v))return false;
    const p=v.trim().toLowerCase();
    return (p.includes('|')?/^i:0#\.f\|membership\|([^|]+)$/.exec(p)?.[1]:p)===expected;
  });
}
export function sharePointBytes(value:unknown):Uint8Array {
  if(value instanceof Uint8Array)return value;
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(typeof value==='string'&&value.length%4===0&&/^[A-Za-z0-9+/]*={0,2}$/.test(value))return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
  throw new Error('Binärformat des Originals nicht bestätigt.');
}
function nameAllowed(name:string) {
  if(!/^receipt-[a-f0-9-]{36}\.(jpg|png|pdf)$/.test(name))throw new Error('Originalpfad ungültig.');
}
export function createSharePointProvider(SP:typeof SharePointService, host:()=>Promise<{app:{appId?:string;environmentId:string};user?:{userPrincipalName?:string}}>):DocumentProvider {
  const serverFolder=new URL(target.siteUrl).pathname+target.folder;
  async function get(uri:string) {return object(data(await SP.HttpRequest(target.siteUrl,{method:'GET',uri,headers:{Accept:'application/json;odata=nometadata'}})));}
  async function readIdentifier(identifier:string):Promise<ProviderFile> {
    const before=data(await SP.GetFileMetadata(target.siteUrl,identifier)) as Record<string,unknown>;
    if(!Number.isSafeInteger(before.Size)||Number(before.Size)<1||Number(before.Size)>5242880)throw new Error('Originalgröße überschreitet das geprüfte Limit.');
    const bytes=sharePointBytes(data(await SP.GetFileContent(target.siteUrl,identifier,false)));
    const after=data(await SP.GetFileMetadata(target.siteUrl,identifier)) as Record<string,unknown>;
    if(before.Id!==identifier || after.Id!==identifier || before.ETag!==after.ETag || before.ItemId!==after.ItemId
      || typeof after.ETag!=='string'||!after.ETag || !Number.isSafeInteger(after.ItemId)||Number(after.ItemId)<1
      || after.IsFolder!==false || after.Size!==bytes.length)throw new Error('Dateiidentität oder Version während Lesen geändert.');
    return {bytes,version:after.ETag,itemId:String(after.ItemId),connectorIdentifier:identifier};
  }
  return {
    async identity() {
      const context=await host();
      if(context.app.appId?.toLowerCase()!=='bfec495e-c223-4176-89a8-3e4d631337ae'||context.app.environmentId.toLowerCase()!=='5684204c-3254-ec15-93f4-276ec50cc65b')throw new Error('Microsoft-App oder Umgebung nicht bestätigt.');
      const principal=context.user?.userPrincipalName?.trim().toLowerCase()??'';
      if(!matchSharePointPrincipal(principal,await get('_api/web/currentuser?$select=Email,LoginName')))throw new Error('SharePoint-Konto entspricht nicht dem angemeldeten App-Konto.');
      const site=await get('_api/site?$select=Id'),web=await get('_api/web?$select=Id');
      const folder=await get(`_api/web/GetFolderByServerRelativeUrl('${serverFolder}')?$select=UniqueId,ServerRelativeUrl`);
      const library=await get(`_api/web/lists(guid'${target.libraryId}')?$select=Id,EnableVersioning`);
      if(String(site.Id).toLowerCase()!==target.siteCollectionId||String(web.Id).toLowerCase()!==target.webId
        ||String(folder.UniqueId).toLowerCase()!=='0289ec77-85e0-4229-bf24-f811a7318102'||folder.ServerRelativeUrl!==serverFolder
        ||String(library.Id).toLowerCase()!==target.libraryId||library.EnableVersioning!==true)throw new Error('SharePoint-Ziel oder Versionierung nicht bestätigt.');
      const after=await host();if(after.user?.userPrincipalName?.trim().toLowerCase()!==principal)throw new Error('Konto während Prüfung geändert.');
      return principal;
    },
    async find(name) {
      nameAllowed(name);
      // Exact-name query; no unbounded/truncated folder listing is used as absence evidence.
      const result=await get(`_api/web/GetFolderByServerRelativeUrl('${serverFolder}')/Files?$filter=Name eq '${name}'&$select=Name&$top=2`);
      const matches=result.value??result.results;
      if(!Array.isArray(matches)||matches.length>1||result['@odata.nextLink']||result.__next)throw new Error('Dateisuche nicht eindeutig vollständig.');
      if(!matches.length)return null;
      if(matches[0]?.Name!==name)throw new Error('Dateisuche gehört zu anderem Original.');
      const meta=data(await SP.GetFileMetadataByPath(target.siteUrl,`${target.folder}/${name}`)) as Record<string,unknown>;
      if(typeof meta.Id!=='string'||meta.Name!==name)throw new Error('Originalkennung fehlt.');
      return readIdentifier(meta.Id);
    },
    async create(name,bytes) {
      nameAllowed(name);
      let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
      data(await SP.CreateFile(target.siteUrl,target.folder,name,btoa(binary)));
    },
    async read(ref:DocumentRef) {
      const prefix=`${target.siteUrl}${target.folder}/`;
      const url=decodeURI(ref.webUrl);
      if(!url.startsWith(prefix))throw new Error('Original außerhalb des bestätigten Ordners.');
      const name=url.slice(prefix.length);nameAllowed(name);
      const metadata=data(await SP.GetFileMetadataByPath(target.siteUrl,`${target.folder}/${name}`)) as Record<string,unknown>;
      if(metadata.Id!==ref.connectorIdentifier||String(metadata.ItemId)!==ref.itemId||metadata.Name!==name)throw new Error('Originalpfad oder native Identität geändert.');
      return readIdentifier(ref.connectorIdentifier);
    },
  };
}
