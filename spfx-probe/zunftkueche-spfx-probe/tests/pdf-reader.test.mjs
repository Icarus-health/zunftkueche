import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readPdfText} from '../src/kitchen/imports/pdf-reader.ts';
test('a bundled PDF reader extracts text without a separately hosted worker module',async()=>{
 const data=new Uint8Array(await readFile(new URL('./fixtures/acceptance/rechnung-beispiel.pdf',import.meta.url)));
 const text=await readPdfText(data);
 assert.match(text,/Rechnung/i);
});
test('invoice preview renders a real first-page image without a browser PDF plugin',async()=>{const reader=await import('../src/kitchen/imports/pdf-reader.ts');assert.equal(typeof reader.renderPdfPreview,'function');const {createCanvas,loadImage}=await import('@napi-rs/canvas'),previous=globalThis.document;globalThis.document={createElement:()=>createCanvas(1,1)};try{const data=new Uint8Array(await readFile(new URL('./fixtures/acceptance/rechnung-beispiel.pdf',import.meta.url))),preview=await reader.renderPdfPreview(data);assert.equal(preview.pages,1);assert.match(preview.image,/^data:image\/png;base64,/);const img=await loadImage(preview.image),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,img.width,img.height).data;let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<128)ink++;assert.ok(ink>100,'document text is actually rendered, not a white image');}finally{globalThis.document=previous;}});
