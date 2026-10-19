import { bytesHash } from './backup.ts';

export const DOCUMENT_LIMITS = { maxDimension: 8192, maxPixels: 24000000, maxBytes: 5 * 1024 * 1024, maxOriginals: 10, maxTotalBytes: 20 * 1024 * 1024 } as const;
export const SHAREPOINT_TARGET = {
  siteUrl: 'https://schelmenzunft.sharepoint.com/sites/SchelmenzunftStaufenTraditionszunftderStaufenerStubengesells',
  folder: '/Shared Documents/General/Zunftküche/Rechnungen',
  siteCollectionId: 'f8177aa4-4ba3-4ba1-8c26-5ed32d5b2923',
  webId: 'c24ab669-3ca6-4530-aabf-6f42f8343ae7',
  libraryId: '9e71defe-f678-4c0c-b69c-45e4370a735a',
} as const;
/** Native SharePoint identities; libraryId is not a Graph driveId. */
export interface DocumentRef {
  provider: 'sharepoint'; siteCollectionId: string; webId: string; libraryId: string;
  itemId: string; version: string; connectorIdentifier: string; webUrl: string;
  sha256: string; mimeType: string; size: number; originalName: string;
}
export type UploadStatus = 'selected' | 'uploading' | 'uploaded-unlinked' | 'linked' | 'failed';
export interface OriginalInfo { sha256: string; mimeType: string; size: number; originalName: string }
export interface DocumentRow extends OriginalInfo {
  id: string; uploadId: string; eventId: string; principal: string; status: UploadStatus;
  rowVersion: string; ref?: DocumentRef; workspaceId?: string; history?: unknown[];
}
export interface DraftPage { documentId: string; documentRowVersion: string; version: string; sha256: string; originalReviewed: boolean }
export interface ExtractDraft {
  schemaVersion: 1; id: string; eventId: string; rowVersion?: string; workspaceId?: string;
  source: 'manual'; parserVersion: null; modelVersion: null; promptVersion: null;
  reviewStatus: 'editing' | 'reviewed' | 'accepted';
  rawInput?: import('../ui/receipt-intake-draft.ts').ReceiptEdit['raw'];
  textAssist?: import('../ocr/receipt-parser.ts').TextAssist;
  acceptance?: {operationId:string;receiptId:string;requestHash:string;appliedRevision:number;actorId:string;recordedAt:string;reviewedFields:import('../domain/receipt-draft.ts').ReceiptAcceptance['reviewedFields'];reviewDecisions:import('../domain/receipt-draft.ts').ReviewDecisions;documentVersion:DraftPage[]}; pages: DraftPage[];
  header: { supplierId: string; number: string; date: string; scope: string; grossCents: number | null };
  lines: Array<{ id: string; description: string; articleId: string; quantity: number | null; unit: string; grossCents: number | null }>;
  history?: unknown[];
}
export interface DocumentStore {
  list(): Promise<{ documents: DocumentRow[]; drafts: ExtractDraft[] }>;
  begin(value: OriginalInfo & { uploadId: string; eventId: string; principal: string }): Promise<DocumentRow>;
  claim(value: DocumentRow): Promise<{row: DocumentRow; createAuthorized: boolean}>;
  link(value: DocumentRow & { ref: DocumentRef }): Promise<DocumentRow>;
  saveDraft(value: ExtractDraft): Promise<ExtractDraft>;
}
export interface ProviderFile { bytes: Uint8Array; version: string; itemId: string; connectorIdentifier: string }
export interface DocumentProvider {
  /** Confirms actual host and connector principal and native destination on each boundary. */
  identity(): Promise<string>;
  find(name: string): Promise<ProviderFile | null>;
  create(name: string, bytes: Uint8Array): Promise<void>;
  read(ref: DocumentRef): Promise<ProviderFile>;
}
export interface DocumentRepository {
  upload(value: { uploadId: string; eventId: string; file: File; signal?: AbortSignal }): Promise<DocumentRef>;
  getOriginal(ref: DocumentRef): Promise<Blob>;
  loadUpload(uploadId: string): Promise<UploadStatus>;
  list(): ReturnType<DocumentStore['list']>;
  saveDraft(value: ExtractDraft): Promise<ExtractDraft>;
}
export async function validateOriginal(file: File): Promise<OriginalInfo> {
  const supported = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!supported.includes(file.type)) throw new Error('HEIC und andere Formate werden nicht verarbeitet. Bitte als JPEG/PNG exportieren oder PDF auswählen.');
  if (!file.size || file.size > DOCUMENT_LIMITS.maxBytes) throw new Error('Original muss zwischen 1 Byte und 5 MiB groß sein.');
  if (!file.name || file.name.length > 200 || /[\u0000-\u001f]/.test(file.name)) throw new Error('Dateiname ungültig.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signatures: Record<string, number[]> = {'image/jpeg':[255,216,255], 'image/png':[137,80,78,71,13,10,26,10], 'application/pdf':[37,80,68,70,45]};
  if (!signatures[file.type].every((byte,index)=>bytes[index]===byte)) throw new Error('Dateiinhalt passt nicht zum Dateityp.');
  if(file.type!=='application/pdf')validateImageDimensions(bytes,file.type);
  return { sha256: await bytesHash(bytes), mimeType: file.type, size: bytes.length, originalName: file.name };
}
/** Header-only checks before any object URL/image decoding; never converts originals. */
export function validateImageDimensions(bytes:Uint8Array,type:string):void {
  const bad=()=>{throw new Error('Bildinhalt beschädigt oder Abmessungen nicht lesbar. Bitte erneut als JPEG/PNG exportieren.');};
  let width=0,height=0;
  if(type==='image/png') {
    if(bytes.length<33||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')bad();
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    width=view.getUint32(16);height=view.getUint32(20);
    let at=8,hasData=false,ended=false;
    while(at+12<=bytes.length) {
      const length=view.getUint32(at),kind=String.fromCharCode(...bytes.slice(at+4,at+8));
      if(length>bytes.length-at-12)bad();
      if(kind==='IDAT')hasData=true;
      at+=length+12;
      if(kind==='IEND'){ended=length===0&&at===bytes.length;break;}
    }
    if(!hasData||!ended)bad();
  } else {
    if(bytes.length<4||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)bad();
    let at=2,scan=false;
    while(at+3<bytes.length) {
      if(bytes[at++]!==255)bad();
      while(bytes[at]===255)at++;
      const marker=bytes[at++];
      const length=bytes[at]*256+bytes[at+1];
      if(length<2||at+length>bytes.length)bad();
      if([192,193,194].includes(marker)) {
        if(length<8)bad();height=bytes[at+3]*256+bytes[at+4];width=bytes[at+5]*256+bytes[at+6];
      }
      if(marker===218){scan=true;break;}
      at+=length;
    }
    if(!scan)bad();
  }
  if(width<1||height<1)bad();
  if(width>DOCUMENT_LIMITS.maxDimension||height>DOCUMENT_LIMITS.maxDimension||width*height>DOCUMENT_LIMITS.maxPixels)throw new Error('Bild überschreitet 24 Millionen Pixel oder 8192 Pixel Kantenlänge. Bitte eine kleinere JPEG/PNG-Kopie auswählen; Original behalten.');
}
export function originalStorageName(row: Pick<DocumentRow,'uploadId'|'mimeType'>): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(row.uploadId)) throw new Error('Upload-ID ungültig.');
  const extension = {'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[row.mimeType];
  if (!extension) throw new Error('Dateityp ungültig.');
  return `receipt-${row.uploadId.toLowerCase()}.${extension}`;
}
export function createDocumentRepository({api,store}: {api: DocumentProvider;store: DocumentStore}): DocumentRepository {
  let sessionPrincipal: string | undefined;
  const activeUploads=new Set<string>();
  async function principal() {
    const current = await api.identity();
    if (!current || sessionPrincipal && sessionPrincipal !== current) throw new Error('Konto hat sich geändert. Vorgang gesperrt; App neu laden.');
    sessionPrincipal = current;
    return current;
  }
  async function boundary<T>(fn:()=>Promise<T>):Promise<T> {
    await principal(); const result=await fn(); await principal(); return result;
  }
  async function verify(file: ProviderFile, expected: OriginalInfo, ref?: DocumentRef) {
    if (file.bytes.length !== expected.size || await bytesHash(file.bytes) !== expected.sha256
      || !file.itemId || !file.version || !file.connectorIdentifier
      || ref && (file.version!==ref.version || file.itemId!==ref.itemId || file.connectorIdentifier!==ref.connectorIdentifier)) {
      throw new Error('Originalinhalt oder Dateiversion geändert. Keine Wiederverwendung.');
    }
  }
  async function list() { return boundary(()=>store.list()); }
  return {
    list,
    async upload({uploadId,eventId,file,signal}) {
      if(activeUploads.has(uploadId))throw new Error('Dieser Upload läuft bereits. Bitte den laufenden Vorgang abwarten.');
      activeUploads.add(uploadId);
      try {
        const stop=()=>{if(signal?.aborted)throw new Error('Abgebrochen. Ein bereits gestarteter Upload kann dennoch gespeichert sein; Wiederaufnahme prüft den Ausgang.');};
        stop(); const info=await validateOriginal(file); originalStorageName({uploadId,mimeType:info.mimeType});
        const user=await principal(); stop();
        let row=await boundary(()=>store.begin({...info,uploadId,eventId,principal:user}));
        if (row.eventId!==eventId || row.principal!==user || row.sha256!==info.sha256 || row.size!==info.size || row.mimeType!==info.mimeType || row.originalName!==info.originalName) throw new Error('Upload-ID: Datei oder Zuordnung weicht ab.');
        const name=originalStorageName(row);
        let existing=await boundary(()=>api.find(name)); stop();
        if (!existing) {
          if(row.status!=='selected')throw new Error('Unklarer Uploadausgang. Original noch nicht auffindbar; kein erneuter Upload. Bitte später wieder aufnehmen.');
          const claim=await boundary(()=>store.claim(row)); row=claim.row; stop();
          // Only this freshly applied claim continuation may create. Replays only read.
          if(claim.createAuthorized) {
            const uploadBytes=new Uint8Array(await file.arrayBuffer());
            await boundary(()=>api.create(name,uploadBytes));
          }
          existing=await boundary(()=>api.find(name));
          if(!existing)throw new Error('Unklarer Uploadausgang. Original noch nicht auffindbar.');
        }
        await verify(existing,info,row.ref); stop();
        const ref:DocumentRef={...info,provider:'sharepoint',siteCollectionId:SHAREPOINT_TARGET.siteCollectionId,webId:SHAREPOINT_TARGET.webId,libraryId:SHAREPOINT_TARGET.libraryId,
          itemId:existing.itemId,version:existing.version,connectorIdentifier:existing.connectorIdentifier,
          webUrl:`${SHAREPOINT_TARGET.siteUrl}${SHAREPOINT_TARGET.folder}/${encodeURIComponent(name)}`};
        if(row.status!=='linked')await boundary(()=>store.link({...row,ref}));
        return ref;
      } finally { activeUploads.delete(uploadId); }
    },
    async getOriginal(ref) {
      if(ref.provider!=='sharepoint'||ref.siteCollectionId!==SHAREPOINT_TARGET.siteCollectionId||ref.webId!==SHAREPOINT_TARGET.webId||ref.libraryId!==SHAREPOINT_TARGET.libraryId)throw new Error('Originalziel ungültig.');
      const file=await boundary(()=>api.read(ref));await verify(file,ref,ref);
      const original=new File([new Uint8Array(file.bytes)],ref.originalName,{type:ref.mimeType});
      await validateOriginal(original);
      return original;
    },
    async loadUpload(uploadId) {
      const row=(await list()).documents.find(row=>row.uploadId===uploadId);
      if(!row)throw new Error('Upload nicht gefunden.');
      const existing=await boundary(()=>api.find(originalStorageName(row)));
      if(existing){await verify(existing,row,row.ref);return row.status==='linked'?'linked':'uploaded-unlinked';}
      if(row.status==='linked')throw new Error('Verknüpftes Original fehlt oder ist nicht zugänglich.');
      return row.status;
    },
    saveDraft: value=>boundary(()=>store.saveDraft(value)),
  };
}
