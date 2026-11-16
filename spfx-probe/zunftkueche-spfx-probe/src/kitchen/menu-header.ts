// Kopfbild der Karte im Browser zusammensetzen: Wappen aus der Vorlage plus Untertitel mit dem aktuellen Jahr.
// Schrift Montserrat liegt in der App (menu-assets), kein Abruf von außen.
import type { HeaderImage } from './menu-export';

const WIDTH = 1200,
  HEIGHT = 292,
  LEFT = 329,
  BASELINE = 223;

async function bytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}
function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Kopfbild konnte nicht erzeugt werden.'))), type, quality)
  );
}
async function loadImage(doc: Document, url: string): Promise<HTMLImageElement> {
  const image = doc.createElement('img');
  image.src = url;
  await image.decode();
  return image;
}
/** PNG für Word, JPEG für PDF. Ohne Bild (z. B. alter Browser) wird die Karte ohne Kopf erzeugt. */
export async function menuHeader(
  doc: Document,
  title: string
): Promise<{ png: HeaderImage; jpeg: HeaderImage } | null> {
  try {
    const image = await loadImage(doc, new URL('./menu-assets/kopf-ohne-jahr.png', import.meta.url).href);
    const family = 'ZKMontserrat';
    try {
      const face = new FontFace(
        family,
        'url(' + new URL('./menu-assets/montserrat-400.woff2', import.meta.url).href + ')',
        {
          weight: '400'
        }
      );
      await face.load();
      (doc.fonts as unknown as { add(face: FontFace): void }).add(face);
    } catch {
      /* Ersatzschrift aus der Seite */
    }
    const canvas = doc.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.drawImage(image, 0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 28px ${family}, Montserrat, Archivo, Arial, sans-serif`;
    let x = LEFT;
    for (const ch of title) {
      ctx.fillText(ch, x, BASELINE);
      x += ctx.measureText(ch).width + 1.2;
    }
    return {
      png: { bytes: await bytes(await canvasBlob(canvas, 'image/png')), width: WIDTH, height: HEIGHT },
      jpeg: { bytes: await bytes(await canvasBlob(canvas, 'image/jpeg', 0.92)), width: WIDTH, height: HEIGHT }
    };
  } catch {
    return null;
  }
}
