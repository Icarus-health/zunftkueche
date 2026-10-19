import type {DocumentRef} from '../data/documents.ts';
export interface ExtractionResult {
  provider: string; providerVersion: string; documentId: string | null;
  documentVersion: string | null; sha256: string | null;
  complete: boolean | null; pageCount: number | null;
  pages: Array<{page:number|null;text:string}>;
}
/** Extraction only proposes data. Implementations must never perform kitchen commits. */
export interface RecognitionEngine {
  extract(input:{document:DocumentRef;pages:number[];signal:AbortSignal}):Promise<ExtractionResult>;
}
export const recognitionAvailability={pdf:false,image:false,cloud:false,suppliedText:true} as const;
