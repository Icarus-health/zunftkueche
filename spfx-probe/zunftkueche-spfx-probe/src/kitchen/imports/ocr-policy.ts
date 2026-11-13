export function ocrPageLimit(count:number):number {
    if(!Number.isInteger(count)||count<1)throw new Error('PDF-Seitenzahl bitte prüfen.');
    if(count>10)throw new Error('Texterkennung unterstützt höchstens 10 Seiten je Datei. Bitte einen kürzeren Beleg auswählen.');
    return count;
}
export function ocrOptions(workerPath:string,corePath:string,modelPath:string):{workerPath:string;corePath:string;langPath:string;cacheMethod:'none';workerBlobURL:true;gzip:true} {
    const origin=new URL(workerPath).origin;
    if(!/^https?:$/.test(new URL(workerPath).protocol) || [corePath,modelPath].some(path=>new URL(path).origin!==origin)) throw new Error('Adressen der lokalen Texterkennung passen nicht zusammen.');
    return {workerPath,corePath,langPath:modelPath+'?model=',cacheMethod:'none',workerBlobURL:true,gzip:true};
}
