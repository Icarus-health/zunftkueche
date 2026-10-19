import {buildRepositoryBackup} from './data/backup.ts';
import {downloadReport} from './data/exports.ts';
import {newEntryLocation} from "./domain/locations.ts";
import Settings from "./screens/Settings.tsx";
import {projectEvent} from "./domain/event-context.ts";
import {defaultPreferences,loadPreferences,savePreferences} from "./data/preferences.ts";
import type {UserPreferences} from "./data/preferences.ts";
import { requestDraftNavigation } from "./hooks/useDraftGuard.ts";
import { useEffect, useState } from "react";
import {
  ChefHat,
  House,
  ForkKnife,
  ClipboardText,
  Truck,
  Receipt,
  ChartBar,
  ArrowClockwise,
  CheckCircle,
  WarningCircle,
  Database,
  CalendarBlank,
  Plus,
} from "@phosphor-icons/react";
import type { KitchenState } from "./domain/state.ts";
import { getRepository } from "./data/repository.ts";
import type { Repository } from "./data/repository.ts";
import { SaveController } from "./data/save-controller.ts";
import type { SaveStatus } from "./data/save-controller.ts";
import { Modal, SavePendingContext } from "./components/shared.tsx";
import { eventDate, deliveryDays } from "./ui/facts.ts";
import Home from "./screens/Home.tsx";
import Planning from "./screens/Planning.tsx";
import Orders from "./screens/Orders.tsx";
import Deliveries from "./screens/Deliveries.tsx";
import Receipts from "./screens/Receipts.tsx";
import Analysis from "./screens/Analysis.tsx";
import Masters from "./screens/Masters.tsx";
export type Screen =
  | "Übersicht"
  | "Stammdaten"
  | "Planung"
  | "Bestellungen"
  | "Lieferungen"
  | "Belege"
  | "Auswertung"
  | "Einstellungen";
export interface ScreenProps {
  state: KitchenState;
  busy: boolean;
  readOnly: boolean;
  canClose?: boolean;
  mode: "local" | "microsoft";
  saveError: string;
  lastLocation?: string;
  commit: (type: string, payload: unknown) => Promise<boolean>;
  go: (screen: Screen, supplier?: string) => void;
}
const nav = [
  ["Übersicht", House],
  ["Planung", ForkKnife],
  ["Bestellungen", ClipboardText],
  ["Lieferungen", Truck],
  ["Belege", Receipt],
  ["Auswertung", ChartBar],
  ["Stammdaten", Database],
  ["Einstellungen", CalendarBlank],
] as const;
export default function App() {
  const [state, setState] = useState<KitchenState | null>(null),
    [screen, setScreen] = useState<Screen>("Übersicht"),
    [supplier, setSupplier] = useState(""),
    [viewEvent, setViewEvent] = useState<string | null>(null);
  const [preferences,setPreferences]=useState<UserPreferences>({...defaultPreferences});
  const [refreshing, setRefreshing] = useState(false),
    [loadError, setLoadError] = useState(""),
    [eventDialog, setEventDialog] = useState<"create" | "dates" | null>(null);
  const [repository] = useState<{ repo: Repository | null; error: string }>(
    () => {
      try {
        return { repo: getRepository(), error: "" };
      } catch (e) {
        return { repo: null, error: (e as Error).message };
      }
    },
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({
    busy: false,
    pending: null,
    error: "",
    message: "",
  });
  const [controller] = useState(
    () =>
      new SaveController(
        () => {
          if (!repository.repo) throw new Error(repository.error);
          return repository.repo;
        },
        setState,
        setSaveStatus,
      ),
  );
  const { pending, message } = saveStatus,
    saving = saveStatus.busy || refreshing,
    error = saveStatus.error || loadError,
    mode = repository.repo?.mode ?? "microsoft";
  const readOnly = repository.repo?.canWrite !== true;
  function updatePreferences(value:UserPreferences) {
    const eventId=value.selectedEventId||state?.event.id;
    if(state && eventId && [state.event.id,...(state.archivedEvents??[]).map(e=>e.event.id)].includes(eventId))value={...value,lastLocation:newEntryLocation(projectEvent(state,eventId),value.lastLocation)};
    setPreferences(value);setViewEvent(value.selectedEventId||null);
    try {savePreferences(localStorage,repository.repo?.identity??null,value);}catch {setLoadError("Persönliche Auswahl konnte auf diesem Gerät nicht gespeichert werden.");}
  }
  async function loadKitchen() {
    setPreferences({...defaultPreferences});setViewEvent(null);setSupplier("");setScreen("Übersicht");setState(null);
    const next=await repository.repo!.load();
    let preferenceStorage:Storage|undefined;try{preferenceStorage=window.localStorage;}catch{}
    const value=loadPreferences(preferenceStorage,repository.repo!.identity??null,[next.event.id,...(next.archivedEvents??[]).map(e=>e.event.id)]);
    value.lastLocation=newEntryLocation(projectEvent(next,value.selectedEventId),value.lastLocation);
    setPreferences(value);setViewEvent(value.selectedEventId);setSupplier(value.lastSupplierId);setScreen(value.startScreen as Screen);setState(next);
  }
  useEffect(() => {
    if (!repository.repo) {
      setLoadError(repository.error);
      return;
    }
    loadKitchen()
      .catch((e) => setLoadError(e.message));
  }, [repository]);
  const identityScope=repository.repo?.identity ? JSON.stringify(repository.repo.identity) : "";
  useEffect(() => {
    if(!identityScope){setPreferences({...defaultPreferences});setViewEvent(null);setSupplier("");}
  },[identityScope]);
  useEffect(() => {
    if(!state)return;
    const id=preferences.selectedEventId||state.event.id;
    if(![state.event.id,...(state.archivedEvents??[]).map(e=>e.event.id)].includes(id))return;
    const lastLocation=newEntryLocation(projectEvent(state,id),preferences.lastLocation);
    if(lastLocation!==preferences.lastLocation)updatePreferences({...preferences,lastLocation});
  },[state,preferences.selectedEventId,preferences.lastLocation]);
  useEffect(() => {
    if (!pending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pending]);
  async function commit(type: string, payload: unknown) {
    if (!state || refreshing || readOnly) return false;
    const id=crypto.randomUUID();
    const saved=await controller.save({
      id,
      targetEventId: viewEvent??state.event.id,
      baseRevision: state.revision ?? 0,
      type,
      payload,
    });
    if(saved){const p=payload as Record<string,unknown>;updatePreferences({...preferences,selectedEventId:type==='event.create'?id:(viewEvent??state.event.id),lastSupplierId:typeof p.supplierId==='string'?p.supplierId:preferences.lastSupplierId,lastLocation:typeof p.location==='string'?p.location:preferences.lastLocation});}
    return saved;
  }
  function go(target: Screen, supplierId?: string) {
    if (controller.status.pending) return;
    requestDraftNavigation(() => {
      if (supplierId) setSupplier(supplierId);
      setScreen(target);
      controller.clearNotice();
      setLoadError("");
    });
  }
  useEffect(() => {
    window.scrollTo({top: 0, behavior: "instant"});
  }, [screen]);
  async function refresh() {
    if (controller.status.pending) return;
    setRefreshing(true);
    try {
      if (!repository.repo) throw new Error(repository.error);
      await loadKitchen();
      setLoadError("");
      controller.clearNotice();
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  if (!state)
    return (
      <div className="loading-shell">
        <ChefHat size={42} />
        <h1>Zunftküche</h1>
        <p role={error ? "alert" : "status"}>
          {error || "Deine Küche wird geladen …"}
        </p>
        {error && (
          <button
            className="button secondary"
            disabled={refreshing}
            onClick={refresh}
          >
            Erneut laden
          </button>
        )}
      </div>
    );
  const selectedId=[state.event.id,...(state.archivedEvents??[]).map(e=>e.event.id)].includes(viewEvent??"")?viewEvent!:state.event.id;
  const viewState = projectEvent(state,selectedId);
  const props: ScreenProps = {
    state: viewState,
    canClose:repository.repo?.canClose===true,
    busy: saving || Boolean(pending) || readOnly,
    readOnly,
    mode,
    saveError: error,
    lastLocation: preferences.lastLocation,
    commit,
    go,
  };
  const events = [
    state.event,
    ...(state.archivedEvents ?? []).map((a) => a.event),
  ];
  return (
    <SavePendingContext value={saving || Boolean(pending)}>
    <div className={`app-shell density-${preferences.displayDensity}`}>
      <aside className="sidebar">
        <div className="brand">
          <ChefHat size={34} />
          <strong>Zunftküche</strong>
        </div>
        <nav aria-label="Küchenverwaltung">
          {nav.map(([name, Icon]) => (
            <button
              key={name}
              className={screen === name ? "nav-item active" : "nav-item"}
              title={name}
              disabled={saving || Boolean(pending)}
              aria-label={
                name === "Lieferungen" ? "Lieferungen und Lager" : name
              }
              aria-current={screen === name ? "page" : undefined}
              onClick={() => go(name)}
            >
              <Icon size={23} />
              <span>
                {name === "Lieferungen" ? "Lieferungen & Lager" : name}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>{viewState.event.name}</span>
          <small>Schelmenzunft Staufen</small>
        </div>
      </aside>
      <div className="main-shell">
        <div
          className={mode === "local" ? "local-banner" : "connection-banner"}
        >
          <span>
            {mode === "local"
              ? "Lokale Arbeitsversion · Daten werden auf diesem Rechner gespeichert."
              : "Microsoft-Arbeitsversion · Speicherung über die eingerichtete Datenverbindung."}
          </span>
        </div>
        {repository.repo?.blockedReason && <div className="alert" role="alert">{repository.repo.blockedReason}</div>}
        {readOnly && (
          <div className="reader-banner" role="status">
            Leseansicht · Für diese Sitzung ist keine Schreibberechtigung
            bestätigt.
          </div>
        )}
        <div className="context-bar">
          <label className="event-select">
            Veranstaltung
            <select
              value={viewState.event.id}
              disabled={saving || Boolean(pending)}
              onChange={(e) => {
                const id = e.target.value;
                requestDraftNavigation(() => {
                  updatePreferences({...preferences,selectedEventId:id});
                });
              }}
            >
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} {event.year}
                </option>
              ))}
            </select>
          </label>
          <details className="context-menu">
            <summary>Veranstaltung & Daten</summary>
            <div className="context-right">
              <button
                className="button secondary small"
                disabled={props.busy || repository.repo?.canConfigure!==true}
                onClick={() => setEventDialog("dates")}
              >
                <CalendarBlank size={18} />
                Termine
              </button>
              <button
                className="button secondary small"
                disabled={props.busy || repository.repo?.canConfigure!==true}
                onClick={() => setEventDialog("create")}
              >
                <Plus size={18} />
                Neue Veranstaltung
              </button>
              <button
                className="icon-button"
                aria-label="Daten neu laden"
                disabled={saving || Boolean(pending)}
                onClick={() => requestDraftNavigation(() => { void refresh(); })}
              >
                <ArrowClockwise size={21} />
              </button>
            </div>
          </details>
        </div>
        <main>
          {error && (
            <div className="alert" role="alert">
              <WarningCircle size={23} />
              <div>
                {error}
                {pending && (
                  <button
                    className="button secondary small"
                    disabled={saving}
                    onClick={() => controller.retry()}
                  >
                    Erneut übertragen
                  </button>
                )}
              </div>
            </div>
          )}
          {message && (
            <div className="save-status" role="status">
              {saving ? <ArrowClockwise size={17} /> : error || pending ? <WarningCircle size={17} /> : <CheckCircle size={17} />}
              {mode === "microsoft" && message === "Lokal gespeichert"
                ? "Gespeichert"
                : message}
            </div>
          )}
          {screen === "Einstellungen" && <Settings
            key={viewState.event.id} {...props} preferences={preferences} onPreferences={updatePreferences}
            onBackup={async originals => {
              if (!repository.repo) throw new Error("Datenverbindung fehlt.");
              const backup = await buildRepositoryBackup(repository.repo, { personalPreferences: preferences }, originals);
              const name = `${backup.complete ? "Vollstaendige" : "Unvollstaendige"}-Kuechen-Kernbestand-R${backup.workspaceRevision}.json`;
              downloadReport(JSON.stringify(backup, null, 2), name, "application/json");
              return backup.missing;
            }}
            canConfigure={repository.repo?.canConfigure === true} canClose={repository.repo?.canClose === true}
            storageBytes={new TextEncoder().encode(JSON.stringify(state)).length}
          />}
          {screen === "Übersicht" && (
            <Home key={viewState.event.id} {...props} />
          )}
          {screen === "Stammdaten" && (
            <Masters key={viewState.event.id} {...props} />
          )}
          {screen === "Planung" && (
            <Planning key={viewState.event.id} {...props} />
          )}
          {screen === "Bestellungen" && (
            <Orders
              key={viewState.event.id}
              {...props}
              initialSupplier={supplier}
            />
          )}
          {screen === "Lieferungen" && (
            <Deliveries key={viewState.event.id} {...props} />
          )}
          {screen === "Belege" && (
            <Receipts key={viewState.event.id} {...props} />
          )}
          {screen === "Auswertung" && (
            <Analysis key={viewState.event.id} {...props} />
          )}
        </main>
      </div>
      {eventDialog && (
        <EventEditor
          key={`${eventDialog}:${state.event.id}`}
          {...props}
          kind={eventDialog}
          onClose={() => setEventDialog(null)}
        />
      )}
    </div>
    </SavePendingContext>
  );
}
function EventEditor({
  state,
  busy,
  commit,
  saveError,
  kind,
  onClose,
}: ScreenProps & { kind: "create" | "dates"; onClose: () => void }) {
  const [name, setName] = useState(state.event.name),
    [year, setYear] = useState(String(state.event.year + 1)),
    [copyPlan, setCopyPlan] = useState(false),
    [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const ok = await commit(
        kind === "create" ? "event.create" : "event.dates",
        kind === "create"
          ? { name, year: Number(year), copyPlan }
          : {
              dates: Object.fromEntries(
                deliveryDays.map((day) => [
                  day,
                  String(
                    new FormData(e.currentTarget).get(`date-${day}`) ?? "",
                  ) || null,
                ]),
              ),
            },
      );
      if (ok) onClose();
      else
        setError(
          "Änderung nicht gespeichert. Bitte den Hinweis oben beachten.",
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={
        kind === "create"
          ? "Neue Veranstaltung starten"
          : "Veranstaltungstermine"
      }
      onClose={onClose}
    >
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          {kind === "create" ? (
            <>
              <p>
                Stammdaten und Rezepturen werden übernommen. Die aktuelle
                Veranstaltung bleibt vollständig auswählbar. Neue Verkäufe,
                Bestände, Bestellversionen und Rechnungen beginnen leer;
                Einkaufspreise müssen neu bestätigt werden.
              </p>
              <label>
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                />
              </label>
              <label>
                Jahr
                <input
                  required
                  type="number"
                  min="1900"
                  max="2200"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={copyPlan}
                  onChange={(e) => setCopyPlan(e.target.checked)}
                />
                Bisherige Speisen- und Einkaufsmengen als Planung übernehmen
              </label>
            </>
          ) : (
            <>
              <p>
                Die Termine erscheinen in der Planung und in Bestellvorschauen.
              </p>
              <div className="form-row">
                {deliveryDays.map((day) => (
                  <label key={day}>
                    {day} · bisher {eventDate(state, day)}
                    <input
                      name={`date-${day}`}
                      type="date"
                      defaultValue={state.event.dates[day] ?? ""}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {(saveError || error) && (
            <p className="field-error" role="alert">
              {saveError || error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button primary" type="submit">
              {kind === "create"
                ? "Veranstaltung anlegen"
                : "Termine speichern"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
