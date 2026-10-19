import {activeLocations,historicalLocations,newEntryLocation,sameLocation} from "../domain/locations.ts";
import { ResponsiveTable } from "../components/MobileItemCard.tsx";
import { useState } from "react";
import {
  FilePdf,
  ArrowSquareOut,
  Plus,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import {
  Heading,
  useDraftNavigation,
  Notice,
  euros,
  Modal,
  amount,
  Empty,
  SourceDetails,
} from "../components/shared.tsx";
import type { Receipt, ReceiptSnapshot } from "../domain/state.ts";
import { parseQuantity } from "../domain/kitchen.ts";
import {
  parseMoney,
  receiptTotals,
  receiptOriginalLabel,
} from "../ui/facts.ts";
export default function Receipts(props: ScreenProps) {
  const {navigate} = useDraftNavigation();
  const { state, busy, mode } = props,
    [selected, setSelected] = useState<string | null>(null),
    [adding, setAdding] = useState(false),
    [status, setStatus] = useState("Alle"),
    [scope, setScope] = useState("Alle"),
    [search, setSearch] = useState("");
  const scopes = historicalLocations(state);
  const invoices = state.invoices.filter(
    (i) =>
      (scope === "Alle" || sameLocation(state,i.scope,scope)) &&
      (status === "Alle" || i.status === status) &&
      `${i.number} ${state.suppliers.find((s) => s.id === i.supplierId)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const totals = receiptTotals(invoices),
    originals = invoices.filter((i) => i.status === "Original vorhanden"),
    missing = invoices.filter((i) => i.status === "Original fehlt");
  return (
    <>
      <Heading
        eyebrow={`${state.event.name} ${state.event.year}`}
        title="Belege im Blick"
        action={
          <button
            className="button primary"
            disabled={busy || !state.suppliers.length}
            onClick={() => setAdding(true)}
          >
            <Plus size={20} />
            Beleg erfassen
          </button>
        }
      >
        Rechnungen ergänzen, Unterlagen verknüpfen und den Erfassungsbereich
        klar halten.
      </Heading>
      <div className="toolbar receipt-filters">
        <label>
          Zuordnung
          <select value={scope} onChange={(e) => {
                const value = e.target.value;
                navigate(() => setScope(value));
              }}>
            <option value="Alle">Alle Zuordnungen</option>
            {scopes.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Originalstatus
          <select value={status} onChange={(e) => {
                const value = e.target.value;
                navigate(() => setStatus(value));
              }}>
            <option value="Alle">Alle Belege</option>
            {[
              ...new Set([
                "Original vorhanden",
                "Original fehlt",
                "Erfasst",
                ...state.invoices.map((i) => i.status),
              ]),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="search-field">
          Beleg suchen
          <input
            type="search"
            placeholder="Nummer oder Lieferant"
            value={search}
            onChange={(e) => {
                const value = e.target.value;
                navigate(() => setSearch(value));
              }}
          />
        </label>
      </div>
      <div className="summary-strip">
        <div>
          <small>Erfasste Bruttobeträge · aktuelle Auswahl</small>
          <strong>{euros(totals.knownCents)}</strong>
          <span>
            Teilwert · {totals.known} von {totals.total} Beträgen bekannt
            {totals.missing ? ` · ${totals.missing} offen` : ""}
          </span>
        </div>
        <div>
          <small>Originale laut Datenstand</small>
          <strong>{originals.length}</strong>
          <span>
            {mode === "local"
              ? "Lokal vorhandene Dokumente"
              : "Lokale Originale ggf. hier nicht verfügbar"}
          </span>
        </div>
        <div>
          <small>Listenwerte ohne Original</small>
          <strong>{missing.length}</strong>
          <span>Keine bestätigten Originalrechnungen</span>
        </div>
      </div>
      <Notice>
        Die Auswahl „{scope === "Alle" ? "alle Zuordnungen" : scope}“ umfasst
        ausschließlich bereits erfasste Belege. Listenwerte, Originale und
        manuelle Angaben bleiben unterscheidbar. Fehlende Rechnungen außerhalb
        der Liste sind in diesem Teilwert nicht enthalten.
      </Notice>
      {invoices.length ? (
        <div className="table-card">
          <ResponsiveTable>
            <thead>
              <tr>
                <th>Beleg / Lieferant</th>
                <th>Datum</th>
                <th>Zuordnung</th>
                <th>Brutto</th>
                <th>Original / Stand</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.number}</strong>
                    <small>
                      {state.suppliers.find((s) => s.id === i.supplierId)?.name}
                    </small>
                  </td>
                  <td>
                    {i.date
                      ? new Date(`${i.date}T12:00:00`).toLocaleDateString(
                          "de-DE",
                        )
                      : "Offen"}
                  </td>
                  <td>{i.scope}</td>
                  <td>{euros(i.grossCents)}</td>
                  <td>
                    <span
                      className={`badge ${i.status === "Original fehlt" ? "amber" : i.status === "Original vorhanden" ? "mint" : ""}`}
                    >
                      {receiptOriginalLabel(i, mode)}
                    </span>
                    {i.corrected && (
                      <small>Ergänzt / korrigiert · Verlauf erhalten</small>
                    )}
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setSelected(i.id)}
                    >
                      <PencilSimple size={17} />
                      Öffnen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      ) : (
        <Empty title="Keine Belege in dieser Auswahl">
          Ändere die Filter oder erfasse eine Rechnung. Unbekannte Beträge
          dürfen offen bleiben.
        </Empty>
      )}
      {!state.suppliers.length && (
        <Notice>Lege zuerst einen Lieferanten in den Stammdaten an.</Notice>
      )}
      {(adding || selected) && (
        <ReceiptEditor
          key={selected ?? "new"}
          {...props}
          item={state.invoices.find((i) => i.id === selected)}
          onClose={() => {
            setSelected(null);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}
function ReceiptFacts({
  item,
  title,
}: {
  item: ReceiptSnapshot;
  title: string;
}) {
  return (
    <div className="receipt-facts">
      <h3>{title}</h3>
      <div className="receipt-overview">
        <div>
          <small>Brutto</small>
          <strong>{euros(item.grossCents)}</strong>
        </div>
        <div>
          <small>Netto</small>
          <strong>{euros(item.netCents)}</strong>
        </div>
        <div>
          <small>Zuordnung</small>
          <strong>{item.scope}</strong>
        </div>
      </div>
      {item.lines.length > 0 && (
        <div className="table-card">
          <ResponsiveTable className="receipt-lines">
            <thead>
              <tr>
                <th>Position</th>
                <th>Menge</th>
                <th>Netto nach Rabatt</th>
              </tr>
            </thead>
            <tbody>
              {item.lines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}</td>
                  <td>
                    {l.quantity === null ? "Offen" : amount(l.quantity)}{" "}
                    {l.unit}
                  </td>
                  <td>{euros(l.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </ResponsiveTable>
        </div>
      )}
    </div>
  );
}
function ReceiptEditor({
  state,
  busy,
  commit,
  mode,
  saveError,
  item,
  onClose,
}: ScreenProps & { item?: Receipt; onClose: () => void }) {
  const immutable = Boolean(
    item?.source && item.status === "Original vorhanden",
  );
  const [supplierId, setSupplier] = useState(
      item?.supplierId ?? state.suppliers[0]?.id ?? "",
    ),
    [number, setNumber] = useState(item?.number ?? ""),
    [gross, setGross] = useState(
      amount(item?.grossCents == null ? null : item.grossCents / 100),
    ),
    [net, setNet] = useState(
      amount(item?.netCents == null ? null : item.netCents / 100),
    ),
    [scope, setScope] = useState(item?.scope ?? newEntryLocation(state)),
    [url, setUrl] = useState(item?.documentUrl ?? ""),
    [error, setError] = useState("");
  const [lines, setLines] = useState(
    (item?.lines ?? []).map((l, i) => ({
      key: String(i),
      articleId: l.articleId ?? "",
      name: l.name,
      quantity: amount(l.quantity),
      unit: l.unit,
      net: amount(l.netCents === null ? null : l.netCents / 100),
    })),
  );
  const scopes = item ? historicalLocations(state) : activeLocations(state),
    articles = state.articles.filter((a) => a.supplierId === supplierId);
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      const payload = {
        ...(item ? { id: item.id } : {}),
        supplierId: immutable ? item!.supplierId : supplierId,
        number: immutable ? item!.number : number,
        date: immutable
          ? (item!.date ?? null)
          : String(new FormData(e.currentTarget).get("documentDate") ?? "") ||
            null,
        grossCents: immutable ? item!.grossCents : parseMoney(gross),
        netCents: immutable ? item!.netCents : parseMoney(net),
        scope,
        documentUrl: url || null,
        lines: immutable
          ? item!.lines
          : lines.map((l) => ({
              ...(l.articleId ? { articleId: l.articleId } : {}),
              name: l.name,
              quantity: parseQuantity(l.quantity),
              unit: l.unit,
              netCents: parseMoney(l.net),
            })),
      };
      if (await commit(item ? "invoice.update" : "invoice.save", payload))
        onClose();
      else setError("Noch nicht gespeichert. Bitte den Hinweis oben beachten.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={item ? `Beleg · ${item.number}` : "Eingangsbeleg erfassen"}
      onClose={onClose}
    >
      {item && (
        <>
          <div className="receipt-status-row">
            <span className="badge">{receiptOriginalLabel(item, mode)}</span>
            {item.corrected && (
              <span className="badge amber">Ergänzt / korrigiert</span>
            )}
          </div>
          <ReceiptFacts
            item={item}
            title={
              immutable
                ? "Beträge und Positionen aus dem Original"
                : "Aktueller erfasster Stand"
            }
          />
          {item.documentUrl && (
            <a
              className="button secondary"
              href={item.documentUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ArrowSquareOut size={19} />
              SharePoint-Dokument öffnen
            </a>
          )}
          {mode === "local" && item.status === "Original vorhanden" && (
            <a
              className="button secondary"
              href={`/api/kitchen/receipt/${encodeURIComponent(item.id)}`}
              target="_blank"
              rel="noreferrer"
            >
              <FilePdf size={19} />
              Lokales Original ansehen
            </a>
          )}
          <SourceDetails source={item.source} />
          {item.sourceBaseline && (
            <details className="correction-history">
              <summary>
                Ursprünglicher Quellenstand und Änderungsverlauf (
                {item.corrections?.length ?? 0})
              </summary>
              <p>
                {item.sourceBaseline.number} ·{" "}
                {item.sourceBaseline.date ?? "Datum offen"}
              </p>
              <ReceiptFacts
                item={item.sourceBaseline}
                title="Unveränderter ursprünglicher Quellenstand"
              />
              {item.corrections?.map((c) => (
                <details key={c.operationId}>
                  <summary>Stand vor Änderung · Revision {c.revision}</summary>
                  <ReceiptFacts item={c.before} title="Vorheriger Stand" />
                </details>
              ))}
            </details>
          )}
        </>
      )}
      {!item && !activeLocations(state).length && <p role="status">Für einen neuen Beleg bitte zuerst einen aktiven Ort in den Einstellungen einrichten.</p>}
      <form onSubmit={save}>
        <fieldset disabled={busy || (!item && !activeLocations(state).length)}>
          {immutable && (
            <Notice>
              Die wirtschaftlichen Angaben dieses Originalbelegs sind fest. Du
              kannst die Zuordnung ergänzen und ein SharePoint-Dokument
              verknüpfen; die Quelle und der Verlauf bleiben erhalten.
            </Notice>
          )}
          {item?.source && item.status === "Original fehlt" && (
            <Notice>
              Du bearbeitest einen Listenwert ohne Original. Ergänzungen und
              Korrekturen werden mit dem ursprünglichen Quellenstand im Verlauf
              bewahrt. Ein Link bestätigt das Original nicht automatisch.
            </Notice>
          )}
          <div className="form-row">
            <label>
              Lieferant
              <select
                value={supplierId}
                disabled={immutable}
                onChange={(e) => {
                  setSupplier(e.target.value);
                  setLines(lines.map((l) => ({ ...l, articleId: "" })));
                }}
              >
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Belegnummer
              <input
                required
                value={number}
                readOnly={immutable}
                maxLength={100}
                onChange={(e) => setNumber(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Datum (optional)
              <input
                name="documentDate"
                type="date"
                defaultValue={item?.date ?? ""}
                readOnly={immutable}
              />
            </label>
            <label>
              Zuordnung
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {scopes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Brutto · €
              <input
                inputMode="decimal"
                value={gross}
                readOnly={immutable}
                onChange={(e) => setGross(e.target.value)}
                placeholder="Offen"
              />
            </label>
            <label>
              Netto · €
              <input
                inputMode="decimal"
                value={net}
                readOnly={immutable}
                onChange={(e) => setNet(e.target.value)}
                placeholder="Offen"
              />
            </label>
          </div>
          {!immutable && (
            <>
              <h3 className="form-section-title">Positionen (optional)</h3>
              {lines.map((l, i) => (
                <div className="invoice-line" key={l.key}>
                  <label>
                    Artikelzuordnung
                    <select
                      value={l.articleId}
                      onChange={(e) => {
                        const article = articles.find(
                          (a) => a.id === e.target.value,
                        );
                        setLines(
                          lines.map((v, n) =>
                            n === i
                              ? {
                                  ...v,
                                  articleId: e.target.value,
                                  ...(article
                                    ? { name: article.name, unit: article.unit }
                                    : {}),
                                }
                              : v,
                          ),
                        );
                      }}
                    >
                      <option value="">Freie Belegposition</option>
                      {articles.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Positionsname
                    <input
                      required
                      value={l.name}
                      onChange={(e) =>
                        setLines(
                          lines.map((v, n) =>
                            n === i ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Menge
                      <input
                        inputMode="decimal"
                        value={l.quantity}
                        placeholder="Offen"
                        onChange={(e) =>
                          setLines(
                            lines.map((v, n) =>
                              n === i ? { ...v, quantity: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Einheit
                      <input
                        required
                        value={l.unit}
                        onChange={(e) =>
                          setLines(
                            lines.map((v, n) =>
                              n === i ? { ...v, unit: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Netto Position · €
                    <input
                      inputMode="decimal"
                      value={l.net}
                      placeholder="Offen"
                      onChange={(e) =>
                        setLines(
                          lines.map((v, n) =>
                            n === i ? { ...v, net: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setLines(lines.filter((_, n) => n !== i))}
                  >
                    <Trash size={17} />
                    Position entfernen
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setLines([
                    ...lines,
                    {
                      key: crypto.randomUUID(),
                      articleId: "",
                      name: "",
                      quantity: "",
                      unit: "",
                      net: "",
                    },
                  ])
                }
              >
                <Plus size={18} />
                Belegposition ergänzen
              </button>
            </>
          )}
          <label>
            SharePoint-Original (optional)
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…sharepoint.com/…"
            />
            <small>
              Link aus eurem Rechnungsordner. Der Status aus den Unterlagen
              bleibt erhalten.
            </small>
          </label>
          {(saveError || error) && (
            <p className="field-error" role="alert">
              {saveError || error}
            </p>
          )}
          <div className="modal-actions">
            <button className="button primary" type="submit">
              {item ? "Ergänzung / Änderung speichern" : "Beleg speichern"}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
