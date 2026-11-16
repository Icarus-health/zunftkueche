// Kleiner PDF-Baukasten: PDF 1.4, eingebaute Schriften Helvetica und Helvetica-Bold, WinAnsi-Zeichen.
// Kein Netz, kein fremder Dienst. Genutzt für Bestellungen und den Abendabschluss auf Papier.

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

/** Setzt die Seiten zu einer PDF-Datei zusammen. Querformat A4 ist 842 × 595, Hochformat 595 × 842. */
export function pdfDocument(pages: string[], width = 842, height = 595): Uint8Array {
  const objects: string[] = [
    '',
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ];
  const kids: number[] = [];
  for (const content of pages) {
    const id = objects.length;
    kids.push(id);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id + 1} 0 R >>`
    );
    objects.push(`<< /Length ${pdfBytes(content).length} >>\nstream\n${content}endstream`);
  }
  objects[2] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(n => n + ' 0 R').join(' ')}] >>`;
  let pdf = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(pdfBytes(pdf).length);
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdfBytes(pdf).length;
  pdf +=
    `xref\n0 ${objects.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map(n => String(n).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdfBytes(pdf);
}
