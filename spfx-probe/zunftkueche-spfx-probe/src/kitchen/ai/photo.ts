// Fotos vom Telefon passend machen, bevor sie zur KI gehen.
// Stand der Anbieter-Dokumentation vom November 2026: gelesen wird bis 2.576 Pixel an der langen Kante,
// größere Bilder verkleinert der Anbieter selbst, über 8.000 Pixel oder 10 MB (Base64) lehnt er ab.
// Ein Telefonfoto mit 24 oder 48 Megapixeln liegt darüber. Verkleinert wird deshalb hier, genau auf die lesbare Größe.
import type { AiFile } from './provider';

export const MAX_EDGE = 2576;
/** Rohgröße, ab der auch ein kleines Bild neu gepackt wird: 5 MB sind als Base64 rund 6,7 MB. */
export const MAX_BYTES = 5 * 1024 * 1024;
const DIRECT = /^image\/(jpeg|png|webp|gif)$/;

export interface PhotoFit {
  file: AiFile;
  /** Leer, wenn die Datei unverändert bleibt. Sonst ein Satz für die Anzeige. */
  note: string;
}

/** Zielgröße: lange Kante höchstens `maxEdge`, Seitenverhältnis bleibt. */
export function targetSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > maxEdge)) return { width, height };
  const scale = maxEdge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Muss dieses Bild vor dem Senden umgerechnet werden? */
export function needsFit(mediaType: string, bytes: number, width: number, height: number): boolean {
  return !DIRECT.test(mediaType) || bytes > MAX_BYTES || Math.max(width, height) > MAX_EDGE;
}

function loadImage(doc: Document, url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = doc.createElement('img');
    // Meldet sich der Browser gar nicht, soll die Seite nicht hängen bleiben.
    const timer = setTimeout(() => reject(new Error('Bild lässt sich nicht öffnen.')), 15000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Bild lässt sich nicht öffnen.'));
    };
    image.src = url;
  });
}

/**
 * Verkleinert ein Foto auf die Größe, die das Modell wirklich liest, und packt es als JPEG.
 * PDF und Bilder, die schon passen, bleiben unverändert. Schlägt das Umrechnen fehl, bleibt die Datei, wie sie ist:
 * dann meldet der Anbieter den Grund.
 */
export async function fitPhoto(file: AiFile, doc: Document): Promise<PhotoFit> {
  if (!file.mediaType.startsWith('image/')) return { file, note: '' };
  const win = doc.defaultView;
  if (!win || typeof win.URL?.createObjectURL !== 'function') return { file, note: '' };
  const url = win.URL.createObjectURL(new Blob([file.bytes], { type: file.mediaType }));
  try {
    const image = await loadImage(doc, url);
    const width = image.naturalWidth,
      height = image.naturalHeight;
    if (!width || !height || !needsFit(file.mediaType, file.bytes.length, width, height)) return { file, note: '' };
    const size = targetSize(width, height);
    const canvas = doc.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return { file, note: '' };
    // Weißer Grund: durchsichtige Stellen würden im JPEG sonst schwarz.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size.width, size.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return { file, note: '' };
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return {
      file: { name: file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', mediaType: 'image/jpeg', bytes },
      note:
        size.width === width && size.height === height
          ? 'neu gepackt als JPEG'
          : 'verkleinert von ' + width + ' × ' + height + ' auf ' + size.width + ' × ' + size.height
    };
  } catch {
    return { file, note: '' };
  } finally {
    win.URL.revokeObjectURL(url);
  }
}
