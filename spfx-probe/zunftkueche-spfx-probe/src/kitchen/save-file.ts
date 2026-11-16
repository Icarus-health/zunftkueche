/** Gibt eine Datei zum Speichern aus. Die Adresse wird kurz danach wieder freigegeben. */
export function saveFile(name: string, blob: Blob, doc: Document = document): void {
  const url = URL.createObjectURL(blob),
    link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
