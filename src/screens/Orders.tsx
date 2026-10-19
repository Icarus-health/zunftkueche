import {orderCsv,downloadReport} from '../data/exports.ts';
import { AuditStamp } from "../components/CorrectionDialog.tsx";
import { orderPlanningChanged } from "../domain/order-status.ts";
import { ResponsiveTable } from "../components/MobileItemCard.tsx";
import { useEffect, useState } from "react";
import {
  Eye,
  ClipboardText,
  Printer,
  Clock,
  Plus,
} from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import {
  Heading,
  useDraftNavigation,
  Quantity,
  Modal,
  Notice,
  euros,
  unitEuros,
  amount,
  SourceDetails,
} from "../components/shared.tsx";
import {
  prepareOrder,
  parseQuantity,
  formatOrderHint,
} from "../domain/kitchen.ts";
import type { OrderSnapshot, PlanLine } from "../domain/kitchen.ts";
import {
  orderPreviewHeader,
  formatDeliveryDate,
  deliveryDays,
} from "../ui/facts.ts";
export default function Orders({
  state,
  busy,
  commit,
  saveError,
  initialSupplier,
}: ScreenProps & { initialSupplier: string }) {
  const { navigate, pending } = useDraftNavigation();
  const [supplier, setSupplier] = useState(
      state.suppliers.some((s) => s.id === initialSupplier)
        ? initialSupplier
        : (state.suppliers[0]?.id ?? ""),
    ),
    [day, setDay] = useState("Freitag"),
    [prices, setPrices] = useState(false),
    [preview, setPreview] = useState<
      | (OrderSnapshot & { supplierId: string; day: string; status: string })
      | null
    >(null),
    [tab, setTab] = useState("Planung"),
    [adding, setAdding] = useState(false);
  const [marking, setMarking] = useState<string | null>(null),
    [markNote, setMarkNote] = useState(""),
    [markError, setMarkError] = useState("");
  const markOrder = state.orders.find((o) => o.id === marking);
  useEffect(() => {
    if (
      initialSupplier &&
      state.suppliers.some((s) => s.id === initialSupplier)
    )
      setSupplier(initialSupplier);
  }, [initialSupplier]);
  const snapshot = prepareOrder(state.planLines, supplier, day),
    supplierName =
      state.suppliers.find((s) => s.id === supplier)?.name ?? "Lieferant offen";
  const prepared = state.orders.filter((o) => o.supplierId === supplier);
  const previewHeader = preview ? orderPreviewHeader(state, preview) : null;
  return (
    <section className="orders-screen">
      <Heading title="Bestellung erstellen">
        Lieferant auswählen, danach Liefertag. Eine vorbereitete Version bewahrt
        genau diesen Stand.
      </Heading>
      <div className="order-controls">
        <label>
          Lieferant
          <select
            value={supplier}
            disabled={pending}
            onChange={(e) => {
              const value = e.target.value;
              navigate(() => {
                setSupplier(value);
                setTab("Planung");
              });
            }}
          >
            {state.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" aria-label="Liefertag">
          {deliveryDays.map((d) => (
            <button
              key={d}
              disabled={pending}
              aria-pressed={day === d}
              className={day === d ? "selected" : ""}
              onClick={() => {
                if (d === day && tab === "Planung") return;
                navigate(() => {
                  setDay(d);
                  setTab("Planung");
                });
              }}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="order-subbar">
        <div className="tabs">
          <button
            className={tab === "Planung" ? "selected" : ""}
            disabled={pending}
            onClick={() => {
              if (tab !== "Planung") navigate(() => setTab("Planung"));
            }}
          >
            Bestellmengen
          </button>
          <button
            className={tab === "Vorbereitet" ? "selected" : ""}
            disabled={pending}
            onClick={() => {
              if (tab !== "Vorbereitet") navigate(() => setTab("Vorbereitet"));
            }}
          >
            Vorbereitete Versionen ({prepared.length})
          </button>
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={prices}
            onChange={(e) => setPrices(e.target.checked)}
          />
          Preise anzeigen
        </label>
      </div>
      {tab === "Planung" ? (
        <>
          {snapshot.groups.map((group) => (
            <section className="order-group" key={group.time ?? "open"}>
              <h2>
                <Clock size={21} />
                {group.time
                  ? `Lieferung um ${group.time} Uhr`
                  : "Ohne feste Lieferzeit"}
                <small>{group.lines.length} Positionen</small>
              </h2>
              <div className="table-card">
                <ResponsiveTable>
                  <thead>
                    <tr>
                      <th>Artikel</th>
                      <th>Menge</th>
                      {prices && <th>Einzelpreis</th>}
                      <th>Hinweis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <strong>{l.name}</strong>
                          {l.source && <SourceDetails source={l.source} />}
                        </td>
                        <td>
                          <Quantity
                            value={l.quantity}
                            unit={l.unit}
                            label={`${l.name} ${day}`}
                            disabled={busy}
                            onSave={(quantity) =>
                              commit("plan.quantity", { id: l.id, quantity })
                            }
                          />
                        </td>
                        {prices && (
                          <td>
                            {unitEuros(l.unitPriceCents)}
                            <small>netto je {l.unit}</small>
                          </td>
                        )}
                        <td className="muted">
                          {l.note?.replace(/,?\s*\d{2}:\d{2} Uhr/, "") ||
                            (l.location !== "Küche" ? l.location : "") ||
                            "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </ResponsiveTable>
              </div>
            </section>
          ))}
          {!snapshot.lines.length && (
            <div className="empty">
              <h3>Keine Positionen für diesen Liefertag</h3>
              <p>
                Wähle einen anderen Tag. Getränke und allgemeiner Bedarf stehen
                unter „Allgemein“.
              </p>
            </div>
          )}
          <button
            className="text-button"
            disabled={busy || !state.suppliers.length}
            onClick={() => setAdding(true)}
          >
            <Plus size={20} />
            Position hinzufügen
          </button>
          <div className="order-footer">
            <div>
              <strong>
                {snapshot.lines.length} Positionen · {supplierName}
              </strong>
              <p>
                {snapshot.totalCents === null
                  ? "Preise noch offen · Bestellwert nicht vollständig berechenbar."
                  : `Bestellwert ${euros(snapshot.totalCents)}`}
              </p>
            </div>
            <div className="button-row">
              <button
                className="button secondary"
                disabled={!snapshot.lines.length}
                onClick={() =>
                  setPreview({
                    supplierId: supplier,
                    day,
                    status: "Vorschau",
                    ...snapshot,
                  })
                }
              >
                <Eye size={21} />
                Vorschau
              </button>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !snapshot.lines.length ||
                  snapshot.lines.some((l) => l.quantity === null)
                }
                onClick={async () => {
                  if (
                    await commit("order.prepare", { supplierId: supplier, day })
                  )
                    setTab("Vorbereitet");
                }}
              >
                <ClipboardText size={21} />
                Bestellung vorbereiten
              </button>
            </div>
          </div>
          <Notice>
            Die App bereitet die Bestellung vor. Der Versand an den Lieferanten
            erfolgt anschließend durch dich.
          </Notice>
        </>
      ) : (
        <div className="prepared-list">
          {prepared.length ? (
            prepared
              .slice()
              .reverse()
              .map((o) => (
                <div key={o.id} className="form-card">
                  <button
                    className="prepared-row"
                    onClick={() => setPreview(o)}
                  >
                    <ClipboardText size={25} />
                    <span>
                      <strong>
                        {o.day} · {o.lines.length} Positionen
                      </strong>
                      <small>
                        {new Date(o.createdAt).toLocaleString("de-DE")} ·{" "}
                        {o.status === "bestellt"
                          ? "Bestellt"
                          : o.status === "bestaetigt"
                            ? "Bestätigt"
                            : o.status}
                      </small>
                    </span>
                    <Eye size={22} />
                  </button>
                  {orderPlanningChanged(state, o) && (
                    <p className="badge amber">
                      Lebende Planung weicht von dieser Fassung ab.
                    </p>
                  )}
                  {(o.statusHistory ?? []).map((entry: any) => (
                    <div key={entry.operationId}>
                      {entry.status === "bestellt"
                        ? "Manuell als bestellt markiert"
                        : "Bestätigung erfasst"}{" "}
                      · {entry.note}
                      <AuditStamp entry={entry} />
                    </div>
                  ))}
                  {o.status !== "bestaetigt" && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => {
                        setMarking(o.id);
                        setMarkNote("");
                        setMarkError("");
                      }}
                    >
                      {o.status === "Vorbereitet"
                        ? "Als bestellt markieren"
                        : "Bestätigung erfassen"}
                    </button>
                  )}
                </div>
              ))
          ) : (
            <div className="empty">
              <h3>Noch keine Version vorbereitet</h3>
              <p>
                Prüfe die Bestellmengen und bereite anschließend eine Version
                vor.
              </p>
            </div>
          )}
        </div>
      )}
      {markOrder && (
        <Modal
          title={
            markOrder.status === "Vorbereitet"
              ? "Bestellung manuell markieren"
              : "Bestätigung erfassen"
          }
          onClose={() => setMarking(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit("order.mark", {
                  orderId: markOrder.id,
                  status:
                    markOrder.status === "Vorbereitet"
                      ? "bestellt"
                      : "bestaetigt",
                  note: markNote,
                })
              )
                setMarking(null);
              else
                setMarkError(
                  "Noch nicht gespeichert. Bitte den Hinweis oben beachten.",
                );
            }}
          >
            <fieldset disabled={busy}>
              <p>
                Diese Markierung dokumentiert deinen bereits erfolgten Kontakt
                mit dem Lieferanten. Die App sendet keine Nachricht.
              </p>
              {orderPlanningChanged(state, markOrder) && (
                <Notice>
                  Die lebende Planung wurde verändert. Du markierst die
                  ausgewählte gespeicherte Fassung.
                </Notice>
              )}
              <label>
                Notiz (optional)
                <textarea
                  maxLength={1000}
                  value={markNote}
                  onChange={(e) => setMarkNote(e.target.value)}
                />
              </label>
              {markError && <p role="alert">{markError}</p>}
              <button className="button primary" type="submit">
                Markierung speichern
              </button>
            </fieldset>
          </form>
        </Modal>
      )}
      {adding && (
        <AddPosition
          state={state}
          busy={busy}
          commit={commit}
          saveError={saveError}
          supplierId={supplier}
          day={day}
          onClose={() => setAdding(false)}
        />
      )}
      {preview && previewHeader && (
        <Modal
          title={`${previewHeader.supplierName} · ${preview.day}`}
          onClose={() => setPreview(null)}
        >
          <div className="print-area">
            <div className="print-heading">
              <h2>
                Zunftküche · {previewHeader.eventName} {previewHeader.eventYear}
              </h2>
              <p>
                {previewHeader.supplierName} · {preview.day} · {preview.status}
              </p>
            </div>
            <p>Bestellfassung: {"id" in preview ? String(preview.id) : "noch nicht gespeichert"} · Erstellt: {"createdAt" in preview ? new Date(String(preview.createdAt)).toLocaleString("de-DE") : "offen"}<br/>Ausgabe-Datenrevision {state.revision} · Ausgabe {new Date().toLocaleString("de-DE")} · Bestellrevision historisch nicht erfasst.</p>
            {previewHeader.notice && <p>{previewHeader.notice}</p>}
            <ResponsiveTable>
              <thead>
                <tr>
                  <th>Artikel</th>
                  <th>Menge</th>
                  <th>Lieferzeit / Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {preview.lines.map((l: Readonly<PlanLine>) => (
                  <tr key={l.id}>
                    <td>{l.name}</td>
                    <td>
                      {amount(l.quantity)} {l.unit}
                    </td>
                    <td>{formatOrderHint(l)}</td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
            <p className="muted">
              {previewHeader.deliveryAddress && (
                <span>
                  Lieferadresse: {previewHeader.deliveryAddress}
                  <br />
                </span>
              )}
              {previewHeader.contact && (
                <span>
                  Ansprechpartner: {previewHeader.contact}
                  <br />
                </span>
              )}
              {formatDeliveryDate(previewHeader.deliveryDate)} · Versandstatus:
              {preview.status === "bestellt" ? "manuell als bestellt vermerkt" : preview.status === "bestaetigt" ? "manuell als bestätigt vermerkt" : "offen"}.
            </p>
          </div>
          <div className="modal-actions">
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={21} />
              Drucken / als PDF sichern
            </button>
            <button className="button secondary" onClick={()=>downloadReport(orderCsv(preview,state.revision),`Bestellfassung-R${state.revision}.csv`,"text/csv;charset=utf-8")}>Fassung als CSV</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function AddPosition({
  state,
  busy,
  commit,
  saveError,
  supplierId,
  day,
  onClose,
}: Pick<ScreenProps, "state" | "busy" | "commit" | "saveError"> & {
  supplierId: string;
  day: string;
  onClose: () => void;
}) {
  const articles = state.articles.filter((a) => a.supplierId === supplierId);
  const [articleId, setArticleId] = useState(articles[0]?.id ?? ""),
    [raw, setRaw] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const quantity = parseQuantity(raw);
      if (quantity === null) throw new Error("Bitte eine Menge eintragen.");
      if (
        await commit("plan.add", {
          supplierId,
          articleId,
          day,
          quantity,
          time:
            String(new FormData(e.currentTarget).get("deliveryTime") ?? "") ||
            null,
          note,
        })
      )
        onClose();
      else setError("Noch nicht gespeichert. Bitte den Hinweis oben beachten.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title={`Position ergänzen · ${day}`} onClose={onClose}>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Artikel
            <select
              value={articleId}
              disabled={busy}
              onChange={(e) => setArticleId(e.target.value)}
            >
              {!articles.length && (
                <option value="">Keine Artikel für diesen Lieferanten</option>
              )}
              {articles.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.unit}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            <label>
              Menge ({articles.find((a) => a.id === articleId)?.unit})
              <input
                inputMode="decimal"
                value={raw}
                disabled={busy}
                onChange={(e) => setRaw(e.target.value)}
              />
            </label>
            <label>
              Lieferzeit (optional)
              <input
                name="deliveryTime"
                type="time"
                defaultValue=""
                disabled={busy}
              />
            </label>
          </div>
          <label>
            Hinweis
            <input
              value={note}
              disabled={busy}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {(saveError || error) && (
            <p role="alert" className="field-error">
              {saveError || error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              disabled={busy || !articleId}
              type="submit"
            >
              Position speichern
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
