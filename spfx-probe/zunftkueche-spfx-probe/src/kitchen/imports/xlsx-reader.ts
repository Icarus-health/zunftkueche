import JSZip from 'jszip';
import type { GridCell, ImportGrid } from './model';
function checkZip(data: Uint8Array): void {
  if (data.length > 5 * 1024 * 1024 || data.length < 22 || data[0] !== 80 || data[1] !== 75)
    throw new Error('Bitte eine Excel-Datei im Format .xlsx auswählen (höchstens 5 MiB).');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('Excel-Datei ist unvollständig.');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true),
    expanded = 0;
  if (count > 3000 || count === 65535) throw new Error('Excel-Datei enthält zu viele Bestandteile.');
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > data.length || view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('Excel-Datei ist beschädigt.');
    if (view.getUint16(cursor + 8, true) & 1)
      throw new Error('Verschlüsselte Excel-Dateien bitte zuerst ohne Kennwort speichern.');
    expanded += view.getUint32(cursor + 24, true);
    if (expanded > 20 * 1024 * 1024) throw new Error('Entpackte Excel-Datei ist zu groß (höchstens 20 MiB).');
    cursor +=
      46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
}
function xml(raw: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new Error('Unzulässige XML-Verknüpfung in Excel.');
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Excel-XML ist nicht lesbar.');
  return doc;
}
const tags = (doc: Document | Element, name: string): Element[] => Array.from(doc.getElementsByTagNameNS('*', name));
async function open(data: Uint8Array): Promise<{
  zip: JSZip;
  book: Document;
  relations: Document;
}> {
  checkZip(data);
  const zip = await JSZip.loadAsync(data, { checkCRC32: true });
  const b = zip.file('xl/workbook.xml'),
    r = zip.file('xl/_rels/workbook.xml.rels');
  if (!b || !r) throw new Error('Die Datei ist keine unterstützte .xlsx-Arbeitsmappe.');
  return { zip, book: xml(await b.async('string')), relations: xml(await r.async('string')) };
}
export async function listWorkbookSheets(data: Uint8Array): Promise<string[]> {
  const { book } = await open(data);
  return tags(book, 'sheet').map(s => s.getAttribute('name') || '');
}
export async function readWorkbookSheet(data: Uint8Array, name: string): Promise<ImportGrid> {
  const { zip, book, relations } = await open(data);
  const sheet = tags(book, 'sheet').find(s => s.getAttribute('name') === name);
  if (!sheet) throw new Error('Blatt wurde nicht gefunden.');
  const id =
    sheet.getAttribute('r:id') ||
    sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = tags(relations, 'Relationship').find(r => r.getAttribute('Id') === id);
  let target = rel?.getAttribute('Target') || '';
  if (rel?.getAttribute('TargetMode') === 'External' || target.includes('..') || target.includes(':'))
    throw new Error('Externes Tabellenblatt wird nicht geladen.');
  target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  const file = zip.file(target);
  if (!file) throw new Error('Blattdaten fehlen.');
  const sharedFile = zip.file('xl/sharedStrings.xml'),
    shared = sharedFile
      ? tags(xml(await sharedFile.async('string')), 'si').map(s =>
          tags(s, 't')
            .map(t => t.textContent || '')
            .join('')
        )
      : [];
  const rows: GridCell[][] = [];
  for (const r of tags(xml(await file.async('string')), 'row')) {
    const rn = Number(r.getAttribute('r') || rows.length + 1);
    if (!Number.isInteger(rn) || rn < 1 || rn > 5001) throw new Error('Höchstens 5.000 Datenzeilen pro Vorschau.');
    while (rows.length < rn) rows.push([]);
    const row = rows[rn - 1];
    for (const c of tags(r, 'c')) {
      const ref = c.getAttribute('r') || '',
        letters = ref.match(/^[A-Z]+/)?.[0];
      if (!letters) throw new Error('Zellbezug fehlt.');
      let col = 0;
      for (const ch of letters) col = col * 26 + ch.charCodeAt(0) - 64;
      if (col > 500) throw new Error('Zu viele Spalten.');
      while (row.length < col) row.push({ text: '' });
      const type = c.getAttribute('t'),
        raw = tags(c, 'v')[0]?.textContent || '';
      let text = raw;
      const cell: GridCell = { text: '' };
      if (type === 's') {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n >= shared.length) throw new Error('Excel-Textverweis ist ungültig.');
        text = shared[n];
      } else if (type === 'inlineStr')
        text = tags(c, 't')
          .map(t => t.textContent || '')
          .join('');
      else if (type === 'e') throw new Error('Excel enthält einen Fehlerwert. Bitte zuerst in Excel prüfen.');
      else if (raw && (!type || type === 'n')) {
        const number = Number(raw);
        if (!Number.isFinite(number)) throw new Error('Excel-Zahl ist ungültig.');
        cell.number = number;
      }
      cell.text = text;
      if (tags(c, 'f').length) cell.formula = true;
      row[col - 1] = cell;
    }
  }
  const width = Math.max(0, ...rows.map(r => r.length));
  for (const row of rows) while (row.length < width) row.push({ text: '' });
  const date1904 = tags(book, 'workbookPr')[0]?.getAttribute('date1904');
  return { name, rows, date1904: date1904 === '1' || date1904 === 'true' };
}
