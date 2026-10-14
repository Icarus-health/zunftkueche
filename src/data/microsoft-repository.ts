import {applyOperation} from '../domain/state.ts';
import type {KitchenState, Operation} from '../domain/state.ts';
import type {Repository} from './repository.ts';
import {RejectedError} from './repository.ts';

export interface KitchenApi {
  load: (requestJson: string) => Promise<{
    success: boolean;
    data?: {ResultJson?: string};
    error?: unknown;
  }>;
  commit: KitchenApi['load'];
}
export interface PendingStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
interface PendingRequest {operation: Operation; request: string}
const invalid = () => new Error('Microsoft-Antwort ist ungültig; Speicherung nicht bestätigt.');
const object = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);

// This protects the UI boundary. The server separately validates persisted-state invariants.
function stateValue(x: unknown): KitchenState {
  if (!object(x) || x.schemaVersion !== 2 || !Number.isSafeInteger(x.revision) || x.revision < 0 ||
      !Array.isArray(x.operationIds) || !x.operationIds.every((v: unknown) => typeof v === 'string') ||
      !object(x.operationRequests ?? {})) throw invalid();
  for (const event of [x, ...(x.archivedEvents ?? [])]) {
    if (!object(event) || !object(event.event) || typeof event.event.id !== 'string' ||
        typeof event.event.name !== 'string' || !Number.isInteger(event.event.year) ||
        !object(event.event.dates) || typeof event.sourceNotice !== 'string') throw invalid();
    for (const key of ['suppliers', 'articles', 'planLines', 'menu', 'invoices', 'sales', 'movements', 'orders', 'dishPlan', 'lessons']) {
      if (!Array.isArray(event[key]) || !event[key].every((v: unknown) => object(v) && typeof v.id === 'string')) throw invalid();
    }
    for (const article of event.articles) {
      if (typeof article.supplierId !== 'string' || typeof article.name !== 'string' || typeof article.unit !== 'string' ||
          !(article.unitPriceCents === null || typeof article.unitPriceCents === 'number')) throw invalid();
    }
    for (const menu of event.menu) {
      if (typeof menu.name !== 'string' || !Array.isArray(menu.recipe) ||
          !menu.recipe.every((r: unknown) => object(r) && typeof r.articleId === 'string')) throw invalid();
    }
    for (const invoice of event.invoices) {
      if (typeof invoice.supplierId !== 'string' || typeof invoice.number !== 'string' || !Array.isArray(invoice.lines)) throw invalid();
    }
  }
  if (new TextEncoder().encode(JSON.stringify(x)).length > 524288) throw invalid();
  return structuredClone(x) as KitchenState;
}

export function createMicrosoftRepository(api: KitchenApi, workspaceId: string, store?: PendingStore): Repository {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId)) {
    throw new Error('Microsoft-Arbeitsbereich-ID fehlt oder ist ungültig.');
  }
  workspaceId = workspaceId.toLowerCase();
  const key = `zunftkueche.pending.v1.${workspaceId}`;
  let current: KitchenState | null = null;
  let canWrite = false;
  let pending: PendingRequest | null = null;
  const prior = store?.getItem(key);
  if (prior) {
    const parsed = JSON.parse(prior);
    if (!object(parsed) || typeof parsed.request !== 'string' || !object(parsed.operation)) throw invalid();
    const request = JSON.parse(parsed.request);
    if (request.workspaceId !== workspaceId || request.operationId !== parsed.operation.id) throw invalid();
    pending = parsed as PendingRequest;
  }

  async function envelope(result: Awaited<ReturnType<KitchenApi['load']>>) {
    if (result?.success !== true || typeof result.data?.ResultJson !== 'string') {
      throw new Error('Microsoft hat die Anfrage nicht bestätigt. Bitte Verbindung und Berechtigung prüfen.');
    }
    const value: unknown = JSON.parse(result.data.ResultJson);
    if (!object(value) || value.protocolVersion !== 1 || value.workspaceId !== workspaceId) throw invalid();
    return value;
  }

  const repo: Repository = {
    mode: 'microsoft',
    get canWrite() {return canWrite;},
    async load() {
      canWrite = false;
      const response = await envelope(await api.load(JSON.stringify({protocolVersion: 1, workspaceId})));
      if (typeof response.canWrite !== 'boolean') throw invalid();
      current = stateValue(response.state);
      canWrite = response.canWrite;
      // A browser reload resumes the exact persisted request, including its original revision.
      if (pending) {
        if (!canWrite) throw new Error('Eine offene Änderung benötigt Schreibberechtigung.');
        return (await repo.commit(pending.operation)).state;
      }
      return structuredClone(current);
    },
    async commit(op) {
      if (!current || !canWrite) throw new RejectedError('Keine bestätigte Schreibberechtigung.');
      if (pending && JSON.stringify(pending.operation) !== JSON.stringify(op)) {
        throw new RejectedError('Vorgangs-ID oder Inhalt einer offenen Änderung darf nicht geändert werden.');
      }
      if (!pending) {
        let result;
        try {result = applyOperation(current, op);}
        catch (error) {throw new RejectedError((error as Error).message);}
        if (result.status === 'conflict') return {status: 'conflict', state: structuredClone(current)};
        const request = JSON.stringify({
          protocolVersion: 1, workspaceId, operationId: op.id, expectedRevision: op.baseRevision,
          operation: {type: op.type, payload: op.payload}, candidateState: result.state,
        });
        pending = {operation: structuredClone(op), request};
        try {store?.setItem(key, JSON.stringify(pending));}
        catch {
          pending = null;
          throw new RejectedError('Offene Änderung konnte nicht für eine sichere Wiederholung gesichert werden.');
        }
      }
      const response = await envelope(await api.commit(pending.request));
      if (response.operationId !== op.id || (response.status !== 'saved' && response.status !== 'conflict')) throw invalid();
      const next = stateValue(response.state);
      if (response.status === 'saved') {
        if (!Number.isSafeInteger(response.appliedRevision) || response.appliedRevision !== op.baseRevision + 1 ||
            response.appliedRevision > next.revision || !next.operationIds.includes(op.id) ||
            typeof next.operationRequests?.[op.id] !== 'string') throw invalid();
      } else if (response.appliedRevision !== null || next.revision < op.baseRevision) throw invalid();
      store?.removeItem(key);
      pending = null;
      current = next;
      return {status: response.status, state: structuredClone(next)};
    },
  };
  return repo;
}
