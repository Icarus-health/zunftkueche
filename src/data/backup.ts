import {parseReceiptEdit} from '../ui/receipt-intake-draft.ts';
import type { KitchenState } from '../domain/state.ts';
import type { Repository } from './repository.ts';

/** Null is an unread source; [] is a successfully read, empty source. */
export interface OriginalBackup {
  id: string;
  sha256: string;
  version: string;
  itemId: string;
  bytesBase64?: string;
  retainedBackup?: { reference: string; sha256: string; version: string; verifiedAt: string };
}
export interface OperationBackupReceipt {
  id: string;
  workspaceId: string;
  operationId: string;
  requestHash: string;
  actorId: string;
  appliedRevision: number;
  recordedAt: string;
  rowVersion?: string;
  rawRow?: Record<string, unknown>;
}
export interface WorkspaceBackupEvidence {
  rawState: string;
  rawStateSha256: string;
  rawRow: Record<string, unknown>;
  rowVersion: string;
  ownerId: string;
  ownerType: 'systemuser' | 'team';
  protocolVersion: 2;
}
export interface BackupInputs {
  environment: string;
  workspaceId: string;
  workspaceEvidence?: WorkspaceBackupEvidence | null;
  /** Informational only. Imported packets cannot authorize their own validation. */
  sourceContract?: { id: 'kitchen-core-v1'; documents: 'not_in_contract'; drafts: 'not_in_contract' } | { id: 'kitchen-documents-v1'; documents: 'required'; drafts: 'required'; manifestVersion: 1 };
  schemaValidation?: { policy: string; rawStateSha256: string };
  state: KitchenState;
  settings: Record<string, unknown>;
  documents: Record<string, unknown>[] | null;
  drafts: Record<string, unknown>[] | null;
  operationReceipts: OperationBackupReceipt[] | null;
  documentManifest: OriginalBackup[];
}
export interface KitchenBackup extends BackupInputs {
  formatVersion: 1;
  workspaceRevision: number;
  createdAt: string;
  complete: boolean;
  missing: string[];
  payloadHash: string;
}
export type StateValidator = (state: KitchenState) => Promise<void>;
export interface BackupSource {
  /** Verify actual owner rights before reading any backup data. */
  authorize(): Promise<boolean>;
  read(): Promise<BackupInputs>;
  /** Trusted runtime validator; never reconstructed from imported packet metadata. */
  validateState?: StateValidator;
}
const SCHEMA_MISSING = 'Vollständige Schema-/Werteprüfung nicht durchgeführt.';
export const BACKUP_POLICY = 'kitchen-schema2-net-evidence-v1';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}
export async function bytesHash(value: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(value));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function backupHash(value: unknown): Promise<string> {
  return bytesHash(new TextEncoder().encode(JSON.stringify(canonical(value))));
}
function decodeBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}
function requireStateEnvelope(state: KitchenState): void {
  if (state.schemaVersion !== 2 || !Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new Error('Sicherung braucht bestätigtes Schema 2 und gültige Revision.');
  }
  if (new TextEncoder().encode(JSON.stringify(state)).length > 524288) throw new Error('Zustand überschreitet 512 KiB.');
  if (!Array.isArray(state.operationIds) || new Set(state.operationIds).size !== state.operationIds.length) {
    throw new Error('Wiederholungs-IDs ungültig.');
  }
}
async function inspectWorkspace(value: BackupInputs, missing: string[]): Promise<void> {
  const evidence = value.workspaceEvidence;
  if (!evidence) {
    missing.push('Workspace-Originalzustand / RowVersion / Eigentümernachweis nicht gelesen');
    return;
  }
  const valid = evidence.protocolVersion === 2 && evidence.rowVersion && evidence.ownerId
    && ['systemuser', 'team'].includes(evidence.ownerType) && evidence.rawRow
    && evidence.rawRow.zk_state === evidence.rawState
    && evidence.rawRow.zk_revision === value.state.revision
    && evidence.rawRow.zk_kitchenworkspaceid === value.workspaceId
    && await bytesHash(new TextEncoder().encode(evidence.rawState)) === evidence.rawStateSha256
    && await backupHash(JSON.parse(evidence.rawState)) === await backupHash(value.state);
  if (!valid) throw new Error('Workspace-Original / Hash / Revision ungültig.');
}
function inspectReceipts(value: BackupInputs, missing: string[]): void {
  if (value.operationReceipts === null) return;
  const operations = new Set<string>();
  const rows = new Set<string>();
  const revisions = new Set<number>();
  for (const receipt of value.operationReceipts) {
    const valid = typeof receipt.operationId === 'string' && !operations.has(receipt.operationId)
      && receipt.id && !rows.has(receipt.id) && receipt.workspaceId === value.workspaceId
      && Number.isInteger(receipt.appliedRevision) && receipt.appliedRevision >= 1
      && receipt.appliedRevision <= value.state.revision && !revisions.has(receipt.appliedRevision)
      && /^[a-f0-9]{64}$/.test(receipt.requestHash) && /^[a-f0-9-]{36}$/i.test(receipt.actorId)
      && Number.isFinite(Date.parse(receipt.recordedAt));
    if (!valid) throw new Error('Wiederholungsbeleg ist unvollständig.');
    const normalized = {
      zk_kitchenoperationid: receipt.id,
      _zk_workspace_value: receipt.workspaceId,
      zk_operationid: receipt.operationId,
      zk_requesthash: receipt.requestHash,
      zk_actor: receipt.actorId,
      zk_appliedrevision: receipt.appliedRevision,
      zk_recordedat: receipt.recordedAt,
    };
    if (receipt.rawRow && Object.entries(normalized).some(([key, expected]) => receipt.rawRow![key] !== expected)) {
      throw new Error('Wiederholungsbeleg-Rohdaten passen nicht zur Zuordnung.');
    }
    if (!receipt.rowVersion || !receipt.rawRow) missing.push('Wiederholungsbeleg: vollständige Rohzeile / RowVersion fehlt');
    operations.add(receipt.operationId);
    rows.add(receipt.id);
    revisions.add(receipt.appliedRevision);
    if (!value.state.operationIds.includes(receipt.operationId)) throw new Error('Wiederholungsbeleg ohne Vorgang.');
  }
  if (value.state.operationIds.some(id => !operations.has(id))) missing.push('Wiederholungsbelege fehlen');
}
export function requiredOriginals(state: KitchenState): Array<{ hash: string; file: string }> {
  const originals = new Map<string, string>();
  function walk(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const source = record.source as { hash?: string; file?: string } | undefined;
    if (source?.hash) originals.set(source.hash.toLowerCase(), source.file ?? source.hash);
    Object.values(record).forEach(walk);
  }
  walk(state);
  return [...originals].map(([hash, file]) => ({ hash, file }));
}
async function inspectOriginals(value: BackupInputs, missing: string[]): Promise<void> {
  const ids = new Set<string>();
  for (const original of value.documentManifest) {
    if (ids.has(original.id) || !original.id || !original.version || !original.itemId || !/^[a-f0-9]{64}$/.test(original.sha256)) {
      throw new Error('Originalmanifest ungültig.');
    }
    ids.add(original.id);
    if (original.bytesBase64 !== undefined) {
      const bytes = decodeBytes(original.bytesBase64);
      if (bytes.length > 20 * 1024 * 1024 || await bytesHash(bytes) !== original.sha256) throw new Error('Original-Hash stimmt nicht.');
    } else {
      const retained = original.retainedBackup;
      if (!retained || retained.sha256 !== original.sha256 || retained.version !== original.version
        || !retained.reference || !Number.isFinite(Date.parse(retained.verifiedAt))) {
        missing.push(`Original ${original.id}: Bytes oder geprüfte getrennte Sicherung fehlen`);
      }
    }
  }
  for (const original of requiredOriginals(value.state)) {
    if (!value.documentManifest.some(item => item.sha256 === original.hash && (item.bytesBase64 !== undefined || item.retainedBackup))) {
      missing.push(`Original ${original.file}: fehlt`);
    }
  }
  function inspectUnhashed(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const source = record.source as { hash?: string } | undefined;
    if (record.localPath && !source?.hash) missing.push(`Original ${record.localPath}: Hash fehlt`);
    if (record.documentUrl && !source?.hash && !record.intake) missing.push('Original aus Dokumentlink: Bytes und Hashzuordnung fehlen');
    Object.values(record).forEach(inspectUnhashed);
  }
  inspectUnhashed(value.state);
}
function encodeBytes(bytes: Uint8Array): string {
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
}
function recordFields(value:Record<string,unknown>,names:string):void {
  if(Object.keys(value).some(key=>!names.split(' ').includes(key)))throw new Error('Dokument/Entwurf: unbekanntes Feld.');
}
function checkedText(value:unknown,max:number,empty=false):void {
  if(typeof value!=='string'||value.length>max||(!empty&&!value.length)||/[\u0000-\u001f]/.test(value))throw new Error('Dokument/Entwurf: Text ungültig.');
}
function checkedNumber(value:unknown,money=false):void {
  if(value!==null&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1e9||(money&&!Number.isSafeInteger(value))||(!money&&typeof value==='number'&&Number(value.toFixed(4))!==value)))throw new Error('Entwurf: Geld oder Menge ungültig.');
}
function validateStoredPayload(row:Record<string,unknown>,draft:boolean):void {
  const guid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  if(!guid.test(String(row.id)))throw new Error('Dokument/Entwurf-ID ungültig.');
  checkedText(row.eventId,500);checkedText(row.workspaceId,100);
  if(!draft) {
    recordFields(row,'id uploadId eventId workspaceId principal status sha256 mimeType size originalName ref');
    if(row.uploadId!==row.id||!guid.test(String(row.uploadId))||!['selected','uploading','uploaded-unlinked','linked','failed'].includes(String(row.status)))throw new Error('Dokumentstatus ungültig.');
    checkedText(row.principal,512);checkedText(row.originalName,200);
    if(!/^[a-f0-9]{64}$/.test(String(row.sha256))||!['image/jpeg','image/png','application/pdf'].includes(String(row.mimeType))||!Number.isSafeInteger(row.size)||Number(row.size)<1||Number(row.size)>5242880)throw new Error('Dokumenttyp, Hash oder Größe ungültig.');
    const ref=row.ref as Record<string,unknown>|undefined;
    if(row.status==='linked'&&!ref)throw new Error('Verknüpfte Dokumentreferenz fehlt.');
    if(ref) {
      recordFields(ref,'provider siteCollectionId webId libraryId itemId version connectorIdentifier webUrl sha256 mimeType size originalName');
      if(ref.provider!=='sharepoint'||ref.siteCollectionId!=='f8177aa4-4ba3-4ba1-8c26-5ed32d5b2923'||ref.webId!=='c24ab669-3ca6-4530-aabf-6f42f8343ae7'||ref.libraryId!=='9e71defe-f678-4c0c-b69c-45e4370a735a'||!new RegExp('^[1-9][0-9]*$').test(String(ref.itemId)))throw new Error('Dokumentziel ungültig.');
      for(const key of ['sha256','mimeType','size','originalName'])if(ref[key]!==row[key])throw new Error('Originalreferenz abweichend.');
      checkedText(ref.version,256);checkedText(ref.connectorIdentifier,4096);checkedText(ref.webUrl,4096);
      const suffix=row.mimeType==='image/jpeg'?'jpg':row.mimeType==='image/png'?'png':'pdf';
      if(decodeURI(String(ref.webUrl))!==`https://schelmenzunft.sharepoint.com/sites/SchelmenzunftStaufenTraditionszunftderStaufenerStubengesells/Shared Documents/General/Zunftküche/Rechnungen/receipt-${row.id}.${suffix}`)throw new Error('Dokumentpfad ungültig.');
    }
    return;
  }
  recordFields(row,'schemaVersion id eventId workspaceId source parserVersion modelVersion promptVersion reviewStatus pages header lines rawInput textAssist acceptance');
  if(row.schemaVersion!==1||row.source!=='manual'||['parserVersion','modelVersion','promptVersion'].some(k=>row[k]!==null)||!['editing','reviewed','accepted'].includes(String(row.reviewStatus)))throw new Error('Entwurfherkunft ungültig.');
  const header=row.header as Record<string,unknown>;
  if(!header||typeof header!=='object'||Array.isArray(header))throw new Error('Entwurfkopf fehlt.');
  recordFields(header,'supplierId number date scope grossCents');
  for(const key of ['supplierId','number','date','scope'])checkedText(header[key],200,true);
  if(header.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(String(header.date))||new Date(String(header.date)).toISOString().slice(0,10)!==header.date))throw new Error('Entwurfdatum ungültig.');
  checkedNumber(header.grossCents,true);
  if(!Array.isArray(row.lines)||row.lines.length>100)throw new Error('Entwurfpositionen ungültig.');
  const ids=new Set();
  for(const line of row.lines as Record<string,unknown>[]) {
    recordFields(line,'id description articleId quantity unit grossCents');
    if(!guid.test(String(line.id))||ids.has(line.id))throw new Error('Entwurfposition-ID ungültig.');ids.add(line.id);
    for(const key of ['description','articleId','unit'])checkedText(line[key],500,true);
    checkedNumber(line.quantity);checkedNumber(line.grossCents,true);
  }
  if(!Array.isArray(row.pages)||!row.pages.length||row.pages.length>10)throw new Error('Entwurfseiten ungültig.');
  const pageIds=new Set();
  for(const page of row.pages as Record<string,unknown>[]) {
    recordFields(page,'documentId documentRowVersion version sha256 originalReviewed');
    if(!guid.test(String(page.documentId))||pageIds.has(page.documentId)||typeof page.originalReviewed!=='boolean'||['reviewed','accepted'].includes(String(row.reviewStatus))&&!page.originalReviewed||!/^[a-f0-9]{64}$/.test(String(page.sha256)))throw new Error('Entwurfprüfung ungültig.');
    pageIds.add(page.documentId);checkedText(page.documentRowVersion,200);checkedText(page.version,256);
  }
  if(row.rawInput)validateRawReview(row.rawInput,header,row.lines);
  if(row.textAssist)validateTextAssist(row.textAssist);
  if(row.reviewStatus==='accepted') {
    const a=row.acceptance as Record<string,unknown>;
    if(!a||typeof a!=='object')throw new Error('Übernahmebeleg fehlt.');
    recordFields(a,'operationId receiptId requestHash appliedRevision actorId recordedAt reviewedFields reviewDecisions documentVersion');
    if(!guid.test(String(a.operationId))||a.receiptId!==row.id||!guid.test(String(a.actorId))||!Number.isSafeInteger(a.appliedRevision)||Number(a.appliedRevision)<1||!/^[a-f0-9]{64}$/.test(String(a.requestHash))||!Number.isFinite(Date.parse(String(a.recordedAt))))throw new Error('Übernahmebeleg ungültig.');
    const fields=a.reviewedFields as Record<string,unknown>;recordFields(fields,'header lines raw');
    if(stable(fields.header)!==stable(header)||stable(fields.lines)!==stable(row.lines)||stable(a.documentVersion)!==stable(row.pages))throw new Error('Übernahmefelder stimmen nicht mit Entwurf überein.');
    validateRawReview(fields.raw,header,row.lines);
    if(row.rawInput&&stable(row.rawInput)!==stable(fields.raw))throw new Error('Übernahme-Rohwerte unterscheiden sich.');
    const decisions=a.reviewDecisions as Record<string,unknown>;recordFields(decisions,'receipt fields originals prices stock');
    if(decisions.receipt!==true||decisions.fields!==true||decisions.originals!==true||decisions.prices!=='separate'||decisions.stock!=='separate')throw new Error('Übernahmeentscheidungen unvollständig.');
  } else if(row.acceptance!==undefined)throw new Error('Übernahme darf nicht verborgen werden.');

}
function stable(value:unknown):string {
  const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,sorted(x)])):v;
  return JSON.stringify(sorted(value));
}
function validateRawReview(raw:unknown,header:unknown,lines:unknown):void {
  recordFields(raw as Record<string,unknown>,'total lines');
  const r=raw as import('../ui/receipt-intake-draft.ts').ReceiptEdit['raw'];
  if(typeof r.total!=='string'||r.total.length>100||!r.lines||typeof r.lines!=='object'||Array.isArray(r.lines)||Object.keys(r.lines).length!==(lines as unknown[]).length)throw new Error('Übernahme-Rohzahlen ungültig.');
  for(const line of Object.values(r.lines)){recordFields(line,'quantity grossCents');if(typeof line.quantity!=='string'||line.quantity.length>100||typeof line.grossCents!=='string'||line.grossCents.length>100)throw new Error('Übernahme-Rohzeile ungültig.');}
  const parsed=parseReceiptEdit({draft:{header,lines} as import('./documents.ts').ExtractDraft,raw:r});
  if(stable(parsed.header)!==stable(header)||stable(parsed.lines)!==stable(lines))throw new Error('Übernahme-Rohzahlen widersprechen geprüften Feldern.');
}
function validateTextAssist(value:unknown):void {
  const a=value as import('../ocr/receipt-parser.ts').TextAssist;recordFields(a as unknown as Record<string,unknown>,'origin completeness parserVersion text proposals');
  if(a.origin!=='user-supplied'||a.completeness!=='unknown'||a.parserVersion!=='receipt-hints-v1'||typeof a.text!=='string'||a.text.length>16000||!Array.isArray(a.proposals)||a.proposals.length>4)throw new Error('Texthelfer-Herkunft ungültig.');
  const seen=new Set();for(const p of a.proposals){recordFields(p,'field value status evidence');if(!['supplierId','number','date','grossCents'].includes(p.field)||seen.has(p.field)||p.value!==null&&(typeof p.value!=='string'||p.value.length>500)||!['proposed','missing','ambiguous','incomplete'].includes(p.status)||!Array.isArray(p.evidence)||p.evidence.length>200)throw new Error('Textvorschlag ungültig.');seen.add(p.field);for(const e of p.evidence){recordFields(e as unknown as Record<string,unknown>,'page start end quote');if(e.page!==null||!Number.isInteger(e.start)||!Number.isInteger(e.end)||e.start<0||e.end<e.start||e.end>a.text.length||a.text.slice(e.start,e.end)!==e.quote)throw new Error('Textfundstelle ungültig.');}}
}
async function validateStoredHistory(row:Record<string,unknown>,draft:boolean):Promise<void> {
  const {rowVersion,rawRow,history,...payload}=row;
  validateStoredPayload(payload,draft);
  if(!Array.isArray(history)||!history.length||new TextEncoder().encode(JSON.stringify({...payload,history})).length>131072)throw new Error('Dokument/Entwurf-Verlauf fehlt oder ist zu groß.');
  const seen=new Set();
  for(const entry of history as Record<string,unknown>[]) {
    recordFields(entry,'requestId requestHash actorId recordedAt action value');
    if(!/^[a-f0-9-]{36}$/.test(String(entry.requestId))||seen.has(entry.requestId)||!/^[a-f0-9-]{36}$/.test(String(entry.actorId))||!/^[a-f0-9]{64}$/.test(String(entry.requestHash))||!Number.isFinite(Date.parse(String(entry.recordedAt)))||!(draft?['draft.save','receipt.draft.accept']:['upload.begin','upload.claim','upload.link']).includes(String(entry.action)))throw new Error('Dokument/Entwurf-Verlauf ungültig.');
    seen.add(entry.requestId);
    const prior=entry.value as Record<string,unknown>;
    if(!prior||prior.id!==row.id||prior.eventId!==row.eventId||prior.workspaceId!==row.workspaceId)throw new Error('Verlaufbeziehung ungültig.');
    validateStoredPayload(prior,draft);
    if(draft&&(prior.reviewStatus==='accepted')!==(entry.action==='receipt.draft.accept'))throw new Error('Übernahmeverlauf falsch bezeichnet.');
    if(draft&&entry.action==='receipt.draft.accept') {
      const a=prior.acceptance as Record<string,unknown>;
      if(a.operationId!==entry.requestId||a.requestHash!==entry.requestHash||a.actorId!==entry.actorId||a.recordedAt!==entry.recordedAt||entry!==history[history.length-1])throw new Error('Übernahmeverlauf ist nicht unveränderlich.');
    }
  }
  if(await backupHash(history[history.length-1].value)!==await backupHash(payload))throw new Error('Letzter Dokument-/Entwurfstand stimmt nicht.');
}
/** Required native metadata is independent evidence, not another copy of the payload. */
async function validateDocumentRaw(row:Record<string,unknown>, draft:boolean):Promise<void> {
  const raw=row.rawRow as Record<string,unknown>|undefined;
  const table=draft?'zk_kitchendraft':'zk_kitchendocument';
  if(!raw || raw[table+'id']!==row.id || raw['@rowVersion']!==row.rowVersion
    || raw.zk_eventid!==row.eventId || typeof raw.zk_payload!=='string') {
    throw new Error('Dokument-/Entwurf-Rohzeile: native Identität oder Beziehung stimmt nicht.');
  }
  const workspace=raw.zk_workspace as Record<string,unknown>|undefined;
  if(!workspace || typeof workspace!=='object' || Array.isArray(workspace)
    || Object.keys(workspace).sort().join(',')!=='id,logicalName,name,rowVersion'
    || workspace.logicalName!=='zk_kitchenworkspace' || workspace.id!==row.workspaceId
    || !(workspace.name===null || typeof workspace.name==='string')
    || !(workspace.rowVersion===null || typeof workspace.rowVersion==='string')) {
    throw new Error('Dokument-/Entwurf-Rohzeile: native Workspace-Beziehung fehlt oder ist unbekannt.');
  }
  const formatted=raw['@formattedValues'];
  if(!formatted || typeof formatted!=='object' || Array.isArray(formatted)
    || Object.values(formatted).some(value=>typeof value!=='string')) {
    throw new Error('Dokument-/Entwurf-Rohzeile: native Formatmetadaten fehlen.');
  }
  const history=row.history as Record<string,unknown>[];
  const last=history[history.length-1];
  // Dataverse DateTime readback has millisecond precision; keep full source timestamps too.
  if(raw.zk_actor!==last.actorId || typeof raw.zk_recordedat!=='string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,7}Z$/.test(raw.zk_recordedat)
    || Date.parse(raw.zk_recordedat)!==Date.parse(String(last.recordedAt))) {
    throw new Error('Dokument-/Entwurf-Rohzeile: native Auditangaben stimmen nicht.');
  }
  const {rowVersion,rawRow,...payload}=row;
  if(await backupHash(JSON.parse(raw.zk_payload))!==await backupHash(payload)) {
    throw new Error('Dokument-/Entwurf-Rohzeile: Nutzdaten stimmen nicht.');
  }
}
async function inspectDocumentStores(value:BackupInputs, missing:string[]):Promise<void> {
  const documents=new Map<string,Record<string,unknown>>();
  const events=[value.state,...(value.state.archivedEvents??[])];
  const eventIds=new Set(events.map(event=>event.event.id));
  const snapshots=(row:Record<string,unknown>)=>(row.history as {value:Record<string,unknown>}[]).map(entry=>entry.value);
  function requireOriginal(id:string,ref:import('./documents.ts').DocumentRef,historical:boolean) {
    const original=value.documentManifest.find(original=>original.id===id && original.sha256===ref.sha256
      && original.version===ref.version && original.itemId===ref.itemId);
    const context=historical?'historisch versioniertes':'versioniertes';
    if(!original)missing.push(`Dokument ${id}: ${context} Original fehlt`);
    else if(original.bytesBase64===undefined)missing.push(`Dokument ${id}: ${context} Originalbytes nicht unabhängig gelesen`);
  }
  for(const row of value.documents??[]) {
    if(typeof row.id!=='string' || documents.has(row.id) || row.workspaceId!==value.workspaceId
      || !eventIds.has(String(row.eventId)) || typeof row.rowVersion!=='string' || !row.rowVersion) {
      throw new Error('Dokumentinventar: Identität oder Beziehung ungültig.');
    }
    await validateStoredHistory(row,false);
    await validateDocumentRaw(row,false);
    documents.set(row.id,row);
    if(!row.ref || row.status!=='linked')missing.push(`Dokument ${row.id}: Upload oder Verknüpfung unbestätigt`);
    // An older retained external reference is still required, even when no current draft uses it.
    const history=snapshots(row);
    for(const [index,snapshot] of history.entries()) {
      const ref=snapshot.ref as import('./documents.ts').DocumentRef|undefined;
      if(ref)requireOriginal(row.id,ref,index<history.length-1);
    }
  }
  const drafts=new Set<string>();
  for(const row of value.drafts??[]) {
    if(typeof row.id!=='string' || drafts.has(row.id) || row.workspaceId!==value.workspaceId
      || !eventIds.has(String(row.eventId)) || typeof row.rowVersion!=='string' || !row.rowVersion) {
      throw new Error('Entwurfinventar ungültig.');
    }
    await validateStoredHistory(row,true);
    await validateDocumentRaw(row,true);
    drafts.add(row.id);
    const event=events.find(event=>event.event.id===row.eventId)!;
    if(row.acceptance) {
      const a=row.acceptance as Record<string,unknown>,operationId=String(a.operationId);
      const receipt=event.invoices.find(i=>i.id===a.receiptId);
      const acknowledgment=value.operationReceipts?.find(r=>r.operationId===operationId);
      if(!receipt?.intake||receipt.intake.draftId!==row.id||receipt.intake.operationId!==operationId||!receipt.sourceBaseline
        ||stable(receipt.sourceBaseline.intake)!==stable(receipt.intake))throw new Error('Übernahme ohne unveränderlichen Belegbezug.');
      if(!acknowledgment||acknowledgment.requestHash!==a.requestHash||acknowledgment.actorId!==a.actorId||acknowledgment.appliedRevision!==a.appliedRevision||Date.parse(acknowledgment.recordedAt)!==Date.parse(String(a.recordedAt)))throw new Error('Übernahme ohne passenden Wiederholungsbeleg.');
      const signature=JSON.parse(value.state.operationRequests?.[operationId]??'null');
      const p=signature?.payload;
      if(signature?.type!=='receipt.draft.accept'||signature.targetEventId!==row.eventId||!p||p.eventId!==row.eventId||p.operationId!==operationId||p.draftId!==row.id||p.expectedWorkspaceRevision!==Number(a.appliedRevision)-1||!p.draftRowVersion
        ||stable(p.documentVersion)!==stable(a.documentVersion)||stable(p.reviewedFields)!==stable(a.reviewedFields)||stable(p.reviewDecisions)!==stable(a.reviewDecisions))throw new Error('Übernahme und unveränderlicher Vorgang widersprechen sich.');
      const h=(a.reviewedFields as {header:Record<string,unknown>}).header;
      for(const key of ['supplierId','number','scope','grossCents'])if((receipt.sourceBaseline as unknown as Record<string,unknown>)[key]!==h[key])throw new Error('Übernahme-Ausgangsstand widerspricht geprüften Feldern.');
      if((receipt.sourceBaseline.date??null)!==(h.date||null)||receipt.sourceBaseline.netCents!==null)throw new Error('Übernahme-Datum oder Netto falsch.');
      const firstPage=(a.documentVersion as import('./documents.ts').DraftPage[])[0];
      const firstDoc=documents.get(firstPage.documentId);
      if(receipt.sourceBaseline.documentUrl!==(firstDoc?.ref as import('./documents.ts').DocumentRef|undefined)?.webUrl)throw new Error('Beleg-Ausgangslink widerspricht dem Original.');
      const lines=(a.reviewedFields as {lines:import('./documents.ts').ExtractDraft['lines']}).lines.map(l=>({...(l.articleId?{articleId:l.articleId}:{}),name:l.description,quantity:l.quantity,unit:l.unit,netCents:null,grossCents:l.grossCents}));
      if(stable(lines)!==stable(receipt.sourceBaseline.lines))throw new Error('Übernommene Zeilen widersprechen dem Ausgangsstand.');
    }
    const history=snapshots(row);
    for(const [index,snapshot] of history.entries()) {
      const historical=index<history.length-1;
      const header=snapshot.header as {supplierId:string};
      if(header.supplierId&&!event.suppliers.some(s=>s.id===header.supplierId))throw new Error('Entwurf-Lieferantenbeziehung ungültig.');
      if((snapshot.lines as {articleId:string}[]).some(line=>line.articleId&&!event.articles.some(article=>article.id===line.articleId)))throw new Error('Entwurf-Artikelbeziehung ungültig.');
      const pages=snapshot.pages as import('./documents.ts').DraftPage[];
      if(pages.reduce((sum,page)=>sum+Number(documents.get(page.documentId)?.size??0),0)>20971520)throw new Error('Entwurf-Originalumfang überschritten.');
      for(const page of pages) {
        const document=documents.get(page.documentId);
        if(!document || document.eventId!==row.eventId)throw new Error('Entwurf-Originalbeziehung ungültig.');
        const source=snapshots(document).find(snapshot=>{
          const ref=snapshot.ref as import('./documents.ts').DocumentRef|undefined;
          return ref?.version===page.version && ref.sha256===page.sha256;
        });
        if(!source) {
          if(!historical)throw new Error('Entwurf-Originalbeziehung ungültig.');
          missing.push(`Entwurf ${row.id}: historischer Originalstand ${page.documentId} nicht belegt`);
        } else requireOriginal(page.documentId,source.ref as import('./documents.ts').DocumentRef,historical);
        // History deliberately contains no invented native RowVersion. Only current readback
        // attests one. An older reference needs evidence this source contract does not retain.
        const currentRef=document.ref as import('./documents.ts').DocumentRef|undefined;
        if(document.rowVersion!==page.documentRowVersion || currentRef?.version!==page.version || currentRef?.sha256!==page.sha256) {
          if(!historical)throw new Error('Entwurf-Originalbeziehung: aktuelle RowVersion stimmt nicht.');
          missing.push(`Entwurf ${row.id}: historische Dokument-RowVersion ${page.documentRowVersion} nicht belegt`);
        }
      }
    }
  }
  for(const event of events)for(const invoice of event.invoices)if(invoice.intake&&!drafts.has(invoice.intake.draftId))throw new Error('Übernahme-Entwurf fehlt im vollständigen Inventar.');

}
async function inspect(value: BackupInputs): Promise<string[]> {
  if (!value.environment || !value.workspaceId) throw new Error('Sicherungsumgebung / Workspace fehlt.');
  requireStateEnvelope(value.state);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 64 * 1024 * 1024) throw new Error('Sicherung überschreitet 64 MiB.');
  const missing: string[] = [];
  await inspectWorkspace(value, missing);
  const contract = value.sourceContract;
  if([value.state,...(value.state.archivedEvents??[])].some(e=>e.invoices.some(i=>i.intake))&&contract?.id!=='kitchen-documents-v1')throw new Error('Übernahmeherkunft benötigt vollständige Dokument- und Entwurfsicherung.');
  if(contract && !["kitchen-core-v1","kitchen-documents-v1"].includes(contract.id))throw new Error("Unbekannter Sicherungsumfang.");
  if (contract?.id === 'kitchen-core-v1' && (contract.id !== 'kitchen-core-v1' || contract.documents !== 'not_in_contract' || contract.drafts !== 'not_in_contract'
    || Object.keys(contract).length !== 3 || value.documents !== null || value.drafts !== null)) {
    throw new Error('Unbekannter oder widersprüchlicher Sicherungsumfang; Dokumentquellen dürfen nicht herabgestuft werden.');
  }
  for (const field of ['documents', 'drafts', 'operationReceipts'] as const) {
    if (contract?.id === 'kitchen-core-v1' && field !== 'operationReceipts') continue;
    if (value[field] === null) missing.push(`${field}: Quelle nicht gelesen`);
    else if (!Array.isArray(value[field])) throw new Error('Sicherungstabelle ungültig.');
  }
  if (contract?.id === 'kitchen-documents-v1') {
    if (contract.documents !== 'required' || contract.drafts !== 'required' || contract.manifestVersion !== 1 || Object.keys(contract).length !== 4) throw new Error('Dokument-Sicherungsvertrag ungültig.');
    await inspectDocumentStores(value, missing);
  } else if (value.documents?.length || value.drafts?.length) missing.push('Dokument-/Entwurftabellen: versionierte Schemaerweiterung noch zu prüfen');
  inspectReceipts(value, missing);
  await inspectOriginals(value, missing);
  return [...new Set(missing)];
}
export async function buildKitchenBackup(source: BackupSource): Promise<KitchenBackup> {
  if (!await source.authorize()) throw new Error('Vollsicherung erfordert bestätigte Eigentümerberechtigung.');
  const before = await source.read();
  const missing = await inspect(before);
  if (source.validateState) await source.validateState(before.state);
  else missing.push(SCHEMA_MISSING);
  if (!await source.authorize()) throw new Error('Eigentümerberechtigung nicht mehr bestätigt.');
  const after = await source.read();
  if (await backupHash(before) !== await backupHash(after)) throw new Error('Datenrevision, Dateiversion oder Wiederholungsbelege während Sicherung geändert.');
  const payload = {
    formatVersion: 1 as const, ...structuredClone(before), workspaceRevision: before.state.revision,
    createdAt: new Date().toISOString(), complete: missing.length === 0, missing,
  };
  return { ...payload, payloadHash: await backupHash(payload) };
}
export async function validateKitchenBackup(backup: KitchenBackup, validateState?: StateValidator) {
  const { payloadHash, ...payload } = backup;
  if (backup.formatVersion !== 1 || backup.workspaceRevision !== backup.state.revision) throw new Error('Sicherungsformat oder Revision ungültig.');
  if (await backupHash(payload) !== payloadHash) throw new Error('Sicherungs-Hash stimmt nicht.');
  const missing = await inspect(backup);
  const claimed = backup.missing.filter(reason => reason !== SCHEMA_MISSING);
  if (JSON.stringify(claimed) !== JSON.stringify(missing) || backup.complete !== (backup.missing.length === 0)) {
    throw new Error('Sicherungsvollständigkeit stimmt nicht.');
  }
  // A packet's own complete flag, policy name or checksum is never a schema proof.
  if (validateState) await validateState(backup.state);
  else missing.push(SCHEMA_MISSING);
  return { complete: missing.length === 0, missing };
}
export async function buildRepositoryBackup(repo: Repository, settings: Record<string, unknown>, originals: OriginalBackup[] = []) {
  const identity = JSON.stringify(repo.identity ?? null);
  const authorized = () => repo.canConfigure === true && repo.canClose === true
    && (repo.mode === 'local' || !!repo.identity) && JSON.stringify(repo.identity ?? null) === identity;
  let captured: BackupInputs | undefined;
  return buildKitchenBackup({
    authorize: async () => authorized(),
    read: async () => {
      if (!repo.backupSnapshot) throw new Error('Vollständige schreibgeschützte Sicherungsquelle ist in dieser Verbindung nicht verfügbar.');
      const snapshot = await repo.backupSnapshot();
      if (!authorized()) throw new Error('Identität oder Sicherungsberechtigung hat sich geändert.');
      if (repo.documents && snapshot.sourceContract?.id !== 'kitchen-documents-v1') throw new Error('Dokumentquellen dürfen nicht auf Kernbestand herabgestuft werden.');
      captured = snapshot;
      const manifest=structuredClone(originals);
      if (snapshot.sourceContract?.id === 'kitchen-documents-v1' && snapshot.documents) {
        for(const row of snapshot.documents) {
          const ref=row.ref as import('./documents.ts').DocumentRef|undefined;
          if(!ref)continue;
          const entry:OriginalBackup={id:String(row.id),itemId:ref.itemId,version:ref.version,sha256:ref.sha256};
          if(repo.documents) {
            try {const blob=await repo.documents.getOriginal(ref);entry.bytesBase64=encodeBytes(new Uint8Array(await blob.arrayBuffer()));}
            catch { /* Exact missing bytes remain an incomplete backup; never infer availability. */ }
          }
          manifest.push(entry);
        }
      }
      return { ...snapshot, settings: structuredClone(settings), documentManifest: manifest };
    },
    validateState: async state => {
      // Only this live authenticated response can attest the server's full nested policy run.
      const proof = captured?.schemaValidation;
      const evidence = captured?.workspaceEvidence;
      if (!['kitchen-core-v1', 'kitchen-documents-v1'].includes(captured?.sourceContract?.id ?? '')) throw new Error('Serverseitiger Sicherungsumfang fehlt.');
      if (!proof || proof.policy !== BACKUP_POLICY || !evidence || proof.rawStateSha256 !== evidence.rawStateSha256
        || await bytesHash(new TextEncoder().encode(evidence.rawState)) !== proof.rawStateSha256
        || await backupHash(JSON.parse(evidence.rawState)) !== await backupHash(state)) {
        throw new Error('Vollständige serverseitige Schemaprüfung ist nicht bestätigt.');
      }
    },
  });
}

/** User-selected bytes stay local; exact source hashes identify originals, not names. */
export async function selectOriginalFiles(state: KitchenState, files: Iterable<File>): Promise<OriginalBackup[]> {
  const required = new Set(requiredOriginals(state).map(original => original.hash));
  const selected = [...files];
  if (selected.length > 100 || selected.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024) {
    throw new Error('Höchstens 100 Originale mit zusammen 40 MiB auswählen.');
  }
  const originals = new Map<string, OriginalBackup>();
  for (const file of selected) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`Original ${file.name} überschreitet 20 MiB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await bytesHash(bytes);
    if (!required.has(hash)) throw new Error(`Datei ${file.name} passt zu keinem gespeicherten Original-Hash.`);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    originals.set(hash, { id: hash, sha256: hash, version: `sha256:${hash}`, itemId: `local:${hash}`, bytesBase64: btoa(binary) });
  }
  return [...originals.values()];
}
