// Karte zum Ausdrucken nach dem Zunft-System: PDF aus demselben Satz wie die Vorschau, Word mit eingebetteter Montserrat.
// Wappen blau aus dem Design-System, gesperrte Rubriken in Zunftblau, feine Linien in Nebel, keine Farbflächen.
import type { MenuCard, MenuLine } from './ww/model';
import { MENU_SECTIONS, formatPrice } from './menu-card.ts';
import { zip } from './zip.ts';
import { pdfDocument, pdfLiteral } from './pdf-document.ts';
import type { PdfTrueType } from './pdf-document';
import { COLOR, COLUMNS, PAGE, displayTitle, layoutMenu } from './menu-layout.ts';
import type { Weight } from './menu-layout';
import { MONTSERRAT } from './menu-font-metrics.ts';

export interface MenuImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}
/** Mitgelieferte Dateien der Karte. Fehlt etwas, entsteht die Karte trotzdem: ohne Wappen bzw. mit nur benannter Schrift. */
export interface MenuAssets {
  fonts: Partial<Record<Weight, Uint8Array>>;
  wappenJpeg: MenuImage | null;
  wappenPng: MenuImage | null;
}
export const NO_ASSETS: MenuAssets = { fonts: {}, wappenJpeg: null, wappenPng: null };

const rgb = (hex: string): string => [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');

/** PDF der Karte, A4 hoch. */
export function menuPdf(card: MenuCard, given: MenuAssets | null = null): Uint8Array {
  const assets = given || NO_ASSETS;
  const wappen = assets.wappenJpeg;
  const pages = layoutMenu(card, wappen ? wappen.width / wappen.height : null);
  const H = PAGE.height;
  const streams = pages.map(ops =>
    ops
      .map(op => {
        if (op.t === 'text')
          return `BT /M${op.weight} ${op.size} Tf ${rgb(op.color)} rg ${op.spacing.toFixed(2)} Tc ${op.x.toFixed(2)} ${(H - op.y).toFixed(2)} Td (${pdfLiteral(op.value)}) Tj ET\n`;
        if (op.t === 'line')
          return `${rgb(op.color)} RG ${op.width} w ${op.x1.toFixed(2)} ${(H - op.y1).toFixed(2)} m ${op.x2.toFixed(2)} ${(H - op.y2).toFixed(2)} l S\n`;
        return `q ${op.width.toFixed(2)} 0 0 ${op.height.toFixed(2)} ${op.x.toFixed(2)} ${(H - op.y - op.height).toFixed(2)} cm /Wappen Do Q\n`;
      })
      .join('')
  );
  const fonts: PdfTrueType[] = ([200, 300, 400] as Weight[]).map(w => ({
    key: 'M' + w,
    metrics: MONTSERRAT[w],
    file: assets.fonts[w] || null
  }));
  return pdfDocument(
    streams,
    PAGE.width,
    PAGE.height,
    wappen ? [{ name: 'Wappen', jpeg: wappen.bytes, width: wappen.width, height: wappen.height }] : [],
    fonts
  );
}

/* ---------- Word ---------- */

const xml = (v: string): string =>
  v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: string): string => c.slice(1).toUpperCase();
/** Schriftname wie in der Schriftdatei (Name 1), damit Word die eingebettete Schrift findet. */
const FAMILY: Record<Weight, string> = { 200: 'Montserrat ExtraLight', 300: 'Montserrat Light', 400: 'Montserrat' };
const TWIPS = COLUMNS.map(c => c * 20);

function run(text: string, o: { w?: Weight; sz?: number; color?: string; spacing?: number } = {}): string {
  if (!text) return '';
  const f = FAMILY[o.w ?? 300];
  const sz = Math.round((o.sz ?? 9) * 2);
  return `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:color w:val="${hex(o.color ?? COLOR.ink)}"/>${o.spacing ? `<w:spacing w:val="${Math.round(o.spacing * 20)}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}
const para = (runs: string, o: { jc?: string; before?: number; after?: number } = {}): string =>
  `<w:p><w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}" w:line="240" w:lineRule="auto"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${runs}</w:p>`;
/** Kurze Trennlinie: eine leere, mittige Tabelle von 36 pt mit oberem Rand. */
const shortLine = (before: number, after: number): string =>
  `<w:tbl><w:tblPr><w:tblW w:w="720" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="6" w:space="0" w:color="${hex(COLOR.ink)}"/></w:tblBorders><w:tblCellMar><w:top w:w="${before}" w:type="dxa"/><w:bottom w:w="${after}" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="720"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="20" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="720" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0" w:line="20" w:lineRule="exact"/></w:pPr></w:p></w:tc></w:tr></w:tbl>`;

function cell(cols: number[], content: string, bottom: boolean): string {
  const width = cols.reduce((a, b) => a + TWIPS[b], 0);
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${cols.length > 1 ? `<w:gridSpan w:val="${cols.length}"/>` : ''}<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:right w:val="nil"/><w:bottom ${bottom ? `w:val="single" w:sz="4" w:space="0" w:color="${hex(COLOR.line)}"` : 'w:val="nil"'}/></w:tcBorders><w:vAlign w:val="center"/></w:tcPr>${content || para('')}</w:tc>`;
}
function lineRow(l: MenuLine, last: boolean): string {
  const name =
    para(run(l.label)) + (l.detail ? para(run(l.detail, { sz: 6.5, color: COLOR.muted }), { before: 10 }) : '');
  const price = l.priceGross === null ? '' : formatPrice(l.priceGross) + ' €';
  const b = !last;
  return (
    `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${l.detail ? 460 : 300}"/></w:trPr>` +
    cell([0], para(run(l.number, { w: 400, color: COLOR.muted })), b) +
    (l.size
      ? cell([1], name, b) + cell([2], para(run(l.size, { color: COLOR.muted }), { jc: 'right' }), b)
      : cell([1, 2], name, b)) +
    cell([3], '', b) +
    cell([4], para(run(l.producer, { color: COLOR.muted })), b) +
    cell([5], para(run(price, { w: 400 }), { jc: 'right' }), b) +
    '</w:tr>'
  );
}

function documentXml(card: MenuCard, wappen: MenuImage | null): string {
  const parts: string[] = [];
  if (wappen) {
    const cy = 62 * 12700,
      cx = Math.round((cy * wappen.width) / wappen.height);
    parts.push(
      `<w:p><w:pPr><w:spacing w:after="280"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Wappen" descr="Wappen der Schelmenzunft Staufen"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="wappen.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdWappen"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
    );
  }
  parts.push(para(run('SCHELMENZUNFT STAUFEN', { w: 400, sz: 7.5, spacing: 2.4 }), { jc: 'center', after: 80 }));
  const title = displayTitle(card.title);
  if (title) parts.push(para(run(title, { w: 200, sz: 23 }), { jc: 'center', after: 160 }));
  parts.push(shortLine(0, 0));
  let first = true;
  for (const s of MENU_SECTIONS) {
    const lines = card.lines.filter(l => l.section === s.id);
    if (!lines.length) continue;
    parts.push(
      para(run(s.title.toLocaleUpperCase('de-DE'), { w: 400, sz: 6.5, color: COLOR.accent, spacing: 2.1 }), {
        before: first ? 440 : 360,
        after: s.subtitle ? 20 : 80
      })
    );
    if (s.subtitle) parts.push(para(run(s.subtitle, { sz: 7.5, color: COLOR.muted }), { after: 80 }));
    parts.push(
      `<w:tbl><w:tblPr><w:tblW w:w="${TWIPS.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${TWIPS.map(c => `<w:gridCol w:w="${c}"/>`).join('')}</w:tblGrid>${lines.map((l, i) => lineRow(l, i === lines.length - 1)).join('')}</w:tbl>`
    );
    first = false;
  }
  const footer = card.footer
    .split(/\r?\n/)
    .map(t => t.trim())
    .filter(Boolean);
  if (footer.length) {
    parts.push(para('', { before: 360 }));
    parts.push(shortLine(0, 0));
    footer.forEach((t, i) =>
      parts.push(para(run(t, { sz: 7, color: COLOR.muted }), { jc: 'center', before: i ? 0 : 160 }))
    );
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>' +
    parts.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838" w:code="9"/><w:pgMar w:top="680" w:right="1080" w:bottom="600" w:left="1080" w:header="567" w:footer="340" w:gutter="0"/><w:cols w:space="708"/></w:sectPr></w:body></w:document>'
  );
}

/** Schlüssel für eingebettete Schriften: fest je Schnitt, damit die Datei bei gleicher Karte gleich bleibt. */
const FONT_KEYS: Record<Weight, string> = {
  200: '{5A4B3C2D-1E0F-4A1B-8C2D-3E4F5A6B7C02}',
  300: '{5A4B3C2D-1E0F-4A1B-8C2D-3E4F5A6B7C03}',
  400: '{5A4B3C2D-1E0F-4A1B-8C2D-3E4F5A6B7C04}'
};
/** Verschleiert eine Schrift für Word (ECMA-376, Teil 1, 17.8.1): die ersten 32 Byte mit dem Schlüssel verknüpft. */
export function obfuscateFont(font: Uint8Array, key: string): Uint8Array {
  const hexKey = key.replace(/[{}-]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) bytes.push(parseInt(hexKey.slice(i * 2, i * 2 + 2), 16));
  bytes.reverse();
  const out = new Uint8Array(font);
  for (let i = 0; i < 32 && i < out.length; i++) out[i] ^= bytes[i % 16];
  return out;
}

/** Word-Datei der Karte. Wappen als PNG, Montserrat eingebettet, soweit mitgegeben. */
export function menuDocx(card: MenuCard, given: MenuAssets | null = null): Uint8Array {
  const assets = given || NO_ASSETS;
  const wappen = assets.wappenPng;
  const weights = ([200, 300, 400] as Weight[]).filter(w => assets.fonts[w]);
  const fontTable =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    ([200, 300, 400] as Weight[])
      .map(
        w =>
          `<w:font w:name="${FAMILY[w]}"><w:altName w:val="Arial"/><w:charset w:val="00"/><w:family w:val="swiss"/><w:pitch w:val="variable"/>${assets.fonts[w] ? `<w:embedRegular r:id="rIdFont${w}" w:fontKey="${FONT_KEYS[w]}"/>` : ''}</w:font>`
      )
      .join('') +
    '</w:fonts>';
  const entries = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'
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
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>${wappen ? '<Relationship Id="rIdWappen" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/wappen.png"/>' : ''}</Relationships>`
    },
    {
      name: 'word/_rels/fontTable.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${weights.map(w => `<Relationship Id="rIdFont${w}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/montserrat-${w}.odttf"/>`).join('')}</Relationships>`
    },
    {
      name: 'word/settings.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${weights.length ? '<w:embedTrueTypeFonts/>' : ''}<w:defaultTabStop w:val="708"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`
    },
    { name: 'word/fontTable.xml', data: fontTable },
    {
      name: 'word/styles.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FAMILY[300]}" w:hAnsi="${FAMILY[300]}" w:cs="${FAMILY[300]}" w:eastAsia="${FAMILY[300]}"/><w:color w:val="${hex(COLOR.ink)}"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Standard"><w:name w:val="Normal"/></w:style></w:styles>`
    },
    { name: 'word/document.xml', data: documentXml(card, wappen) },
    ...(wappen ? [{ name: 'word/media/wappen.png', data: wappen.bytes }] : []),
    ...weights.map(w => ({
      name: `word/fonts/montserrat-${w}.odttf`,
      data: obfuscateFont(assets.fonts[w]!, FONT_KEYS[w])
    }))
  ];
  return zip(entries);
}
