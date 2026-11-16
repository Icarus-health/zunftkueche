import type { HttpRequest, HttpResponse } from '../sharepoint';

export type InboxKind = 'bill' | 'system';
export interface InboxSource {
  id: string;
  version: string;
}
export interface InboxFile extends InboxSource {
  name: string;
  size: number;
  modifiedAt: string;
}
export interface InboxFolder {
  path: string;
  href: string;
  exists: boolean;
  files: InboxFile[];
}
export interface InboxOriginal {
  name: string;
  bytes: Uint8Array;
  source: InboxSource;
  hash: string;
}

const columns = '?$select=UniqueId,ETag,Name,Length,TimeLastModified';
const folderName = (kind: InboxKind, year: number): string =>
  kind === 'bill' ? '03_Rechnungen/' + year : '01_Zunftjahr/' + year + '/Kasse';
export function supportedInboxFile(kind: InboxKind, file: InboxFile): boolean {
  return (
    file.size > 0 &&
    file.size <= (kind === 'bill' ? 8 : 5) * 1024 * 1024 &&
    (kind === 'bill' ? /\.pdf$/i : /\.(csv|xlsx)$/i).test(file.name)
  );
}
export function validInboxSource(value: InboxSource): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value.id) &&
    typeof value.version === 'string' &&
    value.version.trim().length > 0 &&
    value.version.length <= 200
  );
}
function fileMetadata(raw: unknown): InboxFile {
  const row = raw as {
    UniqueId?: string;
    ETag?: string;
    Name?: string;
    Length?: string | number;
    TimeLastModified?: string;
  };
  const file = {
    id: String(row.UniqueId ?? '').toLowerCase(),
    version: row.ETag ?? '',
    name: row.Name ?? '',
    size: Number(row.Length),
    modifiedAt: row.TimeLastModified ?? ''
  };
  if (
    !validInboxSource(file) ||
    !file.name ||
    file.name.length > 255 ||
    /[/\\]/.test(file.name) ||
    Array.from(file.name).some(c => c.charCodeAt(0) < 32) ||
    file.name === '.' ||
    file.name === '..' ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    !Number.isFinite(Date.parse(file.modifiedAt))
  )
    throw new Error('SharePoint hat unvollständige Dateiinformationen geliefert.');
  return file;
}
function argument(value: string): string {
  return encodeURIComponent("'" + value.replace(/'/g, "''") + "'").replace(/'/g, '%27');
}

export class SharePointInbox {
  private readonly library: string;
  private readonly root: string;
  private readonly site: URL;
  public constructor(
    site: string,
    private readonly request: HttpRequest,
    private readonly testMode: boolean
  ) {
    this.site = new URL(site);
    this.library = decodeURIComponent(this.site.pathname).replace(/\/$/, '') + '/Shared Documents';
    this.root = this.library + (testMode ? '/ZK_Abnahme_Eingang' : '');
  }
  private folder(kind: InboxKind, year: number): string {
    if (!Number.isInteger(year) || year < 1900 || year > 9999) throw new Error('Bitte ein gültiges Saisonjahr wählen.');
    return this.root + '/' + folderName(kind, year);
  }
  private url(resource: string): string {
    return this.site.href.replace(/\/$/, '') + '/_api/web/' + resource;
  }
  private folderUrl(path: string): string {
    return this.url('GetFolderByServerRelativePath(decodedUrl=' + argument(path) + ')');
  }
  private async send(url: string, body?: object): Promise<HttpResponse> {
    return this.request(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'odata-version': ''
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  }
  private check(response: HttpResponse): void {
    if (!response.ok)
      throw new Error('SharePoint-Eingang meldet ' + response.status + '. Bitte Zugriff und Ordner prüfen.');
  }
  public async list(kind: InboxKind, year: number): Promise<InboxFolder> {
    const path = this.folder(kind, year);
    const href = this.site.origin + path.split('/').map(encodeURIComponent).join('/');
    const address = this.folderUrl(path) + '/Files';
    const files: InboxFile[] = [];
    const ids = new Set<string>();
    let url = address + columns + '&$top=200';
    for (let page = 0; url; page++) {
      if (page >= 20) throw new Error('Der Eingangsordner enthält zu viele Dateien. Bitte nach Saison aufteilen.');
      const response = await this.send(url);
      if (!page && response.status === 404) return { path: folderName(kind, year), href, exists: false, files: [] };
      this.check(response);
      const data = (await response.json()) as {
        value?: unknown[];
        '@odata.nextLink'?: string;
        'odata.nextLink'?: string;
      };
      if (!Array.isArray(data.value)) throw new Error('Dateiliste ist unvollständig.');
      for (const raw of data.value) {
        const file = fileMetadata(raw);
        if (!ids.has(file.id)) files.push(file);
        ids.add(file.id);
      }
      const next = data['@odata.nextLink'] ?? data['odata.nextLink'];
      if (next) {
        const target = new URL(next, url),
          expected = new URL(address);
        if (
          target.origin !== expected.origin ||
          decodeURIComponent(target.pathname) !== decodeURIComponent(expected.pathname) ||
          target.username ||
          target.password ||
          target.hash
        )
          throw new Error('SharePoint hat einen unerwarteten Verweis zur nächsten Dateiseite geliefert.');
        url = target.href;
      } else url = '';
    }
    return {
      path: folderName(kind, year),
      href,
      exists: true,
      files: files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.name.localeCompare(b.name, 'de'))
    };
  }
  public async ensure(kind: InboxKind, year: number): Promise<void> {
    const path = this.folder(kind, year);
    const suffix = path.slice(this.library.length + 1).split('/');
    let current = this.library;
    for (let i = 0; i < suffix.length; i++) {
      current += '/' + suffix[i];
      const result = await this.send(this.folderUrl(current) + '?$select=Exists');
      if (result.ok) continue;
      if (result.status !== 404) this.check(result);
      if (i === 0 && !this.testMode)
        throw new Error('Der vorhandene Hauptordner wurde nicht gefunden. Bitte Pfad und Zugriff prüfen.');
      const created = await this.send(this.url('folders'), { ServerRelativeUrl: current });
      if (!created.ok) {
        const again = await this.send(this.folderUrl(current) + '?$select=Exists');
        if (!again.ok) this.check(created);
      }
    }
    if (!(await this.list(kind, year)).exists) throw new Error('Jahresordner konnte noch nicht gelesen werden.');
  }
  public async read(kind: InboxKind, year: number, file: InboxFile): Promise<Uint8Array> {
    if (!supportedInboxFile(kind, file)) throw new Error('Dateiformat oder Dateigröße passt nicht zum Eingang.');
    fileMetadata({
      UniqueId: file.id,
      ETag: file.version,
      Name: file.name,
      Length: file.size,
      TimeLastModified: file.modifiedAt
    });
    const path = this.folder(kind, year) + '/' + file.name;
    const url = this.url('GetFileByServerRelativePath(decodedUrl=' + argument(path) + ')');
    const verify = async (): Promise<void> => {
      const response = await this.send(url + columns);
      this.check(response);
      const current = fileMetadata(await response.json());
      if (current.id !== file.id || current.version !== file.version || current.size !== file.size)
        throw new Error('Die Datei wurde geändert. Bitte den Eingang aktualisieren und erneut öffnen.');
    };
    await verify();
    const response = await this.send(url + '/$value');
    this.check(response);
    if (!response.arrayBuffer) throw new Error('Originaldatei konnte nicht geladen werden.');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length !== file.size) throw new Error('Originaldatei ist unvollständig. Bitte erneut öffnen.');
    await verify();
    return bytes;
  }
}
