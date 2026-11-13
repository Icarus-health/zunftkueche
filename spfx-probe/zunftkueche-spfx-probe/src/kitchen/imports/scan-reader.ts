import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import './pdf-reader.ts'; // Reuse the locally bundled PDF worker in Teams.
import tesseract from './ocr-assets/tesseract.esm.min.mjs';
import {ocrOptions,ocrPageLimit} from './ocr-policy.ts';

/** Render and read locally; assets are bundled in the same SharePoint solution. */
export async function readScannedPdfText(data:Uint8Array,progress:(text:string)=>void=()=>{}):Promise<string> {
    if (!data.length || data.length > 8*1024*1024 || new TextDecoder().decode(data.slice(0,5))!=='%PDF-') throw new Error('Bitte eine PDF-Datei bis 8 MB auswählen.');
    const task=getDocument({data:new Uint8Array(data),enableXfa:false,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,stopAtErrors:true});
    let worker:Awaited<ReturnType<typeof tesseract.createWorker>>|undefined;
    try {
        const doc=await task.promise, pages=ocrPageLimit(doc.numPages);
        const options=ocrOptions(new URL('./ocr-assets/worker.min.js',import.meta.url).href,new URL('./ocr-assets/core.js',import.meta.url).href,new URL('./ocr-assets/deu.traineddata.bin',import.meta.url).href);
        if(new URL(options.workerPath).origin!==window.location.origin)throw new Error('Texterkennung ist nur mit lokalen App-Dateien verfügbar.');
        worker=await tesseract.createWorker('deu',1,options);
        const result:string[]=[];
        for(let i=1;i<=pages;i++) {
            progress('Texterkennung · Seite '+i+' von '+pages);
            const page=await doc.getPage(i),base=page.getViewport({scale:1});
            const scale=Math.min(2,Math.sqrt(4500000/(base.width*base.height)));
            const viewport=page.getViewport({scale}),canvas=document.createElement('canvas');
            canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
            const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('PDF-Seite kann auf diesem Gerät nicht dargestellt werden.');
            await page.render({canvasContext:context,canvas,viewport}).promise;
            const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PDF-Seite kann nicht gelesen werden.')),'image/png'));
            const recognized=await worker.recognize(blob);result.push('Seite '+i+'\n'+recognized.data.text);
            page.cleanup();
        }
        const text=result.join('\n\n');if(!text.replace(/Seite \d+/g,'').trim())throw new Error('Kein Text erkannt. Bitte Angaben manuell erfassen.');
        return text;
    } finally { if(worker)await worker.terminate();await task.destroy(); }
}
