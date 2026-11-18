// Kleiner PDF-Baukasten: PDF 1.4, eingebaute Schriften Helvetica und Helvetica-Bold, WinAnsi-Zeichen.
// Kein Netz, kein fremder Dienst. Genutzt für Bestellungen und den Abendabschluss auf Papier.
// Die Karte bettet zusätzlich Montserrat als TrueType ein (pdfDocument, Parameter trueType).
import type { FontMetrics } from './menu-font-metrics';

/** Zeichen auf WinAnsi abbilden. Nicht darstellbare Zeichen werden zu „?“. */
export function pdfBytes(value: string): Uint8Array {
  return Uint8Array.from(
    [...value].map(c =>
      c === '€'
        ? 128
        : c === '–'
          ? 150
          : c === '—'
            ? 151
            : c === '·'
              ? 183
              : c.charCodeAt(0) < 256
                ? c.charCodeAt(0)
                : 63
    )
  );
}
/** Text für einen PDF-Textbefehl absichern. */
export function pdfLiteral(value: string): string {
  return value
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
/** Bricht Text nach höchstens `size` Zeichen je Zeile um, überlange Wörter werden geteilt. */
export function wrap(text: string, size: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.replace(/\s+/g, ' ').split(' ')) {
    if ((current + ' ' + word).trim().length > size && current) {
      lines.push(current);
      current = '';
    }
    let rest = word;
    while (rest.length > size) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(rest.slice(0, size));
      rest = rest.slice(size);
    }
    current = (current + ' ' + rest).trim();
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/** Eine Seite als Folge von Zeichenbefehlen. */
export class PdfPage {
  public stream = '';
  public text(x: number, y: number, value: string, size = 9, bold = false): void {
    this.stream += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfLiteral(value)}) Tj ET\n`;
  }
  /** Schräg gestellte Helvetica (F3). */
  public italic(x: number, y: number, value: string, size = 9): void {
    this.stream += `BT /F3 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfLiteral(value)}) Tj ET\n`;
  }
  /** Bild an Position zeichnen; das Bild wird bei pdfDocument mitgegeben. */
  public image(name: string, x: number, y: number, width: number, height: number): void {
    this.stream += `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q\n`;
  }
  /** Gefülltes Rechteck in Grauwerten oder RGB 0..1. */
  public box(x: number, y: number, width: number, height: number, rgb: [number, number, number]): void {
    this.stream += `${rgb.join(' ')} rg ${x} ${y} ${width} ${height} re f 0 0 0 rg\n`;
  }
  /** Rahmen ohne Füllung, z. B. als Schreibfeld. */
  public frame(x: number, y: number, width: number, height: number, gray = 0.55): void {
    this.stream += `${gray} ${gray} ${gray} RG ${x} ${y} ${width} ${height} re S\n`;
  }
  public line(x1: number, y1: number, x2: number, y2: number, gray = 0.85): void {
    this.stream += `${gray} ${gray} ${gray} RG ${x1} ${y1} m ${x2} ${y2} l S\n`;
  }
  public raw(command: string): void {
    this.stream += command;
  }
}

/** JPEG-Bild für pdfDocument; wird unverändert eingebettet. */
export interface PdfImage {
  name: string;
  jpeg: Uint8Array;
  width: number;
  height: number;
}
/** TrueType-Schrift mit WinAnsi-Kodierung, Breiten für die Zeichen 32 bis 255 in 1/1000 em. */
export interface PdfTrueType {
  key: string;
  metrics: FontMetrics;
  file: Uint8Array | null;
}
/** Setzt die Seiten zu einer PDF-Datei zusammen. Querformat A4 ist 842 × 595, Hochformat 595 × 842. */
export function pdfDocument(
  pages: string[],
  width = 842,
  height = 595,
  images: PdfImage[] = [],
  trueType: PdfTrueType[] = []
): Uint8Array {
  const objects: Array<string | Uint8Array[]> = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  // Schräge Schrift und Bilder nur, wenn sie gebraucht werden: bestehende Dokumente bleiben bytegleich.
  const italic = pages.some(p => p.includes('/F3 '));
  const fonts = '/F1 3 0 R /F2 4 0 R' + (italic ? ' /F3 5 0 R' : '');
  if (italic) objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');
  const xobjects = images.map(image => {
    const id = objects.length;
    objects.push([
      pdfBytes(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpeg.length} >>\nstream\n`
      ),
      image.jpeg,
      pdfBytes('\nendstream')
    ]);
    return '/' + image.name + ' ' + id + ' 0 R';
  });
  // Eingebettete TrueType-Schriften (Karte in Montserrat). Ohne Datei bleibt die Schrift nur benannt, mit denselben Breiten.
  const embedded = trueType.map(font => {
    const m = font.metrics;
    let descriptor = `<< /Type /FontDescriptor /FontName /ZKAAAA+${m.name} /Flags 32 /FontBBox [${m.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${m.ascent} /Descent ${m.descent} /CapHeight ${m.capHeight} /StemV 80`;
    if (font.file) {
      const fileId = objects.length;
      objects.push([
        pdfBytes(`<< /Length ${font.file.length} /Length1 ${font.file.length} >>\nstream\n`),
        font.file,
        pdfBytes('\nendstream')
      ]);
      descriptor += ` /FontFile2 ${fileId} 0 R`;
    }
    const descriptorId = objects.length;
    objects.push(descriptor + ' >>');
    const id = objects.length;
    objects.push(
      `<< /Type /Font /Subtype /TrueType /BaseFont /${font.file ? 'ZKAAAA+' : ''}${m.name} /FirstChar 32 /LastChar 255 /Widths [${m.widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptorId} 0 R >>`
    );
    return '/' + font.key + ' ' + id + ' 0 R';
  });
  const resources = `<< /Font << ${[fonts, ...embedded].join(' ')} >>${xobjects.length ? ' /XObject << ' + xobjects.join(' ') + ' >>' : ''} >>`;
  const kids: number[] = [];
  for (const content of pages) {
    const id = objects.length;
    kids.push(id);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${resources} /Contents ${id + 1} 0 R >>`
    );
    objects.push(`<< /Length ${pdfBytes(content).length} >>\nstream\n${content}endstream`);
  }
  objects[2] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(n => n + ' 0 R').join(' ')}] >>`;
  const chunks: Uint8Array[] = [pdfBytes('%PDF-1.4\n%âãÏÓ\n')];
  let length = chunks[0].length;
  const push = (chunk: Uint8Array): void => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(length);
    const body = objects[i];
    push(pdfBytes(`${i} 0 obj\n`));
    if (typeof body === 'string') push(pdfBytes(body));
    else body.forEach(push);
    push(pdfBytes('\nendobj\n'));
  }
  const xref = length;
  push(
    pdfBytes(
      `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map(n => String(n).padStart(10, '0') + ' 00000 n \n')
          .join('') +
        `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    )
  );
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

// Zeichenbreiten der Helvetica in 1/1000 em (Adobe-Metrik), für Rechtsbündiges und Zentriertes.
const HELVETICA: Record<string, number> = {
  ' ': 278,
  '!': 278,
  '"': 355,
  '#': 556,
  $: 556,
  '%': 889,
  '&': 667,
  "'": 191,
  '(': 333,
  ')': 333,
  '*': 389,
  '+': 584,
  ',': 278,
  '-': 333,
  '.': 278,
  '/': 278,
  ':': 278,
  ';': 278,
  '<': 584,
  '=': 584,
  '>': 584,
  '?': 556,
  '@': 1015,
  A: 667,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 722,
  I: 278,
  J: 500,
  K: 667,
  L: 556,
  M: 833,
  N: 722,
  O: 778,
  P: 667,
  Q: 778,
  R: 722,
  S: 667,
  T: 611,
  U: 722,
  V: 667,
  W: 944,
  X: 667,
  Y: 667,
  Z: 611,
  '[': 278,
  '\\': 278,
  ']': 278,
  '^': 469,
  _: 556,
  '`': 333,
  a: 556,
  b: 556,
  c: 500,
  d: 556,
  e: 556,
  f: 278,
  g: 556,
  h: 556,
  i: 222,
  j: 222,
  k: 500,
  l: 222,
  m: 833,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  r: 333,
  s: 500,
  t: 278,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 500,
  '{': 334,
  '|': 260,
  '}': 334,
  '~': 584,
  ä: 556,
  ö: 556,
  ü: 556,
  Ä: 667,
  Ö: 778,
  Ü: 722,
  ß: 611,
  '€': 556,
  '–': 556,
  '·': 278,
  é: 556,
  è: 556,
  à: 556
};
/** Breite eines Textes in Punkt; fette Schrift etwas breiter angenähert. */
export function textWidth(value: string, size: number, bold = false): number {
  const units = [...value].reduce((sum, c) => sum + (HELVETICA[c] ?? (/\d/.test(c) ? 556 : 556)), 0);
  return (units * size * (bold ? 1.06 : 1)) / 1000;
}
