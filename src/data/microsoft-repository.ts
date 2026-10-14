import { applyOperation } from "../domain/state.ts";
import type { KitchenState, Operation } from "../domain/state.ts";
import type { Repository } from "./repository.ts";
import { RejectedError } from "./repository.ts";

export interface KitchenApi {
  load: (requestJson: string) => Promise<{
    success: boolean;
    data?: { ResultJson?: string };
    error?: unknown;
  }>;
  commit: KitchenApi["load"];
}
export interface PendingStore {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
interface PendingRequest {
  operation: Operation;
  request: string;
}
const invalid = () =>
  new Error("Microsoft-Antwort ist ungültig; Speicherung nicht bestätigt.");
const object = (x: unknown): x is Record<string, any> =>
  !!x && typeof x === "object" && !Array.isArray(x);

const utf8Bytes = (value: string) => new TextEncoder().encode(value);
function preflight(candidate: KitchenState, request: string): void {
  if (utf8Bytes(JSON.stringify(candidate)).length > 524288) {
    throw new RejectedError(
      "Der Küchenbestand überschreitet 512 KiB. Diese Änderung wurde nicht übertragen.",
    );
  }
  if (utf8Bytes(request).length > 655360) {
    throw new RejectedError(
      "Die Anfrage überschreitet 640 KiB. Diese Änderung wurde nicht übertragen.",
    );
  }
  const bounded = (value: unknown, depth = 0): void => {
    if (depth > 32)
      throw new RejectedError("Die Änderung ist zu tief verschachtelt.");
    if (typeof value === "string" && value.length > 50000)
      throw new RejectedError("Ein Text der Änderung ist zu lang.");
    if (typeof value === "number" && !Number.isFinite(value))
      throw new RejectedError("Die Änderung enthält eine ungültige Zahl.");
    if (Array.isArray(value)) {
      if (value.length > 10000)
        throw new RejectedError("Der Küchenbestand enthält zu viele Einträge.");
      for (const item of value) bounded(item, depth + 1);
    } else if (object(value)) {
      const entries = Object.entries(value);
      if (entries.length > 10000)
        throw new RejectedError("Der Küchenbestand enthält zu viele Angaben.");
      for (const [name, item] of entries) {
        if (name.length > 200)
          throw new RejectedError("Eine Kennung der Änderung ist zu lang.");
        bounded(item, depth + 1);
      }
    }
  };
  bounded(JSON.parse(request));
  if (candidate.operationIds.some((id) => !id.trim() || id.length > 100)) {
    throw new RejectedError("Eine Vorgangs-ID ist ungültig.");
  }
}
async function requestHash(request: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8Bytes(request));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

// This protects the UI boundary. The server separately validates persisted-state invariants.
function stateValue(x: unknown): KitchenState {
  if (
    !object(x) ||
    x.schemaVersion !== 2 ||
    !Number.isSafeInteger(x.revision) ||
    x.revision < 0 ||
    !Array.isArray(x.operationIds) ||
    !x.operationIds.every((v: unknown) => typeof v === "string") ||
    !object(x.operationRequests ?? {})
  )
    throw invalid();
  for (const event of [x, ...(x.archivedEvents ?? [])]) {
    if (
      !object(event) ||
      !object(event.event) ||
      typeof event.event.id !== "string" ||
      typeof event.event.name !== "string" ||
      !Number.isInteger(event.event.year) ||
      !object(event.event.dates) ||
      typeof event.sourceNotice !== "string"
    )
      throw invalid();
    for (const key of [
      "suppliers",
      "articles",
      "planLines",
      "menu",
      "invoices",
      "sales",
      "movements",
      "orders",
      "dishPlan",
      "lessons",
    ]) {
      if (
        !Array.isArray(event[key]) ||
        !event[key].every((v: unknown) => object(v) && typeof v.id === "string")
      )
        throw invalid();
    }
    for (const article of event.articles) {
      if (
        typeof article.supplierId !== "string" ||
        typeof article.name !== "string" ||
        typeof article.unit !== "string" ||
        !(
          article.unitPriceCents === null ||
          typeof article.unitPriceCents === "number"
        )
      )
        throw invalid();
    }
    for (const menu of event.menu) {
      if (
        typeof menu.name !== "string" ||
        !Array.isArray(menu.recipe) ||
        !menu.recipe.every(
          (r: unknown) => object(r) && typeof r.articleId === "string",
        )
      )
        throw invalid();
    }
    for (const invoice of event.invoices) {
      if (
        typeof invoice.supplierId !== "string" ||
        typeof invoice.number !== "string" ||
        !Array.isArray(invoice.lines)
      )
        throw invalid();
    }
  }
  if (new TextEncoder().encode(JSON.stringify(x)).length > 524288)
    throw invalid();
  return structuredClone(x) as KitchenState;
}

export function createMicrosoftRepository(
  api: KitchenApi,
  workspaceId: string,
  store?: PendingStore,
): Repository {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      workspaceId,
    )
  ) {
    throw new Error("Microsoft-Arbeitsbereich-ID fehlt oder ist ungültig.");
  }
  workspaceId = workspaceId.toLowerCase();
  const key = `zunftkueche.pending.v1.${workspaceId}`;
  let current: KitchenState | null = null;
  let canWrite = false;
  let pending: PendingRequest | null = null;
  const prior = store?.getItem(key);
  if (prior) {
    const parsed = JSON.parse(prior);
    if (
      !object(parsed) ||
      typeof parsed.request !== "string" ||
      !object(parsed.operation)
    )
      throw invalid();
    const request = JSON.parse(parsed.request);
    if (
      request.workspaceId !== workspaceId ||
      request.operationId !== parsed.operation.id
    )
      throw invalid();
    pending = parsed as PendingRequest;
  }

  async function envelope(result: Awaited<ReturnType<KitchenApi["load"]>>) {
    if (
      result?.success !== true ||
      typeof result.data?.ResultJson !== "string"
    ) {
      throw new Error(
        "Microsoft hat die Anfrage nicht bestätigt. Bitte Verbindung und Berechtigung prüfen.",
      );
    }
    const value: unknown = JSON.parse(result.data.ResultJson);
    if (
      !object(value) ||
      value.protocolVersion !== 1 ||
      value.workspaceId !== workspaceId
    )
      throw invalid();
    return value;
  }

  const repo: Repository = {
    mode: "microsoft",
    get canWrite() {
      return canWrite;
    },
    async load() {
      canWrite = false;
      const response = await envelope(
        await api.load(JSON.stringify({ protocolVersion: 1, workspaceId })),
      );
      if (typeof response.canWrite !== "boolean") throw invalid();
      current = stateValue(response.state);
      canWrite = response.canWrite;
      // A browser reload resumes the exact persisted request, including its original revision.
      if (pending) {
        if (!canWrite)
          throw new Error("Eine offene Änderung benötigt Schreibberechtigung.");
        try {
          return (await repo.commit(pending.operation)).state;
        } catch (error) {
          // Only a checked server rejection clears pending; unknown errors still block replay.
          if (error instanceof RejectedError && pending === null)
            return structuredClone(current!);
          throw error;
        }
      }
      return structuredClone(current);
    },
    async commit(op) {
      if (!current || !canWrite)
        throw new RejectedError("Keine bestätigte Schreibberechtigung.");
      if (pending && JSON.stringify(pending.operation) !== JSON.stringify(op)) {
        throw new RejectedError(
          "Vorgangs-ID oder Inhalt einer offenen Änderung darf nicht geändert werden.",
        );
      }
      if (!pending) {
        let result;
        try {
          result = applyOperation(current, op);
        } catch (error) {
          throw new RejectedError((error as Error).message);
        }
        if (result.status === "conflict")
          return { status: "conflict", state: structuredClone(current) };
        const request = JSON.stringify({
          protocolVersion: 1,
          workspaceId,
          operationId: op.id,
          expectedRevision: op.baseRevision,
          operation: { type: op.type, payload: op.payload },
          candidateState: result.state,
        });
        preflight(result.state, request);
        pending = { operation: structuredClone(op), request };
        try {
          store?.setItem(key, JSON.stringify(pending));
        } catch {
          pending = null;
          throw new RejectedError(
            "Offene Änderung konnte nicht für eine sichere Wiederholung gesichert werden.",
          );
        }
      }
      const response = await envelope(await api.commit(pending.request));
      if (
        response.operationId !== op.id ||
        !["saved", "conflict", "rejected"].includes(response.status)
      )
        throw invalid();
      const next = stateValue(response.state);
      if (response.status === "rejected") {
        if (
          response.rejectionCode !== "candidate_validation" ||
          response.appliedRevision !== null ||
          response.requestHash !== (await requestHash(pending.request)) ||
          next.revision !== op.baseRevision ||
          next.operationIds.includes(op.id)
        )
          throw invalid();
        store?.removeItem(key);
        pending = null;
        current = next;
        throw new RejectedError(
          "Der Server hat diese Änderung vor dem Speichern abgelehnt. Bitte die Eingabe korrigieren.",
        );
      }
      if (response.status === "saved") {
        if (
          !Number.isSafeInteger(response.appliedRevision) ||
          response.appliedRevision !== op.baseRevision + 1 ||
          response.appliedRevision > next.revision ||
          !next.operationIds.includes(op.id) ||
          typeof next.operationRequests?.[op.id] !== "string"
        )
          throw invalid();
      } else if (
        response.appliedRevision !== null ||
        next.revision < op.baseRevision
      )
        throw invalid();
      store?.removeItem(key);
      pending = null;
      current = next;
      return { status: response.status, state: structuredClone(next) };
    },
  };
  return repo;
}
