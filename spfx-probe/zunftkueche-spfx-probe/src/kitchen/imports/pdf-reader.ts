import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs';
// SharePoint may serve .mjs assets in a way Teams cannot import as a worker.
// Bundle the matching handler with the reader and run it in the page instead.
(globalThis as typeof globalThis & { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorker;
/** The embedded Teams/browser surface may not provide a native PDF viewer. */
export async function renderPdfPreview(data: Uint8Array): Promise<{ image: string; pages: number }> {
  if (!data.length || data.length > 8 * 1024 * 1024) throw new Error('PDF bis 8 MB auswählen.');
  const task = getDocument({
    data: new Uint8Array(data),
    enableXfa: false,
    useSystemFonts: true,
    useWorkerFetch: false,
    stopAtErrors: true
  });
  try {
    const doc = await task.promise,
      page = await doc.getPage(1),
      base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: Math.min(2, 1600 / base.width, Math.sqrt(3000000 / (base.width * base.height)))
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Seitenvorschau nicht verfügbar.');
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    const image = canvas.toDataURL('image/png');
    page.cleanup();
    return { image, pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}
export async function readPdfText(data: Uint8Array): Promise<string> {
  if (!data.length || data.length > 8 * 1024 * 1024 || new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-')
    throw new Error('Bitte eine PDF-Datei bis 8 MB auswählen.');
  const task = getDocument({
    data: new Uint8Array(data),
    enableXfa: false,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    stopAtErrors: true
  });
  try {
    const doc = await task.promise;
    if (doc.numPages > 40) throw new Error('Bitte höchstens 40 PDF-Seiten je Beleg.');
    const pages: string[] = [];
    let size = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i),
        content = await page.getTextContent();
      let lastY: number | undefined,
        line = '';
      const lines: string[] = [];
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        if (lastY !== undefined && Math.abs(y - lastY) > 3) {
          lines.push(line);
          line = '';
        }
        line += (line ? ' ' : '') + item.str;
        lastY = y;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
          lastY = undefined;
        }
      }
      if (line) lines.push(line);
      const text = lines.join('\n');
      size += text.length;
      if (size > 200000) throw new Error('PDF-Text ist zu umfangreich. Bitte kleinere Belege verwenden.');
      pages.push('Seite ' + i + '\n' + text);
      page.cleanup();
    }
    const text = pages.join('\n\n');
    if (!text.replace(/Seite \d+/g, '').trim()) {
      const error = new Error(
        'Diese PDF enthält keinen lesbaren Text. Original kann angehängt werden; Angaben bitte manuell erfassen. Es wird kein kostenpflichtiger OCR-Dienst verwendet.'
      );
      error.name = 'PdfNoTextError';
      throw error;
    }
    return text;
  } finally {
    await task.destroy();
  }
}
