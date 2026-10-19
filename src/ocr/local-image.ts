import type {RecognitionEngine} from './engine.ts';
export const localImageEngine:RecognitionEngine={async extract(){throw new Error('Bilderkennung ist im Microsoft-Host nicht freigegeben. Original manuell prüfen.');}};
