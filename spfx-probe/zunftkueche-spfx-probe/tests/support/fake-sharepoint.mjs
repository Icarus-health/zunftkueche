const reply=(status,body={})=>({status,ok:status>=200&&status<300,json:async()=>body});
export class Server {
 lists=new Map();attachments=new Map();descriptions=new Map();keyUnique=true;richText=false;failHeader=false;dropAfterCommit=false;failPage=false;
 constructor(){for(const n of ['Saisons','Artikel','Lieferanten','Lieferangebote','Bestellungen','Bestellpositionen','Bestandsmeldungen'])this.lists.set('ZK_V1_'+n,[]);}
 request=async(url,options)=>{
  const u=new URL(url), name=decodeURIComponent(u.pathname).match(/getbytitle\('([^']+)'\)/)?.[1],rows=this.lists.get(name),body=typeof options.body==='string'?JSON.parse(options.body):{};
  if(u.pathname.endsWith('/_api/web/lists')&&options.method==='POST'){this.lists.set(body.Title,[]);this.descriptions.set(body.Title,body.Description);return reply(201);}
  if(!rows)return reply(404);
  if(!u.pathname.includes('/items'))return reply(200,{Description:this.descriptions.get(name)||'[ZK-V1]',value:[{InternalName:'ZKKey',FieldTypeKind:2,Indexed:true,EnforceUniqueValues:this.keyUnique},{InternalName:'ZKData',FieldTypeKind:3,SchemaXml:'<Field Type="Note" RichText="'+(this.richText?'TRUE':'FALSE')+'" />'},...(name.includes('Journal')?['ZKScope','ZKKind','ZKRef','ZKHash'].map(InternalName=>({InternalName,FieldTypeKind:2,Indexed:true,EnforceUniqueValues:['ZKRef','ZKHash'].includes(InternalName)})):[])]});
  if(u.pathname.includes('/AttachmentFiles')){const item=u.pathname.match(/items\((\d+)\)/)?.[1],key=name+':'+item;const files=this.attachments.get(key)||new Map();this.attachments.set(key,files);if(u.pathname.endsWith('/$value')){const file=decodeURIComponent(u.pathname).match(/getByFileName\('([^']+)'\)/)?.[1],bytes=files.get(file);return bytes?{...reply(200),arrayBuffer:async()=>new Uint8Array(bytes).buffer}:reply(404);}if(options.method==='POST'){const file=decodeURIComponent(u.pathname).match(/add\(FileName='([^']+)'\)/)?.[1];if(files.has(file))return reply(409);files.set(file,new Uint8Array(options.body));return reply(201);}return reply(200,{value:[...files.keys()].map(FileName=>({FileName}))});}
  if(options.method==='GET'){
   let selected=rows;const key=u.searchParams.get('$filter')?.match(/ZKKey eq '([^']+)'/)?.[1];if(key)selected=rows.filter(r=>r.ZKKey===key);for(const field of ['ZKScope','ZKRef','ZKHash']){const m=u.searchParams.get('$filter')?.match(new RegExp(field+" eq '([^']+)'"))?.[1];if(m)selected=selected.filter(r=>r[field]===m);}
   const offset=Number(u.searchParams.get('offset')||0);if(offset&&this.failPage)return reply(403);
   const next=new URL(u);next.searchParams.set('offset',String(offset+2));const value=selected.slice(offset,offset+2).map(r=>({...r,'odata.etag':'"'+r.version+'"'}));
   return reply(200,{value,...(selected.length>offset+2?{'odata.nextLink':next.href}:{})});
  }
  if(name.endsWith('_Bestellungen')&&this.failHeader)return reply(500);
  const itemId=u.pathname.match(/items\((\d+)\)/)?.[1];
  if(name.includes('Journal')){for(const f of ['ZKRef','ZKHash'])if(body[f]&&rows.some(r=>r[f]===body[f]&&r.Id!==Number(itemId)))return reply(409);}
  if(itemId){const row=rows.find(r=>r.Id===Number(itemId));if(!row)return reply(404);if(options.headers['IF-MATCH']!=='"'+row.version+'"')return reply(412);Object.assign(row,body);row.version++;}
  else {if(rows.some(r=>r.ZKKey===body.ZKKey))return reply(409);rows.push({...body,Id:rows.length+1,version:1});}
  if(name.endsWith('_Bestellungen')&&this.dropAfterCommit){this.dropAfterCommit=false;throw new Error('network after write');}
  return reply(204);
 };
}
