// Satz der Karte nach dem Zunft-System: einmal berechnet, gleich gezeichnet als PDF und als Vorschau (SVG).
// Montserrat in feinen Schnitten, Rubriken in gesperrten Versalien, feine Linien, Wappen oben mittig. Keine Flächen, keine Schatten.
// Maße in Punkt, A4 hoch, y von oben nach unten.
import type { MenuCard, MenuLine } from './ww/model';
import { MENU_SECTIONS, formatPrice } from './menu-card.ts';
import { MONTSERRAT } from './menu-font-metrics.ts';
import { pdfBytes } from './pdf-document.ts';

export type Weight = 200 | 300 | 400;
export type MenuOp =
  | { t: 'text'; x: number; y: number; size: number; weight: Weight; color: string; spacing: number; value: string }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { t: 'image'; x: number; y: number; width: number; height: number };

export const PAGE = { width: 595, height: 842 };
/** Farben aus dem Zunft-System (Thema Papier). */
export const COLOR = { ink: '#20234B', muted: '#585A78', accent: '#3F4695', line: '#CFD1E5' };
const SIDE = 54,
  LEFT = SIDE,
  RIGHT = PAGE.width - SIDE;
/** Spalten in pt, gleich in Word (×20 = Twips): Nr., Bezeichnung, Größe, Abstand, Weingut, Preis. */
export const COLUMNS = [22, 251, 36, 14, 112, 52];
const at = (i: number): number => LEFT + COLUMNS.slice(0, i).reduce((a, b) => a + b, 0);
const BOTTOM = 30;

/** Breite eines Textes in pt, mit Sperrung zwischen den Zeichen (nicht nach dem letzten). */
export function measure(value: string, size: number, weight: Weight, spacing = 0): number {
  const widths = MONTSERRAT[weight].widths;
  const codes = pdfBytes(value);
  let units = 0;
  for (const c of codes) units += c >= 32 ? widths[c - 32] || 0 : 0;
  return (units * size) / 1000 + spacing * Math.max(0, codes.length - 1);
}
/** Untertitel ohne die Striche der alten Vorlage („-Staufener Zunftabend 2027-“). */
export function displayTitle(title: string): string {
  return title.trim().replace(/^[-–\s]+|[-–\s]+$/g, '');
}
const caps = (value: string): string => value.toLocaleUpperCase('de-DE');

function wrapText(value: string, max: number, size: number, weight: Weight): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const next = current ? current + ' ' + word : word;
    if (current && measure(next, size, weight) > max) {
      out.push(current);
      current = word;
    } else current = next;
  }
  return current ? [...out, current] : out.length ? out : [''];
}

interface Block {
  height: number;
  /** Abstand davor, entfällt oben auf einer neuen Seite. */
  gap?: number;
  /** Rubrikköpfe bleiben bei ihrer ersten Zeile. */
  keepWithNext?: boolean;
  draw(top: number, ops: MenuOp[]): void;
}

/** Berechnet alle Seiten. `wappen` ist das Seitenverhältnis des Wappens (Breite/Höhe) oder null ohne Bild. */
export function layoutMenu(card: MenuCard, wappen: number | null): MenuOp[][] {
  const blocks: Block[] = [];
  const text = (
    ops: MenuOp[],
    x: number,
    y: number,
    value: string,
    size: number,
    weight: Weight,
    color = COLOR.ink,
    spacing = 0
  ): void => {
    if (value) ops.push({ t: 'text', x, y, size, weight, color, spacing, value });
  };
  const right = (ops: MenuOp[], edge: number, y: number, value: string, size: number, weight: Weight, color?: string) =>
    text(ops, edge - measure(value, size, weight), y, value, size, weight, color);
  const center = (ops: MenuOp[], y: number, value: string, size: number, weight: Weight, color?: string, spacing = 0) =>
    text(ops, (PAGE.width - measure(value, size, weight, spacing)) / 2, y, value, size, weight, color, spacing);
  const shortLine = (ops: MenuOp[], y: number) =>
    ops.push({
      t: 'line',
      x1: PAGE.width / 2 - 18,
      y1: y,
      x2: PAGE.width / 2 + 18,
      y2: y,
      color: COLOR.ink,
      width: 0.75
    });

  // Kopf: Wappen, gesperrter Name, Titel in ExtraLight, kurze Linie.
  const title = displayTitle(card.title);
  const wappenHeight = wappen ? 62 : 0;
  blocks.push({
    height: (wappen ? wappenHeight + 14 : 0) + 18 + (title ? 30 : 0) + 26,
    draw: (top, ops) => {
      let y = top;
      if (wappen) {
        const w = wappenHeight * wappen;
        ops.push({ t: 'image', x: (PAGE.width - w) / 2, y, width: w, height: wappenHeight });
        y += wappenHeight + 14;
      }
      center(ops, y + 7, 'SCHELMENZUNFT STAUFEN', 7.5, 400, COLOR.ink, 2.4);
      y += 18;
      if (title) {
        center(ops, y + 21, title, 23, 200);
        y += 30;
      }
      shortLine(ops, y + 8);
    }
  });

  for (const s of MENU_SECTIONS) {
    const lines = card.lines.filter(l => l.section === s.id);
    if (!lines.length) continue;
    blocks.push({
      height: 16 + (s.subtitle ? 11 : 0) + 4,
      gap: blocks.length > 1 ? 16 : 0,
      keepWithNext: true,
      draw: (top, ops) => {
        text(ops, LEFT, top + 12, caps(s.title), 6.5, 400, COLOR.accent, 2.1);
        if (s.subtitle) text(ops, LEFT, top + 23, s.subtitle, 7.5, 300, COLOR.muted);
      }
    });
    lines.forEach((l, i) => blocks.push(row(l, i === lines.length - 1)));
  }

  function row(l: MenuLine, last: boolean): Block {
    const labelMax = (l.size ? COLUMNS[1] : COLUMNS[1] + COLUMNS[2]) - 8;
    const label = wrapText(l.label, labelMax, 9, 300);
    const height = 14 + (label.length - 1) * 11 + (l.detail ? 8 : 0);
    return {
      height,
      draw: (top, ops) => {
        const y = top + 9.8;
        if (l.number) text(ops, at(0), y, l.number, 9, 400, COLOR.muted);
        label.forEach((part, i) => text(ops, at(1), y + i * 11, part, 9, 300));
        if (l.detail) text(ops, at(1), y + (label.length - 1) * 11 + 8, l.detail, 6.5, 300, COLOR.muted);
        if (l.size) right(ops, at(3) - 8, y, l.size, 9, 300, COLOR.muted);
        if (l.producer) text(ops, at(4), y, l.producer, 9, 300, COLOR.muted);
        if (l.priceGross !== null) right(ops, RIGHT, y, formatPrice(l.priceGross) + ' €', 9, 400);
        if (!last)
          ops.push({
            t: 'line',
            x1: LEFT,
            y1: top + height,
            x2: RIGHT,
            y2: top + height,
            color: COLOR.line,
            width: 0.5
          });
      }
    };
  }

  const footer = card.footer
    .split(/\r?\n/)
    .map(t => t.trim())
    .filter(Boolean);
  const footerHeight = footer.length ? 16 + footer.length * 10.5 : 0;

  // Seiten füllen. Ein Rubrikkopf wandert mit seiner ersten Zeile auf die nächste Seite.
  const top = 34;
  const pages: MenuOp[][] = [[]];
  let y = top;
  const limit = (isLast: boolean): number => PAGE.height - BOTTOM - (isLast ? footerHeight : 12);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const lastBlock = i === blocks.length - 1;
    const need = (b.gap || 0) + b.height + (b.keepWithNext && blocks[i + 1] ? blocks[i + 1].height : 0);
    if (y + need > limit(lastBlock) && y > top) {
      pages.push([]);
      y = top;
    } else y += b.gap || 0;
    b.draw(y, pages[pages.length - 1]);
    y += b.height;
  }
  if (footer.length) {
    if (y > PAGE.height - BOTTOM - footerHeight) pages.push([]);
    const ops = pages[pages.length - 1];
    const first = PAGE.height - BOTTOM - (footer.length - 1) * 10.5;
    shortLine(ops, first - 14);
    footer.forEach((t, i) => center(ops, first + i * 10.5, t, 7, 300, COLOR.muted));
  }
  if (pages.length > 1)
    pages.forEach((ops, i) => center(ops, PAGE.height - 12, i + 1 + ' / ' + pages.length, 6.5, 300, COLOR.muted));
  return pages;
}
