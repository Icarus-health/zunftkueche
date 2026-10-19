import type {RecognitionEngine} from './engine.ts';
// Local Node preflight is not proof of a cancellable engine in the Microsoft host.
export const localTextEngine:RecognitionEngine={async extract(){throw new Error('PDF-Texterkennung ist im Microsoft-Host nicht freigegeben. Original manuell prüfen oder Text ausdrücklich einfügen.');}};
