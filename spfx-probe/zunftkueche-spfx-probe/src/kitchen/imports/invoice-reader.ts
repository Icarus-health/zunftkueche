export interface InvoiceReaders {text:(data:Uint8Array)=>Promise<string>;scan:(data:Uint8Array,progress:(text:string)=>void)=>Promise<string>}
const localReaders:InvoiceReaders={text:async data=>(await import(/* webpackChunkName: 'kitchen-pdf-reader' */ './pdf-reader.ts')).readPdfText(data),scan:async(data,progress)=>(await import(/* webpackChunkName: 'kitchen-scan-reader' */ './scan-reader.ts')).readScannedPdfText(data,progress)};
export async function readInvoiceText(data:Uint8Array,progress:(text:string)=>void,readers:InvoiceReaders=localReaders):Promise<{text:string;usedOcr:boolean}>{
 progress('PDF-Text wird gelesen …');try{return{text:await readers.text(data),usedOcr:false};}catch(error){if(!(error instanceof Error)||error.name!=='PdfNoTextError')throw error;}
 progress('Bildscan erkannt. Texterkennung auf diesem Gerät startet …');return{text:await readers.scan(data,progress),usedOcr:true};
}
