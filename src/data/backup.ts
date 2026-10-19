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
  sourceContract?: { id: 'kitchen-core-v1'; documents: 'not_in_contract'; drafts: 'not_in_contract' };
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
    if (record.documentUrl && !source?.hash) missing.push('Original aus Dokumentlink: Bytes und Hashzuordnung fehlen');
    Object.values(record).forEach(inspectUnhashed);
  }
  inspectUnhashed(value.state);
}
async function inspect(value: BackupInputs): Promise<string[]> {
  if (!value.environment || !value.workspaceId) throw new Error('Sicherungsumgebung / Workspace fehlt.');
  requireStateEnvelope(value.state);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 64 * 1024 * 1024) throw new Error('Sicherung überschreitet 64 MiB.');
  const missing: string[] = [];
  await inspectWorkspace(value, missing);
  const contract = value.sourceContract;
  if (contract && (contract.id !== 'kitchen-core-v1' || contract.documents !== 'not_in_contract' || contract.drafts !== 'not_in_contract'
    || Object.keys(contract).length !== 3 || value.documents !== null || value.drafts !== null)) {
    throw new Error('Unbekannter oder widersprüchlicher Sicherungsumfang; Dokumentquellen dürfen nicht herabgestuft werden.');
  }
  for (const field of ['documents', 'drafts', 'operationReceipts'] as const) {
    if (contract && field !== 'operationReceipts') continue;
    if (value[field] === null) missing.push(`${field}: Quelle nicht gelesen`);
    else if (!Array.isArray(value[field])) throw new Error('Sicherungstabelle ungültig.');
  }
  if (value.documents?.length || value.drafts?.length) missing.push('Dokument-/Entwurftabellen: versionierte Schemaerweiterung noch zu prüfen');
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
      captured = snapshot;
      return { ...snapshot, settings: structuredClone(settings), documentManifest: structuredClone(originals) };
    },
    validateState: async state => {
      // Only this live authenticated response can attest the server's full nested policy run.
      const proof = captured?.schemaValidation;
      const evidence = captured?.workspaceEvidence;
      if (captured?.sourceContract?.id !== 'kitchen-core-v1') throw new Error('Serverseitiger Sicherungsumfang fehlt.');
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
