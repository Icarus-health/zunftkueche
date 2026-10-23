export type ImportKind = 'articles' | 'suppliers';
export const columns: Record<ImportKind,string[]> = {articles:['Name','Einheit','Kategorie'],suppliers:['Name','Telefon','E-Mail','Bestellweg','Kundennummer','Hinweise']};
export function parseCsv(raw: string): string[][] {
 if(raw.length>1000000)throw new Error('Die CSV-Datei ist zu groß. Bitte kleinere Abschnitte importieren.');
 const text=raw.replace(/^\uFEFF/,'');const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted)quoted=false;else if(cell==='')quoted=true;else throw new Error('Anführungszeichen bitte prüfen.');}
 else if(ch===';'&&!quoted){row.push(cell);cell='';}
 else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(c=>c.trim()))rows.push(row);row=[];cell='';}
 else cell+=ch;}
 if(quoted)throw new Error('Ein schließendes Anführungszeichen fehlt.');row.push(cell);if(row.some(c=>c.trim()))rows.push(row);if(rows.length>201)throw new Error('Bitte höchstens 200 Datensätze auf einmal importieren.');return rows;
}
export function previewMasters(kind: ImportKind,text: string,existingNames: string[]): {rows:Record<string,string>[];errors:string[]} {
 const data=parseCsv(text);if(data.length<2)throw new Error('Kopfzeile und mindestens ein Datensatz werden benötigt.');const header=data[0].map(c=>c.trim());const allowed=columns[kind];
 for(const name of header)if(!allowed.includes(name))throw new Error(`Unbekannte Spalte „${name}“. Bitte die CSV-Vorlage verwenden.`);
 if(new Set(header).size!==header.length||!header.includes('Name')||(kind==='articles'&&!header.includes('Einheit')))throw new Error('Die Kopfzeile enthält fehlende oder doppelte Pflichtspalten.');
 const seen=new Set(existingNames.map(n=>n.trim().toLocaleLowerCase('de-DE')));const errors:string[]=[];
 const rows=data.slice(1).map((cells,index)=>{const row:Record<string,string>={};if(cells.length!==header.length)errors.push(`Zeile ${index+2}: Spaltenzahl passt nicht.`);header.forEach((h,i)=>{row[h]=(cells[i]||'').trim();});const name=row.Name.toLocaleLowerCase('de-DE');if(!name)errors.push(`Zeile ${index+2}: Name fehlt.`);else if(seen.has(name))errors.push(`Zeile ${index+2}: „${row.Name}“ ist bereits vorhanden oder doppelt.`);seen.add(name);if(kind==='articles'&&!row.Einheit)errors.push(`Zeile ${index+2}: Einheit fehlt.`);if(row.Name.length>160)errors.push(`Zeile ${index+2}: Name ist zu lang.`);if(kind==='suppliers'&&row['E-Mail']&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['E-Mail']))errors.push(`Zeile ${index+2}: E-Mail-Adresse bitte prüfen.`);if(kind==='suppliers'&&row.Bestellweg&&!['Telefon','E-Mail','Onlineshop','Abholung'].includes(row.Bestellweg))errors.push(`Zeile ${index+2}: Bestellweg ist unbekannt.`);return row;});return {rows,errors};
}
