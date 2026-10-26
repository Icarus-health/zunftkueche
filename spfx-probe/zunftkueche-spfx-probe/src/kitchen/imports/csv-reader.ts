import type { GridCell, ImportGrid } from './model';
export function readCsv(raw: string, separator: ';' | ',' | '\t'): ImportGrid {
    if (raw.length > 5 * 1024 * 1024)
        throw new Error('Datei ist zu groß (höchstens 5 MiB).');
    if (![';', ',', '\t'].includes(separator))
        throw new Error('Trennzeichen bitte wählen.');
    const text = raw.replace(/^\uFEFF/, '');
    const rows: GridCell[][] = [];
    let row: GridCell[] = [], cell = '', quoted = false, closed = false;
    const pushCell = (): void => { row.push({ text: cell }); cell = ''; closed = false; if (row.length > 500)
        throw new Error('Zu viele Spalten.'); };
    const pushRow = (): void => { pushCell(); if (row.some(c => c.text.trim()))
        rows.push(row); row = []; if (rows.length > 5001)
        throw new Error('Höchstens 5.000 Datenzeilen pro Vorschau.'); };
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') {
                cell += '"';
                i++;
            }
            else if (quoted) {
                quoted = false;
                closed = true;
            }
            else if (!cell && !closed)
                quoted = true;
            else
                throw new Error('Anführungszeichen bitte prüfen.');
        }
        else if (c === separator && !quoted)
            pushCell();
        else if ((c === '\n' || c === '\r') && !quoted) {
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            pushRow();
        }
        else {
            if (closed && c.trim())
                throw new Error('Text hinter schließendem Anführungszeichen bitte prüfen.');
            if (!closed)
                cell += c;
        }
    }
    if (quoted)
        throw new Error('Ein schließendes Anführungszeichen fehlt.');
    pushRow();
    return { name: 'CSV', rows };
}
export function decodeCsv(data: Uint8Array, encoding: 'utf-8' | 'windows-1252' = 'utf-8'): string { if (data.length > 5 * 1024 * 1024)
    throw new Error('Datei ist zu groß.'); try {
    return new TextDecoder(encoding, { fatal: true }).decode(data);
}
catch {
    throw new Error('Zeichencodierung passt nicht. Bitte UTF-8 oder Windows-1252 auswählen.');
} }
