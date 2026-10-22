export interface Snapshot { id: number; title: string; quantity: number; etag: string; modified: string; editor: string }
interface Row { Id: number; Title: string; Quantity: number; 'odata.etag'?: string; '@odata.etag'?: string; Modified?: string; Editor?: { Title: string } }
interface Payload { value?: Row[]; FieldTypeKind?: number }
export interface Response { status: number; ok: boolean; json(): Promise<Payload> }
export type Request = (url: string, options: { method: string; headers: Record<string, string>; body?: string }) => Promise<Response>;
export class ProbeStore {
  public constructor(private site: string, private request: Request) {}
  private get list(): string { return `${this.site}/_api/web/lists/getbytitle('Zunftkueche_SPFX_Test_20261022')`; }
  private async call(url: string, method = 'GET', body?: object, extra: Record<string, string> = {}): Promise<Response> {
    const result = await this.request(url, { method, headers: { Accept: 'application/json;odata=minimalmetadata', 'Content-Type': 'application/json;odata=nometadata', 'odata-version': '', ...extra }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (result.status === 412) throw new Error('Der Bestand wurde inzwischen geändert. Bitte neu laden.');
    if (result.status === 404) throw new Error('Die Testliste oder der Testartikel ist noch nicht eingerichtet.');
    if (!result.ok) throw new Error(`SharePoint meldet ${result.status}. Bitte Berechtigung und Verbindung prüfen.`);
    return result;
  }
  public async load(): Promise<Snapshot> {
    const result = await this.call(`${this.list}/items?$filter=Title%20eq%20'SPFx-Testartikel%20Wasser'&$select=Id,Title,Quantity,Modified,Editor/Title&$expand=Editor&$top=2`);
    const data = await result.json();
    if (!Array.isArray(data.value) || data.value.length !== 1) throw new Error('Genau ein Testartikel wird benötigt. Testdaten bitte einrichten oder prüfen.');
    const row = data.value[0];
    const etag = row['odata.etag'] || row['@odata.etag'];
    if (row.Title !== 'SPFx-Testartikel Wasser' || !Number.isFinite(row.Quantity) || row.Quantity < 0 || !etag || etag === '*') throw new Error('Testartikel oder Versionskennung ungültig. Es wird nichts überschrieben.');
    return { id: row.Id, title: row.Title, quantity: row.Quantity, etag, modified: row.Modified || '', editor: row.Editor?.Title || '' };
  }
  public async prepare(): Promise<Snapshot> {
    const existing = await this.request(`${this.list}?$select=Id`, { method: 'GET', headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' } });
    if (existing.status === 404) {
      await this.call(`${this.site}/_api/web/lists`, 'POST', { Title: 'Zunftkueche_SPFX_Test_20261022', BaseTemplate: 100, EnableVersioning: true, Description: 'Isolierter SPFx-Verbindungstest. Ausschließlich künstliche Testdaten; keine Küchen-Echtbestände.' });
    } else if (!existing.ok) throw new Error(`Testliste nicht zugänglich (${existing.status}).`);
    const field = await this.request(`${this.list}/fields/getbyinternalnameortitle('Quantity')`, { method: 'GET', headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' } });
    if (field.status === 404) await this.call(`${this.list}/fields`, 'POST', { Title: 'Quantity', FieldTypeKind: 9, Required: true });
    else if (!field.ok || (await field.json()).FieldTypeKind !== 9) throw new Error('Die Mengenspalte ist nicht passend eingerichtet.');
    const rows = await (await this.call(`${this.list}/items?$select=Id&$top=2`)).json();
    if (!Array.isArray(rows.value)) throw new Error('Testliste konnte nicht gelesen werden.');
    if (rows.value.length === 0) await this.call(`${this.list}/items`, 'POST', { Title: 'SPFx-Testartikel Wasser', Quantity: 12 });
    return this.load();
  }
  public async save(before: Snapshot, quantity: number): Promise<Snapshot> {
    if (before.title !== 'SPFx-Testartikel Wasser') throw new Error('Nur der künstliche Testartikel darf geändert werden.');
    if (!Number.isFinite(quantity) || quantity < 0 || quantity > 10000000) throw new Error('Menge liegt außerhalb des zulässigen Bereichs.');
    if (!before.etag || before.etag === '*') throw new Error('Versionskennung fehlt. Bitte neu laden.');
    await this.call(`${this.list}/items(${before.id})`, 'POST', { Quantity: quantity }, { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': before.etag });
    let confirmed: Snapshot;
    try { confirmed = await this.load(); }
    catch { throw new Error('Speicherung noch nicht bestätigt. Bitte neu laden; nicht blind erneut speichern.'); }
    if (confirmed.id !== before.id || confirmed.quantity !== quantity) throw new Error('Speicherung noch nicht bestätigt. Bitte den aktuellen Stand neu laden.');
    return confirmed;
  }
}
