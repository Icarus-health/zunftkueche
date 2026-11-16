import {test} from 'node:test';import assert from 'node:assert/strict';
import {ocrPageLimit,ocrOptions} from '../src/kitchen/imports/ocr-policy.ts';
test('OCR uses only explicitly packaged assets and bounded work',()=>{
 const opts=ocrOptions('https://example.test/assets/worker.js','https://example.test/assets/core.js','https://example.test/assets/deu.bin');
 assert.equal(opts.workerPath,'https://example.test/assets/worker.js');assert.equal(opts.corePath,'https://example.test/assets/core.js');assert.equal(opts.langPath,'https://example.test/assets/deu.bin?model=');assert.equal(opts.cacheMethod,'none');assert.throws(()=>ocrOptions('https://example.test/a.js','https://third-party.test/core.js','https://example.test/data.bin'),/lokal|Adresse/);
 assert.equal(ocrPageLimit(1),1);assert.throws(()=>ocrPageLimit(11),/10/);assert.throws(()=>ocrPageLimit(0),/Seiten/);
});
test('invoice form provides explicit on-device scan option',async()=>{
 const {billForm}=await import('../src/kitchen/ww/bills-view.ts');const {workspace}=await import('./support/kitchen-data.mjs');
 const bill={id:'b',scope:'s2027',area:'Küche',supplierId:'',name:'',date:'2027-02-20',number:'',net:null,tax:null,gross:null,adjustmentNet:0,orderIds:[],lines:[],note:'',confirmed:false,fileName:'',attachment:''};
 const html=billForm(bill,workspace(),'');assert.match(html,/data-action="ww-pdf-ocr"/);assert.match(html,/Texterkennung/);
});
