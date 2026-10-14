import {
  ArrowRight,
  Truck,
  ForkKnife,
  Receipt,
  ChartBar,
  Database,
} from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import { Heading, Jump, Empty, Notice } from "../components/shared.tsx";
import { missingDishCells, eventDate } from "../ui/facts.ts";
import { purchasingNeeds } from "../domain/workflow.ts";
export default function Home({ state, go }: ScreenProps) {
  const openRecipes = state.menu.filter(
      (m) => m.recipeStatus !== "Bestätigt",
    ).length,
    missingReceipts = state.invoices.filter(
      (i) => i.status === "Original fehlt",
    ).length,
    openDishes = missingDishCells(state).length,
    needs = purchasingNeeds(state, "Gesamt"),
    enteredSales = state.sales.filter(
      (s) => ["Freitag", "Samstag"].includes(s.day) && s.quantity !== null,
    ).length;
  const tasks = [
    {
      title: "Speisen und Bedarf planen",
      text: `${openDishes} Speisen-/Tageinträge offen · ${openRecipes} Rezepturentwürfe. ${needs.complete ? "Einkaufsbedarf ist prüfbar." : "Bedarf benötigt weitere Angaben."}`,
      icon: ForkKnife,
      screen: "Planung" as const,
      button: "Zur Planung",
    },
    {
      title: "Belege ergänzen",
      text: `${missingReceipts} erfasste Listenbelege ohne Original. ${state.invoices.length} Belege im Datenstand.`,
      icon: Receipt,
      screen: "Belege" as const,
      button: "Zu den Belegen",
    },
    {
      title: "Verkäufe und Bestand abschließen",
      text: `${enteredSales} von ${state.menu.length * 2} Verkaufsmengen erfasst · ${state.movements.filter((m) => m.type === "Zählung").length} Zählungen.`,
      icon: ChartBar,
      screen: "Auswertung" as const,
      button: "Zum Abschluss",
    },
  ];
  return (
    <>
      <Heading
        title="Deine Küche im Überblick"
        action={
          <button className="button primary" onClick={() => go("Planung")}>
            <ForkKnife size={24} />
            Planung öffnen
            <ArrowRight size={19} />
          </button>
        }
      >
        {state.event.name} {state.event.year} · Freitag{" "}
        {eventDate(state, "Freitag")} · Samstag {eventDate(state, "Samstag")}
      </Heading>
      <div className="overview-grid">
        <section>
          <h2>Bestellungen</h2>
          <p className="muted">Lieferant auswählen, danach Liefertag.</p>
          {state.suppliers.length ? (
            <div className="supplier-list">
              {state.suppliers.map((s) => (
                <button
                  className="supplier-row"
                  key={s.id}
                  onClick={() => go("Bestellungen", s.id)}
                >
                  <Truck size={30} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {
                        state.planLines.filter((l) => l.supplierId === s.id)
                          .length
                      }{" "}
                      geplante Positionen ·{" "}
                      {state.orders.filter((o) => o.supplierId === s.id).length}{" "}
                      vorbereitete Versionen
                    </small>
                  </span>
                  <ArrowRight size={22} />
                </button>
              ))}
            </div>
          ) : (
            <Empty title="Noch keine Lieferanten">
              Beginne mit Lieferanten und Artikeln in den Stammdaten.
            </Empty>
          )}
          <button className="text-button" onClick={() => go("Stammdaten")}>
            <Database size={19} />
            Stammdaten pflegen
          </button>
        </section>
        <section className="open-tasks">
          <h2>Nächste Schritte</h2>
          <p className="muted">
            Die Karten zeigen den aktuellen Erfassungsstand.
          </p>
          {tasks.map(({ title, text, icon: Icon, screen, button }) => (
            <div className="task-row" key={title}>
              <div className="task-icon">
                <Icon size={30} />
              </div>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              <Jump onClick={() => go(screen)}>{button}</Jump>
            </div>
          ))}
        </section>
      </div>
      <div className="source-footer">
        <span>
          {state.planLines.length} Einkaufspositionen · {state.articles.length}{" "}
          Artikel
        </span>
        <span>
          Bestellungen, Lieferungen, Verbrauch und Verkäufe bleiben getrennt.
        </span>
      </div>
      {state.sourceNotice && <Notice>{state.sourceNotice}</Notice>}
    </>
  );
}
