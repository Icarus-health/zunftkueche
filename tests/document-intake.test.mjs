import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/data/documents.ts').catch(() => ({}));
import {jpegFile as file,jpeg,png} from './document-files.mjs';
import {fixture} from './document-fixture.mjs';
test('original validation accepts JPEG PNG PDF and rejects HEIC and disguised contents',async()=>{
 assert.equal(typeof mod.validateOriginal,'function');
 assert.equal((await mod.validateOriginal(file())).mimeType,'image/jpeg');
 for(const [name,type,bytes] of [['p.png','image/png',png],['p.pdf','application/pdf',[37,80,68,70,45]]]) assert.equal((await mod.validateOriginal(new File([Uint8Array.from(bytes)],name,{type}))).mimeType,type);
 await assert.rejects(()=>mod.validateOriginal(new File(['x'],'a.heic',{type:'image/heic'})),/HEIC|JPEG/);
 await assert.rejects(()=>mod.validateOriginal(new File(['x'],'a.jpg',{type:'image/jpeg'})),/inhalt/i);
});
test('one original is uploaded and reused with exact identity and bytes',async()=>{
 assert.equal(typeof mod.createDocumentRepository,'function');const f=fixture(),r=f.repo();const a=await r.upload({uploadId:'11111111-1111-4111-8111-111111111111',eventId:'event-1',file:file()});const b=await r.upload({uploadId:'11111111-1111-4111-8111-111111111111',eventId:'event-1',file:file()});assert.deepEqual(a,b);assert.equal(f.creates,1);assert.equal(await r.loadUpload('11111111-1111-4111-8111-111111111111'),'linked');assert.equal((await r.getOriginal(a)).size,jpeg.length);
});
test('same upload ID cannot change file or event',async()=>{assert.equal(typeof mod.createDocumentRepository,'function');const f=fixture(),r=f.repo();await r.upload({uploadId:'11111111-1111-4111-8111-111111111111',eventId:'event-1',file:file()});await assert.rejects(()=>r.upload({uploadId:'11111111-1111-4111-8111-111111111111',eventId:'other',file:file()}),/Zuordnung/);});
test('account switch invalidates in-flight original read',async()=>{assert.equal(typeof mod.createDocumentRepository,'function');const f=fixture(),r=f.repo();const ref=await r.upload({uploadId:'11111111-1111-4111-8111-111111111111',eventId:'event-1',file:file()});f.api.read=async()=>{f.setPrincipal('user-b');return {bytes:jpeg,version:'etag-1',itemId:'1',connectorIdentifier:'encoded-id'};};await assert.rejects(()=>r.getOriginal(ref),/Konto/);});
test('compressed image dimensions are bounded before browser decoding',async()=>{
 const png=Uint8Array.of(137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,1,0,0,0,1,0,0,8,6,0,0,0,0,0,0,0,0,0,0,1,73,68,65,84,0,0,0,0,0,0,0,0,0,73,69,78,68,0,0,0,0);
 await assert.rejects(()=>mod.validateOriginal(new File([png],'huge.png',{type:'image/png'})),/Pixel|Abmessungen/);
});
