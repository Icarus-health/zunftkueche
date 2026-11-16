import type { HttpRequest, HttpResponse } from '../sharepoint';
import type { Order, Stored } from '../model';
import { isArea } from '../model.ts';
import type { Bill, BillRelations, DeliverySlip, SystemImport, WwDocument, WwState } from './model';
import { immutableKinds, withOriginal, importPurposes } from './model.ts';
import { key, validDate, validateDocument, validateBillCostAssignment } from './domain.ts';
import { sha256 } from '../imports/identity.ts';
import { sameValue as same } from './equality.ts';
import { slipExtension, slipFileName } from '../delivery-slip.ts';
import type { SlipFile } from '../delivery-slip';
const conflict = (): Error =>
  new Error(
    'Der Eintrag wurde inzwischen von jemand anderem geändert. Bitte neu laden, die fremden Änderungen bleiben erhalten.'
  );
interface Index {
  id: string;
  kind: 'index';
  scope: string;
  entries: Array<{
    id: string;
    canonicalKey: string;
    area: string;
    purpose: string;
    from: string;
    to: string;
  }>;
}
export type Entity = WwDocument | Index;
export class WwStore {
  private readonly list: string;
  public constructor(
    private readonly site: string,
    private readonly request: HttpRequest,
    testMode = false,
    private readonly archived: (seasonId: string) => Promise<boolean> = async () => false
  ) {
    const u = new URL(site);
    if (u.protocol !== 'https:' || u.search || u.hash) throw new Error('SharePoint-Ziel bitte prüfen.');
    this.site = site.replace(/\/$/, '');
    this.list =
      this.site + "/_api/web/lists/getbytitle('" + (testMode ? 'ZK_AbnahmeV2_Journal' : 'ZK_V2_Journal') + "')";
  }
  private async http(
    url: string,
    method = 'GET',
    body?: object | string | ArrayBuffer,
    headers: Record<string, string> = {}
  ): Promise<HttpResponse> {
    if (!url.startsWith(this.site + '/_api/')) throw new Error('Unerwartetes SharePoint-Ziel.');
    const response = await this.request(url, {
      method,
      headers: {
        Accept: 'application/json;odata=minimalmetadata',
        'Content-Type': 'application/json;odata=nometadata',
        'odata-version': '',
        ...headers
      },
      ...(body !== undefined
        ? { body: typeof body === 'string' || body instanceof ArrayBuffer ? body : JSON.stringify(body) }
        : {})
    });
    if (response.status === 412) throw conflict();
    if (response.status === 409)
      throw new Error(
        'Datei oder Eintrag bereits vorhanden oder inzwischen gleichzeitig geändert. Bitte gespeicherten Stand laden.'
      );
    if (!response.ok) throw new Error('SharePoint meldet ' + response.status + '. Bitte Verbindung und Rechte prüfen.');
    return response;
  }
  private async exists(): Promise<boolean> {
    const r = await this.request(this.list + '?$select=Description', {
      method: 'GET',
      headers: { Accept: 'application/json;odata=nometadata', 'odata-version': '' }
    });
    if (r.status === 404) return false;
    if (!r.ok) throw new Error('Warenwirtschaft nicht lesbar (' + r.status + '). Bitte Verbindung und Rechte prüfen.');
    const meta = (await r.json()) as {
      Description?: string;
    };
    if (!meta.Description?.includes('[ZK-WW1]'))
      throw new Error('Eine gleichnamige fremde Liste wird nicht verwendet oder verändert.');
    return true;
  }
  public async initialize(): Promise<void> {
    if (!(await this.exists()))
      await this.http(this.site + '/_api/web/lists', 'POST', {
        Title: this.list.includes('Abnahme') ? 'ZK_AbnahmeV2_Journal' : 'ZK_V2_Journal',
        Description: '[ZK-WW1] Zunftküche – zusätzliche Warenwirtschaft. Schema 1.',
        BaseTemplate: 100,
        EnableVersioning: true,
        EnableAttachments: true
      });
    const fields = (await (
      await this.http(this.list + '/fields?$select=InternalName,FieldTypeKind,Indexed,EnforceUniqueValues,SchemaXml')
    ).json()) as {
      value: Array<{
        InternalName: string;
        FieldTypeKind: number;
        Indexed?: boolean;
        EnforceUniqueValues?: boolean;
        SchemaXml?: string;
      }>;
    };
    if (!Array.isArray(fields.value)) throw new Error('Listenschema nicht lesbar.');
    for (const name of ['ZKKey', 'ZKData', 'ZKScope', 'ZKKind', 'ZKRef', 'ZKHash']) {
      const note = name === 'ZKData',
        unique = ['ZKKey', 'ZKRef', 'ZKHash'].includes(name),
        field = fields.value.find(f => f.InternalName === name);
      if (!field)
        await this.http(this.list + '/fields', 'POST', {
          Title: name,
          FieldTypeKind: note ? 3 : 2,
          Required: true,
          ...(note
            ? {
                SchemaXml:
                  '<Field Type="Note" Name="ZKData" DisplayName="ZKData" Required="TRUE" RichText="FALSE" AppendOnly="FALSE" />'
              }
            : { Indexed: true, EnforceUniqueValues: unique })
        });
      else if (
        field.FieldTypeKind !== (note ? 3 : 2) ||
        (!note && (!field.Indexed || (unique && !field.EnforceUniqueValues))) ||
        (note && /RichText="TRUE"|AppendOnly="TRUE"/i.test(field.SchemaXml || ''))
      )
        throw new Error('Vorhandenes Schema passt nicht. Es wird nichts umgebaut.');
    }
  }
  private decode(raw: unknown): Stored<Entity> {
    const row = raw as {
      Id: number;
      ZKKey: string;
      ZKData: string;
      ZKScope: string;
      ZKKind: string;
      'odata.etag'?: string;
      '@odata.etag'?: string;
    };
    let doc: {
      schema: number;
      operationId: string;
      entity: Entity;
    };
    try {
      doc = JSON.parse(row.ZKData);
    } catch {
      throw new Error('Ein Warenwirtschaftsvorgang ist nicht lesbar.');
    }
    const etag = row['odata.etag'] || row['@odata.etag'];
    if (
      doc.schema !== 1 ||
      !doc.entity ||
      doc.entity.id !== row.ZKKey ||
      doc.entity.scope !== row.ZKScope ||
      doc.entity.kind !== row.ZKKind ||
      !etag ||
      etag === '*' ||
      !Number.isInteger(row.Id)
    )
      throw new Error('Daten oder Versionskennung passen nicht. Es wird nichts überschrieben.');
    key(doc.operationId);
    key(doc.entity.id);
    if (doc.entity.kind === 'index') {
      if (!Array.isArray(doc.entity.entries) || doc.entity.entries.length > 500)
        throw new Error('Importregistrierung bitte prüfen.');
      const ids = new Set<string>();
      for (const e of doc.entity.entries) {
        key(e.id);
        validDate(e.from);
        validDate(e.to);
        if (
          !/^[a-f0-9]{64}$/.test(e.canonicalKey) ||
          !isArea(e.area) ||
          !importPurposes.some(purpose => purpose === e.purpose) ||
          e.from > e.to ||
          ids.has(e.id)
        )
          throw new Error('Importregistrierung bitte prüfen.');
        ids.add(e.id);
      }
    } else validateDocument(doc.entity);
    return { itemId: row.Id, etag, operationId: doc.operationId, value: doc.entity };
  }
  private async rows(field?: string, value = ''): Promise<Stored<Entity>[]> {
    if (field && !['ZKKey', 'ZKScope', 'ZKRef', 'ZKHash'].includes(field)) throw new Error('Unzulässiger Filter.');
    if (value.length > 240 || /[']/g.test(value)) throw new Error('Filterwert bitte prüfen.');
    let url: string | undefined =
      this.list +
      '/items?$select=Id,ZKKey,ZKData,ZKScope,ZKKind&$top=200' +
      (field ? '&$filter=' + encodeURIComponent(field + " eq '" + value + "'") : '');
    const visited = new Set<string>(),
      rows: Stored<Entity>[] = [];
    while (url) {
      if (visited.has(url)) throw new Error('Ungültige Seitenfolge.');
      visited.add(url);
      const page = (await (await this.http(url)).json()) as {
        value: unknown[];
        'odata.nextLink'?: string;
        '@odata.nextLink'?: string;
      };
      if (!Array.isArray(page.value)) throw new Error('Unvollständige SharePoint-Antwort.');
      rows.push(...page.value.map(r => this.decode(r)));
      url = page['odata.nextLink'] || page['@odata.nextLink'];
      if (url && !url.startsWith(this.site + '/_api/')) throw new Error('Unerwartete Seitenadresse.');
    }
    return rows;
  }
  private async one(id: string): Promise<Stored<Entity> | undefined> {
    key(id);
    const rows = await this.rows('ZKKey', id);
    if (rows.length > 1) throw new Error('Doppelter Vorgangsschlüssel.');
    return rows[0];
  }
  public async get(id: string): Promise<Stored<WwDocument> | undefined> {
    const row = await this.one(id);
    return row && row.value.kind !== 'index' ? (row as Stored<WwDocument>) : undefined;
  }
  public async findConfirmedBillByHash(fileHash: string): Promise<Bill | undefined> {
    if (!/^[a-f0-9]{64}$/.test(fileHash)) throw new Error('Dateiprüfsumme bitte prüfen.');
    const [match] = await this.rows('ZKHash', 'bill:' + fileHash);
    const bill = match?.value;
    if (!bill) return undefined;
    if (bill.kind !== 'bill' || !bill.confirmed || bill.fileHash !== fileHash)
      throw new Error('Belegindex stimmt nicht mit der Datei überein.');
    return bill;
  }
  public async load(seasonId: string): Promise<WwState> {
    key(seasonId);
    if (!(await this.exists())) return { ready: false, records: [] };
    const global = await this.rows('ZKScope', 'global'),
      local = seasonId === 'global' ? [] : await this.rows('ZKScope', seasonId);
    return {
      ready: true,
      records: [...global, ...local].filter((r): r is Stored<WwDocument> => r.value.kind !== 'index')
    };
  }
  public async loadAll(): Promise<Stored<Entity>[]> {
    if (!(await this.exists())) throw new Error('Warenwirtschaftsjournal fehlt. Sicherung nicht erstellt.');
    return this.rows();
  }
  private references(value: Entity): {
    ref: string;
    hash: string;
  } {
    if (value.kind === 'bill' && value.confirmed)
      return {
        ref:
          'bill:' +
          value.supplierId +
          ':' +
          value.date.slice(0, 4) +
          ':' +
          encodeURIComponent(value.number.trim().toLocaleLowerCase()).slice(0, 140),
        hash: value.fileHash ? 'bill:' + value.fileHash : 'document:' + value.id
      };
    if (value.kind === 'system' && value.confirmed)
      return {
        ref: 'system:' + value.canonicalKey,
        hash: 'system:' + value.purpose + ':' + value.scope + ':' + value.area + ':' + value.fileHash
      };
    return { ref: 'document:' + value.id, hash: 'document:' + value.id };
  }
  private async put(value: Entity, previous: Stored<Entity> | undefined, operationId: string): Promise<Stored<Entity>> {
    key(operationId);
    const existing = await this.one(value.id);
    if (existing?.operationId === operationId) {
      if (!same(existing.value, value)) throw new Error('Dieser Speichervorgang hat andere Eingaben. Bitte neu laden.');
      return existing;
    }
    if (previous && existing?.etag !== previous.etag) throw conflict();
    if (!previous && existing) throw new Error('Dieser Eintrag ist bereits vorhanden. Bitte neu laden.');
    const data = JSON.stringify({ schema: 1, operationId, entity: value });
    if (data.length > 58000) throw new Error('Der Eintrag ist zu groß. Es wird nichts gespeichert.');
    const { ref, hash } = this.references(value);
    if (ref.length > 240 || hash.length > 240) throw new Error('Die Belegkennung ist zu lang.');
    const metadata = {
      Title: ('name' in value ? value.name : value.kind).slice(0, 160),
      ZKKey: value.id,
      ZKScope: value.scope,
      ZKKind: value.kind,
      ZKRef: ref,
      ZKHash: hash,
      ZKData: data
    };
    await this.http(
      this.list + '/items' + (existing ? '(' + existing.itemId + ')' : ''),
      'POST',
      metadata,
      existing ? { 'X-HTTP-Method': 'MERGE', 'IF-MATCH': previous!.etag } : {}
    );
    const saved = await this.one(value.id);
    if (!saved || saved.operationId !== operationId || !same(saved.value, value))
      throw new Error('Das Speichern ist noch nicht bestätigt. Bitte noch einmal speichern.');
    return saved;
  }
  public async save(
    value: WwDocument,
    previous: Stored<WwDocument> | undefined,
    operationId: string
  ): Promise<Stored<WwDocument>> {
    validateDocument(value);
    const current = await this.get(value.id);
    if (current?.operationId === operationId)
      return this.put(value, previous, operationId) as Promise<Stored<WwDocument>>;
    if (current && current.value.kind !== value.kind) throw new Error('Vorgangsart bleibt erhalten.');
    if (previous && previous.value.id !== value.id) throw new Error('Kennung bleibt erhalten.');
    if (current && current.value.scope !== value.scope)
      throw new Error('Saison und Gültigkeitsbereich bleiben erhalten.');
    if (current?.value.confirmed && immutableKinds.has(value.kind))
      throw new Error('Bestätigte Einträge bleiben erhalten. Bitte eine neue Version anlegen.');
    if (value.scope !== 'global' && (await this.archived(value.scope)))
      throw new Error('Das Archiv bleibt erhalten. Bitte eine aktive Saison wählen.');
    if (
      value.kind === 'billLink' &&
      (value.creditForId !== undefined || value.returnIds !== undefined || value.costAssignment !== undefined)
    ) {
      const original = (await this.get(value.billId))?.value;
      if (
        original?.kind !== 'bill' ||
        !original.confirmed ||
        original.scope !== value.scope ||
        original.area !== value.area
      )
        throw new Error('Bestätigter Beleg der Saison und des Bereichs fehlt.');
      await this.checkBillRelations(original, value);
    }
    if (value.kind === 'bill' && value.confirmed) {
      await this.checkBillRelations(value, value);
      if (value.fileHash) {
        if (!current || value.attachment !== 'original-' + value.fileHash + '.pdf')
          throw new Error('PDF-Original muss vor Bestätigung gespeichert sein.');
        const bytes = await this.readOriginal({ ...current, value });
        if ((await sha256(bytes)) !== value.fileHash) throw new Error('Original-Prüfsumme stimmt nicht.');
      }
      const { ref, hash } = this.references(value);
      for (const rows of [await this.rows('ZKRef', ref), await this.rows('ZKHash', hash)])
        if (rows.some(r => r.value.id !== value.id))
          throw new Error('Diese Rechnung oder Datei ist bereits vorhanden.');
    }
    if (value.kind === 'deliverySlip' && value.confirmed) {
      if (
        !current ||
        current.value.kind !== 'deliverySlip' ||
        current.value.fileHash !== value.fileHash ||
        (await sha256(await this.readOriginal({ ...current, value }))) !== value.fileHash
      )
        throw new Error('Lieferscheinoriginal konnte nicht bestätigt werden.');
    }
    if (value.kind === 'system' && value.confirmed && value.originalExtension && !value.attachment)
      throw new Error('Originaldatei bitte erneut auswählen und ergänzen.');
    if (value.kind === 'system' && value.confirmed && value.attachment) {
      if (!current) throw new Error('Importoriginal fehlt.');
      const bytes = await this.readOriginal({ ...current, value });
      if ((await sha256(bytes)) !== value.fileHash) throw new Error('Importoriginal stimmt nicht.');
    }
    if (value.kind === 'system' && value.confirmed) return this.saveSystem(value, previous, operationId);
    return this.put(value, previous, operationId) as Promise<Stored<WwDocument>>;
  }
  private async checkBillRelations(bill: Bill, relations: BillRelations): Promise<void> {
    validateBillCostAssignment(relations.costAssignment, bill.gross);
    if (relations.creditForId) {
      const target = (await this.get(relations.creditForId))?.value;
      if (
        bill.billType !== 'credit' ||
        target?.kind !== 'bill' ||
        !target.confirmed ||
        target.id === bill.id ||
        target.billType === 'credit' ||
        (target.gross ?? 0) < 0 ||
        target.scope !== bill.scope ||
        target.area !== bill.area ||
        target.supplierId !== bill.supplierId
      )
        throw new Error('Originalrechnung muss zu Lieferant, Saison und Bereich der Gutschrift passen.');
    }
    for (const id of relations.returnIds ?? []) {
      const target = (await this.get(id))?.value;
      if (
        target?.kind !== 'movement' ||
        !target.confirmed ||
        target.type !== 'return' ||
        target.scope !== bill.scope ||
        target.area !== bill.area
      )
        throw new Error('Warenrückgabe muss bestätigt sein und zu Saison und Bereich des Belegs passen.');
    }
  }
  public async resumeImport(id: string, operationId: string): Promise<Stored<WwDocument>> {
    const row = await this.get(id);
    if (!row || row.value.kind !== 'system') throw new Error('Importentwurf fehlt.');
    if (row.value.confirmed) return row;
    const value = { ...row.value, confirmed: true };
    if (value.originalExtension && !value.attachment) {
      value.attachment = 'original-' + value.fileHash + '.' + value.originalExtension;
      try {
        if ((await sha256(await this.readOriginal({ ...row, value }))) !== value.fileHash) throw new Error('Prüfsumme');
      } catch {
        throw new Error('Originaldatei bitte erneut auswählen und ergänzen. Der Importentwurf bleibt erhalten.');
      }
    }
    return this.save(value, row, operationId);
  }
  // Stage complete rows, reserve the reporting period with an ETag, then expose confirmation.
  // A registered draft is resumable after reload; replacements keep the original immutable.
  private async saveSystem(
    value: SystemImport,
    previous: Stored<WwDocument> | undefined,
    operationId: string
  ): Promise<Stored<WwDocument>> {
    const refs = this.references(value);
    for (const rows of [await this.rows('ZKRef', refs.ref), await this.rows('ZKHash', refs.hash)])
      if (rows.some(r => r.value.id !== value.id))
        throw new Error('Diese Datei oder dieser Bericht wurde bereits übernommen.');
    const indexId = 'import-index:' + value.scope;
    const index = await this.one(indexId);
    if (index && index.value.kind !== 'index') throw new Error('Importregistrierung ist ungültig.');
    const entries = (index?.value as Index | undefined)?.entries || [];
    const own = entries.find(e => e.id === value.id);
    const replacement = value.replacesId ? await this.get(value.replacesId) : undefined;
    if (
      value.replacesId &&
      (!replacement ||
        replacement.value.kind !== 'system' ||
        !replacement.value.confirmed ||
        replacement.value.scope !== value.scope ||
        replacement.value.area !== value.area ||
        replacement.value.purpose !== value.purpose ||
        replacement.value.from !== value.from ||
        replacement.value.to !== value.to ||
        replacement.value.sourceId !== value.sourceId)
    )
      throw new Error('Ersetzter Import muss zu Quelle, Bereich, Datenart und genau demselben Zeitraum passen.');
    if (replacement && !own && !entries.some(e => e.id === replacement.value.id))
      throw new Error('Dieser Import wurde bereits ersetzt. Aktuellen Stand laden.');
    if (own && own.canonicalKey !== value.canonicalKey)
      throw new Error('Der registrierte Import darf nicht verändert werden.');
    if (
      !own &&
      entries.some(
        e =>
          e.id !== value.replacesId &&
          e.area === value.area &&
          e.purpose === value.purpose &&
          e.from <= value.to &&
          value.from <= e.to
      )
    )
      throw new Error(
        'Dieser Zeitraum überschneidet sich mit einem bereits registrierten Import. Bitte zuerst den gespeicherten Stand prüfen.'
      );
    const draft = { ...value, confirmed: false };
    const current = await this.get(value.id);
    let staged: Stored<WwDocument>;
    if (current?.operationId === operationId + '-draft' && same(current.value, draft)) staged = current;
    else if (own && current && same(current.value, draft)) staged = current;
    else staged = (await this.put(draft, previous, operationId + '-draft')) as Stored<WwDocument>;
    if (!own) {
      if (entries.length >= 500)
        throw new Error('Die Importregistrierung dieser Saison ist voll. Bitte den Datenumfang prüfen.');
      const next: Index = {
        id: indexId,
        kind: 'index',
        scope: value.scope,
        entries: [
          ...entries.filter(e => e.id !== value.replacesId),
          {
            id: value.id,
            canonicalKey: value.canonicalKey,
            area: value.area,
            purpose: value.purpose,
            from: value.from,
            to: value.to
          }
        ]
      };
      await this.put(next, index, operationId + '-index');
    }
    return this.put(value, staged, operationId) as Promise<Stored<WwDocument>>;
  }
  public async saveSystemWithOriginal(
    value: SystemImport,
    bytes: Uint8Array,
    extension: 'csv' | 'xlsx',
    operationId: string
  ): Promise<Stored<WwDocument>> {
    if (bytes.length > 8 * 1024 * 1024 || (await sha256(bytes)) !== value.fileHash)
      throw new Error('Importoriginal oder Prüfsumme bitte prüfen.');
    const complete = {
      ...value,
      originalExtension: extension,
      attachment: 'original-' + value.fileHash + '.' + extension
    };
    validateDocument(complete);
    const refs = this.references(complete);
    for (const rows of [await this.rows('ZKRef', refs.ref), await this.rows('ZKHash', refs.hash)])
      if (rows.some(r => r.value.id !== value.id))
        throw new Error('Diese Datei oder dieser Bericht wurde bereits übernommen.');
    const current = await this.get(value.id);
    if (current?.value.confirmed) return this.save(complete, current, operationId);
    const draft: SystemImport = { ...complete, confirmed: false };
    delete draft.attachment;
    const staged = await this.save(draft, current, operationId + '-original');
    await this.attachOriginal(staged, bytes, value.fileHash, extension);
    return this.save(complete, staged, operationId);
  }
  public async saveDeliverySlip(
    order: Pick<Order, 'id' | 'seasonId' | 'area'>,
    deliveryId: string | undefined,
    file: SlipFile,
    actor: string
  ): Promise<Stored<WwDocument>> {
    const extension = slipExtension(file.bytes);
    const fileHash = await sha256(file.bytes);
    const id = 'slip-' + (await sha256(new TextEncoder().encode(JSON.stringify([order.id, deliveryId, fileHash]))));
    const current = await this.get(id);
    if (current && current.value.kind !== 'deliverySlip')
      throw new Error('Vorgangsart des Lieferscheins stimmt nicht.');
    if (current?.value.confirmed) {
      if ((await sha256(await this.readOriginal(current))) !== fileHash)
        throw new Error('Gespeicherte Datei stimmt nicht mit dem Lieferschein überein.');
      return current;
    }
    const draft: DeliverySlip = {
      id,
      kind: 'deliverySlip',
      scope: order.seasonId,
      area: order.area,
      orderId: order.id,
      ...(deliveryId ? { deliveryId } : {}),
      name: slipFileName(file.name, extension),
      extension,
      fileHash,
      confirmed: false,
      by: actor,
      at: new Date().toISOString()
    };
    const staged = current ?? (await this.save(draft, undefined, id + '-draft'));
    if (
      staged.value.kind !== 'deliverySlip' ||
      staged.value.fileHash !== fileHash ||
      staged.value.orderId !== order.id ||
      staged.value.deliveryId !== deliveryId ||
      staged.value.scope !== order.seasonId ||
      staged.value.area !== order.area
    )
      throw new Error('Zuordnung des Lieferscheins stimmt nicht.');
    const attachment = await this.attachOriginal(staged, file.bytes, fileHash, extension);
    const fresh = await this.get(id);
    if (!fresh || fresh.value.kind !== 'deliverySlip')
      throw new Error('Lieferscheinvorgang nicht lesbar. Bitte erneut versuchen.');
    if (fresh.value.confirmed && fresh.value.attachment === attachment) return fresh;
    if (!same(fresh.value, staged.value)) throw conflict();
    return this.save({ ...staged.value, attachment, confirmed: true }, fresh, id + '-complete');
  }
  public async attachOriginal(
    previous: Stored<WwDocument>,
    data: Uint8Array,
    hash: string,
    extension: string
  ): Promise<string> {
    const value = previous.value;
    if (
      !withOriginal(value) ||
      value.confirmed ||
      data.length > 8 * 1024 * 1024 ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      value.fileHash !== hash ||
      (await sha256(data)) !== hash ||
      (value.kind === 'bill' && (extension !== 'pdf' || new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-')) ||
      (value.kind === 'system' &&
        (!['csv', 'xlsx'].includes(extension) || (extension === 'xlsx' && (data[0] !== 80 || data[1] !== 75)))) ||
      (value.kind === 'deliverySlip' && (extension !== value.extension || slipExtension(data) !== extension))
    )
      throw new Error('Original oder Prüfsumme bitte prüfen.');
    const filename = 'original-' + hash + '.' + extension;
    const url = this.list + '/items(' + previous.itemId + ')/AttachmentFiles';
    const list = (await (await this.http(url + '?$select=FileName')).json()) as {
      value: Array<{
        FileName: string;
      }>;
    };
    if (!list.value?.some(f => f.FileName === filename))
      await this.http(url + "/add(FileName='" + filename + "')", 'POST', new Uint8Array(data).buffer, {
        'Content-Type': 'application/octet-stream'
      });
    const bytes = await this.readOriginal({ ...previous, value: { ...value, attachment: filename } });
    if ((await sha256(bytes)) !== hash) throw new Error('Original-Prüfsumme stimmt nach dem Speichern nicht.');
    return filename;
  }
  public async readOriginal(row: Stored<WwDocument>): Promise<Uint8Array> {
    if (!withOriginal(row.value) || !/^original-[a-f0-9]{64}\.(pdf|csv|xlsx|jpg|png)$/.test(row.value.attachment || ''))
      throw new Error('Originalverweis fehlt.');
    const response = await this.http(
      this.list + '/items(' + row.itemId + ")/AttachmentFiles/getByFileName('" + row.value.attachment + "')/$value"
    );
    if (!response.arrayBuffer) throw new Error('Originaldatei kann nicht geladen werden.');
    return new Uint8Array(await response.arrayBuffer());
  }
}
