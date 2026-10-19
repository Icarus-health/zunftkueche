import {ReceivingList} from '../components/ReceivingList.tsx';
import {
  CorrectionDialog,
  AuditStamp,
} from "../components/CorrectionDialog.tsx";
import { movementQuantity } from "../domain/corrections.ts";
import {
  activeLocations,
  historicalLocations,
  newEntryLocation,
  sameLocation,
} from "../domain/locations.ts";
import { useDraftGuard } from "../hooks/useDraftGuard.ts";
import { DiscardChangesDialog } from "../components/DiscardChangesDialog.tsx";
import { ResponsiveTable } from "../components/MobileItemCard.tsx";
import { useState } from "react";
import { Check, Truck } from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import {
  Heading,
  useDraftNavigation,
  Notice,
  Empty,
  amount,
  shownAmount,
  Tabs,
} from "../components/shared.tsx";
import { parseQuantity } from "../domain/kitchen.ts";
import { stockSummary } from "../domain/workflow.ts";
import { deliveryDays } from "../ui/facts.ts";
const kinds = [
  ["stock.opening", "Anfangsbestand", "Anfangsbestand"],
  ["delivery.record", "Lieferung", "Lieferung"],
  ["stock.return", "Rückgabe", "Rückgabe"],
  ["stock.consume", "Verbrauch", "Verbrauch"],
  ["stock.count", "Zählung", "Zählung"],
  ["stock.waste", "Abfall", "Abfall"],
] as const;
export default function Deliveries(props: ScreenProps) {
 const {
  state,
  busy,
  commit,
  go,
  saveError,
  lastLocation,
}=props;
  const [correcting, setCorrecting] = useState<string | null>(null);
  const correction = state.movements.find((m) => m.id === correcting);
  const { navigate, pending } = useDraftNavigation();
  const [tab, setTab] = useState("Erfassen"),
    [type, setType] = useState<string>("delivery.record"),
    [supplier, setSupplier] = useState(""),
    [article, setArticle] = useState(state.articles[0]?.id ?? ""),
    [day, setDay] = useState("Freitag"),
    [raw, setRaw] = useState(""),
    [location, setLocation] = useState(newEntryLocation(state, lastLocation)),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const draft = useDraftGuard({
    dirty: raw !== "" || note !== "",
    onDiscard: () => {
      setRaw("");
      setNote("");
      setError("");
    },
  });
  const articles = state.articles.filter(
      (a) => !supplier || a.supplierId === supplier,
    ),
    selected = state.articles.find((a) => a.id === article),
    kind = kinds.find((k) => k[0] === type)![1],
    locations =
      tab === "Erfassen" ? activeLocations(state) : historicalLocations(state),
    summary = selected ? stockSummary(state, selected.id, location) : null;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const quantity = parseQuantity(raw);
      if (quantity === null)
        throw new Error("Bitte eine tatsächliche Menge eintragen.");
      const payload =
        type === "stock.opening"
          ? { articleId: article, quantity, location }
          : { articleId: article, day, quantity, location, note };
      if (await commit(type, payload)) {
        setRaw("");
        setNote("");
        setError("");
      } else
        setError("Noch nicht gespeichert. Bitte den Hinweis oben beachten.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const entries = state.movements.filter(
    (m) =>
      sameLocation(state, m.location, location) &&
      (!supplier ||
        state.articles.some(
          (a) => a.id === m.articleId && a.supplierId === supplier,
        )) &&
      m.articleId === article,
  );
  return (
    <>
      {draft.confirming && (
        <DiscardChangesDialog
          onDiscard={draft.confirmDiscard}
          onKeepEditing={draft.keepEditing}
        />
      )}
      {correction && (
        <CorrectionDialog
          title="Menge berichtigen"
          label="Berichtigte Menge"
          value={movementQuantity(state, correction)}
          busy={busy}
          onClose={() => setCorrecting(null)}
          onSave={(replacementQuantity, reason) =>
            commit("movement.correct", {
              movementId: correction.id,
              replacementQuantity,
              reason,
            })
          }
        />
      )}
      <Heading eyebrow="Tatsächliche Mengen" title="Lieferungen und Lager">
        Anfang, Zu- und Abgänge ausdrücklich erfassen; gezählte Reste bleiben
        separat.
      </Heading>
      <ReceivingList {...props}/>
      <Tabs
        items={["Erfassen", "Bestandsübersicht"]}
        value={tab}
        onChange={(next) => {
          setTab(next);
          if (next === "Erfassen")
            setLocation(newEntryLocation(state, location));
        }}
        label="Lageransicht"
      />
      <div className="toolbar">
        <label>
          Lieferant
          <select
            value={supplier}
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value;
              navigate(() => {
                setSupplier(value);
                setArticle(
                  state.articles.find((a) => !value || a.supplierId === value)
                    ?.id ?? "",
                );
                setError("");
              });
            }}
          >
            <option value="">Alle Lieferanten</option>
            {state.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ort
          <select
            value={location}
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value;
              navigate(() => setLocation(value));
            }}
          >
            {!locations.length && (
              <option value="">Kein aktiver Ort eingerichtet</option>
            )}
            {locations.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        {tab === "Bestandsübersicht" && (
          <label className="search-field">
            Artikel suchen
            <input
              type="search"
              value={search}
              onChange={(e) => {
                const value = e.target.value;
                navigate(() => setSearch(value));
              }}
            />
          </label>
        )}
      </div>
      {tab === "Erfassen" ? (
        articles.length ? (
          <>
            <div className="two-column">
              <section className="form-card">
                <h2>
                  <Truck size={24} />
                  {kind} erfassen
                </h2>
                {!activeLocations(state).length && (
                  <p role="status">
                    Bitte zuerst einen aktiven Ort in den Einstellungen
                    einrichten. Historische Bestände bleiben in der
                    Bestandsübersicht sichtbar.
                  </p>
                )}
                <form onSubmit={save}>
                  <fieldset
                    disabled={
                      busy || !activeLocations(state).includes(location)
                    }
                  >
                    <label>
                      Art der Erfassung
                      <select
                        value={type}
                        onChange={(e) => {
                          const value = e.target.value;
                          navigate(() => {
                            setType(value);
                            setError("");
                          });
                        }}
                      >
                        {kinds.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Artikel
                      <select
                        value={article}
                        onChange={(e) => {
                          const value = e.target.value;
                          navigate(() => {
                            setArticle(value);
                            setError("");
                          });
                        }}
                      >
                        {articles.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} · {a.unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    {type !== "stock.opening" && (
                      <label>
                        Tag
                        <select
                          value={day}
                          onChange={(e) => {
                            const value = e.target.value;
                            navigate(() => setDay(value));
                          }}
                        >
                          {deliveryDays.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      {type === "stock.count"
                        ? "Gezählte Restmenge"
                        : "Tatsächliche Menge"}{" "}
                      ({selected?.unit ?? "Einheit"})
                      <input
                        required
                        inputMode="decimal"
                        placeholder="Menge eingeben, ausdrücklich 0 möglich"
                        value={raw}
                        onChange={(e) => setRaw(e.target.value)}
                      />
                    </label>
                    {type !== "stock.opening" && (
                      <label>
                        Notiz (optional)
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          rows={2}
                          maxLength={1000}
                        />
                      </label>
                    )}
                    {type === "stock.opening" && summary?.opening !== null && (
                      <Notice>
                        Der neue Anfangsbestand ersetzt den bisherigen Wert in
                        der Berechnung. Frühere Erfassungen bleiben im Verlauf
                        erhalten.
                      </Notice>
                    )}
                    {(saveError || error) && (
                      <p role="alert" className="field-error">
                        {saveError || error}
                      </p>
                    )}
                    <button
                      className="button primary"
                      type="submit"
                      disabled={!selected}
                    >
                      <Check size={20} />
                      {kind} speichern
                    </button>
                  </fieldset>
                </form>
              </section>
              <section>
                <h2>
                  {selected?.name} · {location}
                </h2>
                {summary && (
                  <div className="stock-quick">
                    <div>
                      <small>Anfangsbestand</small>
                      <strong>
                        {shownAmount(summary.opening)} {selected?.unit}
                      </strong>
                    </div>
                    <div>
                      <small>Rechnerischer Bestand</small>
                      <strong>
                        {shownAmount(summary.balance)} {selected?.unit}
                      </strong>
                    </div>
                    <div>
                      <small>Letzte separate Zählung</small>
                      <strong>
                        {shownAmount(summary.counted)} {selected?.unit}
                      </strong>
                    </div>
                  </div>
                )}
                <h3>Erfassungsverlauf</h3>
                {entries.length ? (
                  <div className="entry-list">
                    {entries
                      .slice()
                      .reverse()
                      .map((m) => (
                        <div className="entry-row" key={m.id}>
                          <div>
                            <strong>{m.type}</strong>
                            <small>
                              {m.day} · {m.location}
                            </small>
                            {m.note && <p>{m.note}</p>}
                            <small>
                              Ursprünglich: {amount(m.quantity)}{" "}
                              {selected?.unit}
                            </small>
                            {(state.movementCorrections ?? [])
                              .filter((c) => c.targetId === m.id)
                              .map((c) => (
                                <div key={c.operationId}>
                                  {amount(c.before)} → {amount(c.after)} ·{" "}
                                  {c.reason}
                                  <AuditStamp entry={c} />
                                </div>
                              ))}
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() => setCorrecting(m.id)}
                            >
                              Berichtigen
                            </button>
                          </div>
                          <strong>
                            {amount(movementQuantity(state, m))}{" "}
                            {selected?.unit}
                          </strong>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty title="Noch keine Mengen erfasst">
                    Bestellmengen und Rechnungen werden hier nicht als
                    tatsächliche Lieferung übernommen.
                  </Empty>
                )}
              </section>
            </div>
          </>
        ) : (
          <Empty title="Keine Artikel für diesen Lieferanten">
            Ergänze Artikel in den Stammdaten oder wähle einen anderen
            Lieferanten.
          </Empty>
        )
      ) : (
        <div className="table-card">
          <ResponsiveTable>
            <thead>
              <tr>
                <th>Artikel</th>
                <th>Anfang</th>
                <th>Geliefert</th>
                <th>Rückgabe</th>
                <th>Verbrauch</th>
                <th>Abfall</th>
                <th>Rechnerisch</th>
                <th>Letzte Zählung</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {articles
                .filter((a) =>
                  a.name.toLowerCase().includes(search.toLowerCase()),
                )
                .map((a) => {
                  const s = stockSummary(state, a.id, location);
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        <small>{a.unit}</small>
                      </td>
                      <td>{shownAmount(s.opening)}</td>
                      <td>{amount(s.received)}</td>
                      <td>{amount(s.returned)}</td>
                      <td>{amount(s.consumed)}</td>
                      <td>{amount(s.waste)}</td>
                      <td className="total-cell">{shownAmount(s.balance)}</td>
                      <td>{shownAmount(s.counted)}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => {
                            navigate(() => {
                              setArticle(a.id);
                              setLocation(newEntryLocation(state, location));
                              setTab("Erfassen");
                            });
                          }}
                        >
                          Erfassen
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </ResponsiveTable>
          {!articles.length && (
            <p className="empty-inline">Keine Artikel vorhanden.</p>
          )}
        </div>
      )}
      {tab === "Bestandsübersicht" && (
        <section>
          <h2>Buchungen am ausgewählten Ort</h2>
          {state.movements
            .filter(
              (m) =>
                sameLocation(state, m.location, location) &&
                (!supplier ||
                  state.articles.find((a) => a.id === m.articleId)
                    ?.supplierId === supplier),
            )
            .slice()
            .reverse()
            .map((m) => (
              <div className="entry-row" key={m.id}>
                <div>
                  <strong>
                    {state.articles.find((a) => a.id === m.articleId)?.name} ·{" "}
                    {m.type}
                  </strong>
                  <small>
                    {m.day} · {m.location} · ursprünglich {amount(m.quantity)} ·
                    wirksam {amount(movementQuantity(state, m))}
                  </small>
                  {(state.movementCorrections ?? [])
                    .filter((c) => c.targetId === m.id)
                    .map((c) => (
                      <div key={c.operationId}>
                        {amount(c.before)} → {amount(c.after)} · {c.reason}
                        <AuditStamp entry={c} />
                      </div>
                    ))}
                </div>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => setCorrecting(m.id)}
                >
                  Berichtigen
                </button>
              </div>
            ))}
        </section>
      )}
      <Notice>
        Alle Bestände gelten für den ausgewählten Ort. Unbekannter Anfang bleibt
        offen. Rechnerischer Bestand = Anfang + Lieferungen − Rückgaben −
        Verbrauch − Abfall. Eine Zählung setzt diesen Bestand nicht automatisch
        neu; Verkäufe erzeugen keinen Verbrauch.
      </Notice>
      <button className="text-button" onClick={() => go("Planung")}>
        Zur Einkaufsplanung
      </button>
    </>
  );
}
