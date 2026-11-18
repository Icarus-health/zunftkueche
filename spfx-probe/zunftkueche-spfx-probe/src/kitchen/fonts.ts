// Hausschrift der Zunft für die App: Montserrat Light, Regular, Medium (dazu ExtraLight für den Kartentitel in der Vorschau).
// Liegt im Paket und wird einmal je Seite angemeldet. Kein SemiBold oder Bold: angefragtes Fett fällt auf Medium.
const FACES: Array<[string, string]> = [
  ['200', new URL('./fonts/montserrat-200.woff2', import.meta.url).href],
  ['300', new URL('./fonts/montserrat-300.woff2', import.meta.url).href],
  ['400', new URL('./fonts/montserrat-400.woff2', import.meta.url).href],
  ['500', new URL('./fonts/montserrat-500.woff2', import.meta.url).href]
];
export const FAMILY = 'ZKMontserrat';

/** Meldet die Schrift im Dokument an. Ohne FontFace (sehr alte Browser) bleibt die Ersatzschrift. */
export function registerFonts(doc: Document): void {
  const fonts = doc.fonts as (FontFaceSet & { add(face: FontFace): void }) | undefined;
  const view = doc.defaultView as (Window & { FontFace?: typeof FontFace }) | null;
  if (!fonts || !view?.FontFace) return;
  const marker = doc.documentElement;
  if (marker.dataset.zkFonts) return;
  marker.dataset.zkFonts = 'true';
  for (const [weight, href] of FACES) {
    try {
      const face = new view.FontFace(FAMILY, `url(${href}) format('woff2')`, { weight, display: 'swap' });
      fonts.add(face);
      face.load().catch(() => undefined);
    } catch {
      /* Ersatzschrift */
    }
  }
}
