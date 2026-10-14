import { useState } from "react";
import { Check, Truck } from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import {
  Heading,
  Notice,
  Empty,
  amount,
  shownAmount,
  Tabs,
} from "../components/shared.tsx";
import { parseQuantity } from "../domain/kitchen.ts";
import { stockSummary } from "../domain/workflow.ts";
import { deliveryDays, defaultLocations } from "../ui/facts.ts";
const kinds = [
  ["stock.opening", "Anfangsbestand", "Anfangsbestand"],
  ["delivery.record", "Lieferung", "Lieferung"],
  ["stock.return", "Rückgabe", "Rückgabe"],
  ["stock.consume", "Verbrauch", "Verbrauch"],
  ["stock.count", "Zählung", "Zählung"],
  ["stock.waste", "Abfall", "Abfall"],
] as const;
export default function Deliveries({
  state,
  busy,
  commit,
  go,
  saveError,
}: ScreenProps) {
  const [tab, setTab] = useState("Erfassen"),
    [type, setType] = useState<string>("delivery.record"),
    [supplier, setSupplier] = useState(""),
    [article, setArticle] = useState(state.articles[0]?.id ?? ""),
    [day, setDay] = useState("Freitag"),
    [raw, setRaw] = useState(""),
    [location, setLocation] = useState("Küche"),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [search, setSearch] = useState("");
  const articles = state.articles.filter(
      (a) => !supplier || a.supplierId === supplier,
    ),
    selected = state.articles.find((a) => a.id === article),
    kind = kinds.find((k) => k[0] === type)![1],
    locations = [
      ...new Set([
        ...defaultLocations,
        ...state.movements.map((m) => m.location),
      ]),
    ],
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
      m.location === location &&
      (!supplier ||
        state.articles.some(
          (a) => a.id === m.articleId && a.supplierId === supplier,
        )) &&
      m.articleId === article,
  );
  return (
    <>
      <Heading eyebrow="Tatsächliche Mengen" title="Lieferungen und Lager">
        Anfang, Zu- und Abgänge ausdrücklich erfassen; gezählte Reste bleiben
        separat.
      </Heading>
      <Tabs
        items={["Erfassen", "Bestandsübersicht"]}
        value={tab}
        onChange={setTab}
        label="Lageransicht"
      />
      <div className="toolbar">
        <label>
          Lieferant
          <select
            value={supplier}
            onChange={(e) => {
              setSupplier(e.target.value);
              setArticle(
                state.articles.find(
                  (a) => !e.target.value || a.supplierId === e.target.value,
                )?.id ?? "",
              );
              setError("");
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
            onChange={(e) => setLocation(e.target.value)}
          >
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
              onChange={(e) => setSearch(e.target.value)}
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
                <form onSubmit={save}>
                  <fieldset disabled={busy}>
                    <label>
                      Art der Erfassung
                      <select
                        value={type}
                        onChange={(e) => {
                          setType(e.target.value);
                          setError("");
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
                          setArticle(e.target.value);
                          setError("");
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
                          onChange={(e) => setDay(e.target.value)}
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
                          </div>
                          <strong>
                            {amount(m.quantity)} {selected?.unit}
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
          <table>
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
                            setArticle(a.id);
                            setTab("Erfassen");
                          }}
                        >
                          Erfassen
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!articles.length && (
            <p className="empty-inline">Keine Artikel vorhanden.</p>
          )}
        </div>
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
