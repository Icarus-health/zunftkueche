import fs from 'node:fs';
import path from 'node:path';
import type {Plugin} from 'vite';
import {createLocalStore} from './local-store.ts';
import type {KitchenState} from '../src/domain/state.ts';

// Ausschließlich lokale Entwicklung. Vite enthält diesen Code nicht im App-Build.
export function localKitchenApi(root:string):Plugin {
 const seed=JSON.parse(fs.readFileSync(path.join(root,'import/2026.json'),'utf8')) as KitchenState;
 const store=createLocalStore(path.join(root,'.local-state/state.json'),seed);
 return {name:'local-kitchen-api',apply:'serve',configureServer(server){
   server.middlewares.use(async(req,res,next)=>{
     if(!req.url?.startsWith('/api/kitchen'))return next();
     res.setHeader('Content-Type','application/json; charset=utf-8');
     res.setHeader('Cache-Control','no-store');
     try{
       const host=(req.headers.host??'').split(':')[0];
       if(!['localhost','127.0.0.1'].includes(host))throw new Error('Nur lokaler Zugriff ist erlaubt.');
       if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw new Error('Ursprung nicht erlaubt.');
       if(req.method==='GET'&&req.url.startsWith('/api/kitchen/receipt/')){
         const id=decodeURIComponent(req.url.slice('/api/kitchen/receipt/'.length));
         const receipt=(await store.load()).invoices.find(i=>i.id===id) as any;
         if(!receipt?.localPath||receipt.status!=='Original vorhanden')throw new Error('Originaldatei nicht verfügbar.');
         const pdf=await fs.promises.readFile(receipt.localPath);
         res.setHeader('Content-Type','application/pdf');
         res.setHeader('Content-Disposition','inline');
         return res.end(pdf);
       }
       if(req.method==='GET'&&req.url==='/api/kitchen')return res.end(JSON.stringify({mode:'local',state:await store.load()}));
       if(req.method==='POST'&&req.url==='/api/kitchen/commit'){
         if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('JSON wird benötigt.');
         let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000)throw new Error('Eingabe ist zu groß.');}
         const result=await store.commit(JSON.parse(body));res.statusCode=result.status==='conflict'?409:200;return res.end(JSON.stringify(result));
       }
       res.statusCode=404;res.end(JSON.stringify({error:'Nicht gefunden.'}));
     }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'Speicherung fehlgeschlagen.'}));}
   });
 }};
}
