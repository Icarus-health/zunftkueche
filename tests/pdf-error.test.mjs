import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PassThrough} from 'node:stream';
import {localKitchenApi} from '../dev/local-api.ts';
test('Ein verschwundenes Original liefert eine kontrollierte Antwort statt den Server zu beenden',{timeout:1000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'zunftkueche-pdf-'));
 await fs.mkdir(path.join(root,'import'));
 await fs.writeFile(path.join(root,'import/2026.json'),JSON.stringify({invoices:[{id:'r-test',status:'Original vorhanden',localPath:path.join(root,'verschoben.pdf')}]}));
 let middleware;localKitchenApi(root).configureServer({middlewares:{use:fn=>{middleware=fn;}}});
 const res=new PassThrough();res.statusCode=200;res.setHeader=()=>{};
 let output='';res.on('data',chunk=>{output+=chunk;});
 const finished=new Promise(resolve=>res.on('finish',resolve));
 await middleware({url:'/api/kitchen/receipt/r-test',method:'GET',headers:{host:'127.0.0.1:4182'}},res,()=>{});
 await finished;assert.equal(res.statusCode,400);assert.ok(JSON.parse(output).error);
});
