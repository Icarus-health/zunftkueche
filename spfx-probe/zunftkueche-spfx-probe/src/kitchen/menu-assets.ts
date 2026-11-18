// Mitgelieferte Dateien der Karte laden: Wappen und Montserrat. Liegen im Paket, kein Abruf von außen.
import type { MenuAssets, MenuImage } from './menu-export';

/** Wappen allein, Zunftblau, aus der Gruppe Logos des Design-Systems (186 × 420 px). */
export const WAPPEN = {
  png: new URL('./menu-assets/wappen-blau.png', import.meta.url).href,
  jpeg: new URL('./menu-assets/wappen-blau.jpg', import.meta.url).href,
  width: 186,
  height: 420
};
const FONTS = {
  200: new URL('./menu-assets/montserrat-200.ttf', import.meta.url).href,
  300: new URL('./menu-assets/montserrat-300.ttf', import.meta.url).href,
  400: new URL('./menu-assets/montserrat-400.ttf', import.meta.url).href
};

async function bytes(href: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(href);
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
const image = (data: Uint8Array | null): MenuImage | null =>
  data ? { bytes: data, width: WAPPEN.width, height: WAPPEN.height } : null;

let cached: Promise<MenuAssets> | undefined;
/** Einmal je Sitzung. Fehlt eine Datei, wird die Karte ohne sie erzeugt (Wappen fehlt bzw. Schrift nur benannt). */
export function loadMenuAssets(): Promise<MenuAssets> {
  cached ??= (async () => {
    const [png, jpeg, f200, f300, f400] = await Promise.all([
      bytes(WAPPEN.png),
      bytes(WAPPEN.jpeg),
      bytes(FONTS[200]),
      bytes(FONTS[300]),
      bytes(FONTS[400])
    ]);
    const fonts: MenuAssets['fonts'] = {};
    if (f200) fonts[200] = f200;
    if (f300) fonts[300] = f300;
    if (f400) fonts[400] = f400;
    return { fonts, wappenPng: image(png), wappenJpeg: image(jpeg) };
  })();
  return cached;
}
