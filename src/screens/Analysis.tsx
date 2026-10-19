import {EventClosure} from '../components/EventClosure.tsx';
import {buildEventExport,toCsv,toPrintHtml,downloadReport} from '../data/exports.ts';
import {
  CorrectionDialog,
  AuditStamp,
} from "../components/CorrectionDialog.tsx";
import { effectiveSales, salePrice } from "../domain/corrections.ts";
import {
  historicalLocations,
  purchasingLocation,
  sameLocation,
} from "../domain/locations.ts";
import { ResponsiveTable } from "../components/MobileItemCard.tsx";
import { useState } from "react";
import { Printer } from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import { summarizeSales } from "../domain/kitchen.ts";
import { stockSummary } from "../domain/workflow.ts";
import {
  Heading,
  useDraftNavigation,
  Notice,
  Quantity,
  Money,
  euros,
  shownAmount,
  Empty,
  Tabs,
  SourceDetails,
} from "../components/shared.tsx";
import { kitchenDays, receiptTotals, eventDate } from "../ui/facts.ts";
export default function Analysis(props:ScreenProps) {
 const {state,busy,commit,go}=props;
  const [correcting, setCorrecting] = useState<string | null>(null);
  const correction = effectiveSales(state).find((s) => s.id === correcting);
  const { navigate } = useDraftNavigation();
  const [tab, setTab] = useState("Verkäufe erfassen"),
    [scope, setScope] = useState(purchasingLocation(state) ?? "Alle"),
    [search, setSearch] = useState("");
  const expected = state.menu.length * 2,
    entered = state.sales.filter(
      (s) => kitchenDays.some((day) => day === s.day) && s.quantity !== null,
    ).length;
  const sales = effectiveSales(state).filter((s) =>
      kitchenDays.some((day) => day === s.day),
    ),
    revenue = summarizeSales(sales),
    scoped = state.invoices.filter(
      (i) => scope === "Alle" || sameLocation(state, i.scope, scope),
    ),
    costs = receiptTotals(scoped),
    menu = state.menu.filter((m) =>
      m.name.toLowerCase().includes(search.toLowerCase()),
    );
  const stockArticles = state.articles.filter((a) =>
    state.movements.some(
      (m) =>
        m.articleId === a.id &&
        sameLocation(state, m.location, purchasingLocation(state)),
    ),
  );
  const scopes = historicalLocations(state);
  return (
    <>
      {correction && (
        <CorrectionDialog
          title="Verkaufspreis berichtigen"
          label="Berichtigter Stückpreis (€)"
          value={salePrice(state, correction)}
          money
          busy={busy}
          onClose={() => setCorrecting(null)}
          onSave={(priceCents, reason) =>
            commit("sales.correctPrice", {
              saleId: correction.id,
              priceCents,
              reason,
            })
          }
        />
      )}
      <Heading
        eyebrow={`${state.event.name} ${state.event.year}`}
        title="Auswertung mit klarer Grundlage"
        action={
          tab === "Auswertung" ? (
            <button className="button secondary" onClick={() => window.print()}>
              <Printer size={21} />
              Auswertung drucken
            </button>
          ) : undefined
        }
      >
        Verkäufe mit der Speisenplanung vergleichen und erfasste Ausgaben nach
        Zuordnung ansehen.
      </Heading>
      <EventClosure {...props} scope={scope}/>
      <div className="flow-actions"><button className="button secondary" onClick={()=>downloadReport(toCsv(buildEventExport(state,scope)),`Auswertung-${state.event.year}-R${state.revision}.csv`,"text/csv;charset=utf-8")}>CSV · {scope}</button><button className="button secondary" onClick={()=>downloadReport(toPrintHtml(buildEventExport(state,scope)),`Auswertung-${state.event.year}-R${state.revision}.html`,"text/html;charset=utf-8")}>Prüfbare Druckdatei / PDF</button></div>
      <p>Auswertungen enthalten Umfang, Revision und Quellen. Druckdatei öffnen und als PDF drucken. Dies ist keine Vollsicherung.</p>
      <Tabs
        items={["Verkäufe erfassen", "Auswertung", "Erfahrungen"]}
        value={tab}
        onChange={setTab}
        label="Abschlussansichten"
      />
      {tab === "Verkäufe erfassen" ? (
        <>
          <div className="toolbar">
            <label className="search-field">
              Speise / Getränk suchen
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  const value = e.target.value;
                  navigate(() => setSearch(value));
                }}
              />
            </label>
            <span className="muted">
              {entered} von {expected} Verkaufsmengen ausdrücklich erfasst
            </span>
          </div>
          <Notice>
            Leer bedeutet „noch nicht erfasst“. Trage ausdrücklich 0 ein, wenn
            nichts verkauft wurde. Der Preis wird beim ersten Erfassen bewahrt;
            eine spätere Preisänderung ändert diese Verkäufe nicht.
          </Notice>
          {menu.length ? (
            <div className="table-card">
              <ResponsiveTable>
                <thead>
                  <tr>
                    <th>Speise / Getränk</th>
                    <th>Aktueller Verkaufspreis</th>
                    {kitchenDays.map((day) => (
                      <th key={day}>
                        {day} · Stück<small>{eventDate(state, day)}</small>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {menu.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                        <small>{m.category}</small>
                      </td>
                      <td>
                        <Money
                          value={m.priceCents}
                          label={`Verkaufspreis ${m.name}`}
                          disabled={busy}
                          onSave={(priceCents) =>
                            commit("menu.price", { menuId: m.id, priceCents })
                          }
                        />
                      </td>
                      {kitchenDays.map((day) => {
                        const sale = effectiveSales(state).find(
                          (s) => s.menuId === m.id && s.day === day,
                        );
                        return (
                          <td key={day}>
                            <Quantity
                              whole
                              value={sale?.quantity ?? null}
                              label={`Verkauf ${m.name} ${day}`}
                              disabled={busy}
                              onSave={(quantity) =>
                                commit("sales.quantity", {
                                  menuId: m.id,
                                  day,
                                  quantity,
                                })
                              }
                            />
                            {sale && (
                              <div>
                                <small>
                                  Wirksamer Preis {euros(sale.priceCents)} ·
                                  ursprünglich{" "}
                                  {euros(
                                    state.sales.find((s) => s.id === sale.id)!
                                      .priceCents,
                                  )}
                                </small>
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => setCorrecting(sale.id)}
                                >
                                  Preis berichtigen
                                </button>
                                {(state.salePriceCorrections ?? [])
                                  .filter((c) => c.targetId === sale.id)
                                  .map((c) => (
                                    <div key={c.operationId}>
                                      {euros(c.before)} → {euros(c.after)} ·{" "}
                                      {c.reason}
                                      <AuditStamp entry={c} />
                                    </div>
                                  ))}
                              </div>
                            )}
                            {sale && sale.priceCents === null && (
                              <label>
                                Fehlenden erfassten Preis bestätigen
                                <Money
                                  value={null}
                                  label={`Preis bestätigen ${m.name} ${day}`}
                                  disabled={busy}
                                  onSave={(priceCents) =>
                                    commit("sales.price", {
                                      menuId: m.id,
                                      day,
                                      priceCents,
                                    })
                                  }
                                />
                              </label>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            </div>
          ) : (
            <Empty title="Keine Speisen gefunden">
              Ergänze Speisen und Getränke in den Stammdaten oder ändere die
              Suche.
            </Empty>
          )}
        </>
      ) : tab === "Auswertung" ? (
        <div className="analysis-report">
          <div className="toolbar">
            <label>
              Belege nach Zuordnung
              <select
                value={scope}
                onChange={(e) => {
                  const value = e.target.value;
                  navigate(() => setScope(value));
                }}
              >
                <option value="Alle">Alle Zuordnungen</option>
                {scopes.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <span className="muted">
              {state.event.name} {state.event.year} · Kostenbereich:{" "}
              {scope === "Alle" ? "alle Zuordnungen" : scope}
            </span>
          </div>
          <div className="summary-strip">
            <div>
              <small>Bekannter Umsatz · Teilwert</small>
              <strong>{euros(revenue.knownCents)}</strong>
              <span>
                {entered} von {expected} Mengen erfasst ·{" "}
                {revenue.missingPrices} erfasste Preise offen
              </span>
            </div>
            <div>
              <small>Erfasste Bruttobeträge · {scope}</small>
              <strong>{euros(costs.knownCents)}</strong>
              <span>
                {costs.known} von {costs.total} Belegbeträgen bekannt ·{" "}
                {costs.missing} offen
              </span>
            </div>
            <div>
              <small>Abschlussstand</small>
              <strong>{state.event.status}</strong>
              <span>
                Kein Gewinn aus unvollständigen Mengen und Belegen ableitbar
              </span>
            </div>
          </div>
          <Notice>
            Umsatz umfasst die hier erfassten Menüverkäufe. Kosten umfassen
            ausschließlich erfasste Belege mit Zuordnung „
            {scope === "Alle" ? "alle Zuordnungen" : scope}“. Diese Bereiche
            sind nicht automatisch vergleichbar; Bruttobeträge werden nicht als
            Netto-Wareneinsatz ausgegeben.
          </Notice>
          <h2>Speisenplanung und Verkäufe je Abend</h2>
          <div className="table-card">
            <ResponsiveTable>
              <thead>
                <tr>
                  <th>Speise / Getränk</th>
                  {kitchenDays.map((day) => (
                    <th key={day} colSpan={3}>
                      {day} · {eventDate(state, day)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th></th>
                  {kitchenDays.map((day) => (
                    <ReactColumns key={day} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.menu.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.name}</strong>
                    </td>
                    {kitchenDays.map((day) => {
                      const planned =
                          state.dishPlan?.find(
                            (p) => p.menuId === m.id && p.day === day,
                          )?.quantity ?? null,
                        sold =
                          effectiveSales(state).find(
                            (s) => s.menuId === m.id && s.day === day,
                          )?.quantity ?? null;
                      return (
                        <DayComparison
                          key={day}
                          day={day}
                          planned={planned}
                          sold={sold}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
          <div className="two-column">
            <section>
              <h2>Erfasster Umsatz nach Abend</h2>
              <div className="table-card">
                <ResponsiveTable>
                  <thead>
                    <tr>
                      <th>Abend</th>
                      <th>Mengen erfasst</th>
                      <th>Bekannter Teilumsatz</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kitchenDays.map((day) => {
                      const summary = summarizeSales(
                        sales.filter((s) => s.day === day),
                      );
                      return (
                        <tr key={day}>
                          <td>{day}</td>
                          <td>
                            {summary.entered} / {state.menu.length}
                            <small>{summary.missingPrices} Preise offen</small>
                          </td>
                          <td>{euros(summary.knownCents)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </ResponsiveTable>
              </div>
            </section>
            <section>
              <h2>Beleggrundlage · {scope}</h2>
              <div className="table-card">
                <ResponsiveTable>
                  <thead>
                    <tr>
                      <th>Erfassungsart</th>
                      <th>Belege</th>
                      <th>Bekannte Bruttobeträge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["Original vorhanden", "Original fehlt", "Erfasst"].map(
                      (status) => {
                        const entries = scoped.filter(
                            (i) => i.status === status,
                          ),
                          total = receiptTotals(entries);
                        return (
                          <tr key={status}>
                            <td>
                              {status === "Original fehlt"
                                ? "Listenwert ohne Original"
                                : status}
                            </td>
                            <td>{entries.length}</td>
                            <td>
                              {euros(total.knownCents)}
                              <small>{total.missing} Beträge offen</small>
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </ResponsiveTable>
              </div>
              <button className="text-button" onClick={() => go("Belege")}>
                Belege ergänzen
              </button>
            </section>
          </div>
          <h2>
            Bestand {purchasingLocation(state) ?? "· Küchenort offen"} ·
            Rechnung und Zählung
          </h2>
          {stockArticles.length ? (
            <div className="table-card">
              <ResponsiveTable>
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Rechnerischer Bestand</th>
                    <th>Letzte separate Zählung</th>
                  </tr>
                </thead>
                <tbody>
                  {stockArticles.map((a) => {
                    const s = stockSummary(state, a.id);
                    return (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>
                          {shownAmount(s.balance)} {a.unit}
                        </td>
                        <td>
                          {shownAmount(s.counted)} {a.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </ResponsiveTable>
            </div>
          ) : (
            <Empty title="Bestand noch offen">
              Erfasse Anfang, Zu-/Abgänge und Zählungen im Lager.
            </Empty>
          )}
          <button className="text-button" onClick={() => go("Lieferungen")}>
            Lager / Restmengen erfassen
          </button>
        </div>
      ) : (
        <>
          <Notice>
            Diese Erfahrungen gehören zu den Unterlagen der ausgewählten
            Veranstaltung. Sie ersetzen keine gemessenen Mengen.
          </Notice>
          {state.planLines.some((l) => l.lesson) ? (
            <div className="lessons-list">
              {[
                ...new Set(
                  state.planLines.map((l) => l.lesson).filter(Boolean),
                ),
              ].map((lesson) => {
                const line = state.planLines.find((l) => l.lesson === lesson)!;
                return (
                  <div key={lesson} className="lesson-card">
                    <h3>{line.name}</h3>
                    <p>{lesson}</p>
                    <SourceDetails source={line.source} />
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title="Keine Erfahrungen hinterlegt">
              Für diese Veranstaltung liegen noch keine qualitativen Notizen aus
              den Unterlagen vor.
            </Empty>
          )}
        </>
      )}
    </>
  );
}
function ReactColumns() {
  return (
    <>
      <th>Plan</th>
      <th>Verkauft</th>
      <th>Abweichung</th>
    </>
  );
}
function DayComparison({
  day,
  planned,
  sold,
}: {
  day: string;
  planned: number | null;
  sold: number | null;
}) {
  return (
    <>
      <td data-label={`${day} · Plan`}>{shownAmount(planned)}</td>
      <td data-label={`${day} · Verkauft`}>{shownAmount(sold)}</td>
      <td data-label={`${day} · Abweichung`}>
        {planned === null || sold === null
          ? "Offen"
          : `${sold - planned > 0 ? "+" : ""}${sold - planned}`}
      </td>
    </>
  );
}
