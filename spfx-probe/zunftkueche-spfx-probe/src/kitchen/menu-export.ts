// Karte zum Ausdrucken: Word (.docx) und PDF im Aufbau der Vorlage „Preislistezunft25 neues Design“.
// Arial bzw. Helvetica, blaue Rubrikbalken (A6C9EC), Kopfbild mit Wappen und Jahr, Hinweis unten zentriert.
import type { MenuCard, MenuLine } from './ww/model';
import { MENU_SECTIONS, formatPrice } from './menu-card.ts';
import { zip } from './zip.ts';
import { PdfPage, pdfDocument, textWidth } from './pdf-document.ts';

export interface HeaderImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}
/** Spaltenbreiten in Twips: Nr., Bezeichnung, Größe, Abstand, Weingut, Preis, €. */
const COLS = [434, 4473, 779, 207, 2220, 820, 263];
const SHADE = 'A6C9EC';
const xml = (v: string): string =>
  v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function run(text: string, opts: { b?: boolean; i?: boolean; sz?: number } = {}): string {
  if (!text) return '';
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${opts.b ? '<w:b/><w:bCs/>' : ''}${opts.i ? '<w:i/><w:iCs/>' : ''}<w:color w:val="000000"/><w:sz w:val="${opts.sz ?? 22}"/><w:szCs w:val="${opts.sz ?? 22}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}
const para = (runs: string, jc = 'left'): string =>
  `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${jc === 'left' ? '' : `<w:jc w:val="${jc}"/>`}</w:pPr>${runs}</w:p>`;
function cell(cols: number[], content: string, opts: { shade?: boolean; jc?: string; noWrap?: boolean } = {}): string {
  const width = cols.reduce((a, b) => a + COLS[b], 0);
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${cols.length > 1 ? `<w:gridSpan w:val="${cols.length}"/>` : ''}<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="${opts.shade ? SHADE : 'auto'}"/>${opts.noWrap ? '<w:noWrap/>' : ''}<w:vAlign w:val="center"/></w:tcPr>${content || para('')}</w:tc>`;
}
const row = (height: number, cells: string, exact = false): string =>
  `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${height}"${exact ? ' w:hRule="exact"' : ''}/><w:jc w:val="center"/></w:trPr>${cells}</w:tr>`;
const tiny = `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:rPr><w:sz w:val="8"/></w:rPr></w:pPr></w:p>`;
const spacer = (): string =>
  row(110, cell([0], tiny) + cell([1, 2], tiny) + cell([3], tiny) + cell([4, 5, 6], tiny), true);

function lineRow(l: MenuLine, tall: boolean): string {
  const name = para(run(l.label)) + (l.detail ? para(run(l.detail, { i: true, sz: 14 })) : '');
  return row(
    tall ? 400 : l.detail ? 380 : 290,
    cell([0], para(run(l.number), 'center')) +
      cell([1], name) +
      cell([2], para(run(l.size), 'right'), { noWrap: true }) +
      cell([3], '') +
      cell([4], para(run(l.producer))) +
      cell([5], para(run(l.priceGross === null ? '' : formatPrice(l.priceGross)), 'right'), { noWrap: true }) +
      cell([6], para(run(l.priceGross === null ? '' : '€'), 'right'))
  );
}

function documentXml(card: MenuCard, header: HeaderImage | null): string {
  const rows: string[] = [];
  let first = true;
  for (const s of MENU_SECTIONS) {
    const lines = card.lines.filter(l => l.section === s.id);
    if (!lines.length) continue;
    if (!first) rows.push(spacer());
    rows.push(
      row(
        420,
        cell([0], para(run(first && s.numbered ? 'Nr.' : ''), 'center')) +
          cell([1, 2], para(run(s.title + ' ', { b: true, sz: 24 }) + run(s.subtitle, { i: true })), { shade: true }) +
          cell([3], tiny) +
          cell([4, 5, 6], tiny, { shade: true })
      )
    );
    rows.push(spacer());
    for (const l of lines) rows.push(lineRow(l, s.numbered));
    first = false;
  }
  const cx = 5979945,
    cy = header ? Math.round((cx * header.height) / header.width) : 0;
  const picture = header
    ? `<w:p><w:pPr><w:spacing w:after="240"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Kopf"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="kopf.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdKopf"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    : '';
  const footer = card.footer
    .split(/\r?\n/)
    .filter(t => t.trim())
    .map(
      (t, i) =>
        `<w:p><w:pPr><w:spacing w:before="${i ? 0 : 240}" w:after="0"/><w:jc w:val="center"/></w:pPr>${run(t.trim(), { i: true, sz: 18 })}</w:p>`
    )
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' +
    picture +
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${COLS.map(c => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>` +
    footer +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="454" w:right="720" w:bottom="340" w:left="720" w:header="680" w:footer="227" w:gutter="0"/><w:cols w:space="708"/><w:vAlign w:val="center"/></w:sectPr></w:body></w:document>'
  );
}

/** Word-Datei der Karte. Kopfbild als PNG. */
export function menuDocx(card: MenuCard, header: HeaderImage | null): Uint8Array {
  const entries = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    },
    {
      name: 'docProps/core.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(card.name)}</dc:title><dc:creator>Zunftküche</dc:creator></cp:coreProperties>`
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${header ? '<Relationship Id="rIdKopf" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/kopf.png"/>' : ''}</Relationships>`
    },
    {
      name: 'word/styles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style></w:styles>'
    },
    { name: 'word/document.xml', data: documentXml(card, header) },
    ...(header ? [{ name: 'word/media/kopf.png', data: header.bytes }] : [])
  ];
  return zip(entries);
}

/** PDF der Karte, A4 hoch, Inhalt senkrecht mittig wie in der Vorlage. Kopfbild als JPEG. */
export function menuPdf(card: MenuCard, header: HeaderImage | null): Uint8Array {
  const pt = (twips: number): number => twips / 20;
  const widths = COLS.map(pt),
    tableWidth = widths.reduce((a, b) => a + b, 0),
    left = (595 - tableWidth) / 2;
  const x = widths.map((_, i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const pad = 3.5;
  const fit = (text: string, max: number, size: number): string[] => {
    const out: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = current ? current + ' ' + word : word;
      if (current && textWidth(next, size) > max) {
        out.push(current);
        current = word;
      } else current = next;
    }
    return current ? [...out, current] : out.length ? out : [''];
  };
  type Item = { height: number; draw: (page: PdfPage, top: number) => void };
  const items: Item[] = [];
  const imageWidth = 470.9,
    imageHeight = header ? (imageWidth * header.height) / header.width : 0;
  if (header)
    items.push({
      height: imageHeight + 12,
      draw: (page, top) => page.image('Kopf', (595 - imageWidth) / 2, top - imageHeight, imageWidth, imageHeight)
    });
  const baseline = (top: number, height: number, size: number): number => top - height / 2 - size * 0.35;
  let first = true;
  for (const s of MENU_SECTIONS) {
    const lines = card.lines.filter(l => l.section === s.id);
    if (!lines.length) continue;
    if (!first) items.push({ height: 6, draw: () => undefined });
    const showNr = first && s.numbered;
    items.push({
      height: 22,
      draw: (page, top) => {
        page.box(x[1], top - 22, widths[1] + widths[2], 22, [0xa6 / 255, 0xc9 / 255, 0xec / 255]);
        page.box(x[4], top - 22, widths[4] + widths[5] + widths[6], 22, [0xa6 / 255, 0xc9 / 255, 0xec / 255]);
        if (showNr) page.text(x[0] + (widths[0] - textWidth('Nr.', 11)) / 2, baseline(top, 22, 11) - 4, 'Nr.', 11);
        page.text(x[1] + pad, baseline(top, 22, 12), s.title, 12, true);
        if (s.subtitle)
          page.italic(x[1] + pad + textWidth(s.title + ' ', 12, true), baseline(top, 22, 12), s.subtitle, 11);
      }
    });
    items.push({ height: 6, draw: () => undefined });
    for (const l of lines) {
      const labelLines = fit(l.label, (l.size ? widths[1] : widths[1] + widths[2]) - 2 * pad, 11);
      const height = Math.max(s.numbered ? 20 : 14.5, labelLines.length * 13 + (l.detail ? 9 : 0) + 2);
      items.push({
        height,
        draw: (page, top) => {
          const y = baseline(top, height, 11) + ((labelLines.length - 1) * 13 + (l.detail ? 9 : 0)) / 2;
          if (l.number) page.text(x[0] + (widths[0] - textWidth(l.number, 11)) / 2, y, l.number, 11);
          labelLines.forEach((part, i) => page.text(x[1] + pad, y - i * 13, part, 11));
          if (l.detail) page.italic(x[1] + pad, y - labelLines.length * 13 + 4, l.detail, 7);
          if (l.size) page.text(x[2] + widths[2] - pad - textWidth(l.size, 11), y, l.size, 11);
          if (l.producer) page.text(x[4] + pad, y, l.producer, 11);
          if (l.priceGross !== null) {
            const p = formatPrice(l.priceGross);
            page.text(x[5] + widths[5] - pad - textWidth(p, 11), y, p, 11);
            page.text(x[6] + widths[6] - pad - textWidth('€', 11), y, '€', 11);
          }
        }
      });
    }
    first = false;
  }
  const footer = card.footer.split(/\r?\n/).filter(t => t.trim());
  if (footer.length)
    items.push({
      height: 14 + footer.length * 11,
      draw: (page, top) =>
        footer.forEach((t, i) => {
          const value = t.trim();
          page.italic((595 - textWidth(value, 9)) / 2, top - 14 - i * 11, value, 9);
        })
    });
  // Seiten füllen; ein einseitiges Ergebnis wird wie in der Vorlage senkrecht mittig gesetzt.
  const usable = 842 - pt(454) - pt(340);
  const pages: Item[][] = [[]];
  let used = 0;
  for (const item of items) {
    if (used + item.height > usable && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(item);
    used += item.height;
  }
  const streams = pages.map((list, index) => {
    const page = new PdfPage();
    const total = list.reduce((a, b) => a + b.height, 0);
    let top = pages.length === 1 ? 842 - pt(454) - (usable - total) / 2 : 842 - pt(454);
    for (const item of list) {
      item.draw(page, top);
      top -= item.height;
    }
    if (pages.length > 1) page.text(540, 18, index + 1 + '/' + pages.length, 7);
    return page.stream;
  });
  return pdfDocument(
    streams,
    595,
    842,
    header ? [{ name: 'Kopf', jpeg: header.bytes, width: header.width, height: header.height }] : []
  );
}
