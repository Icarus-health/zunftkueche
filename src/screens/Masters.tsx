import { useState } from "react";
import { Plus, PencilSimple, MagnifyingGlass } from "@phosphor-icons/react";
import type { ScreenProps } from "../App.tsx";
import type { Article, Menu, Supplier } from "../domain/state.ts";
import {
  Heading,
  Modal,
  Empty,
  Notice,
  Tabs,
  euros,
  unitEuros,
  amount,
  SourceDetails,
} from "../components/shared.tsx";
import { parseQuantity } from "../domain/kitchen.ts";
import { articleReferenced, parseMoney } from "../ui/facts.ts";
type Kind = "Lieferanten" | "Artikel" | "Speisen & Getränke";
type Editor = { kind: Kind; item?: Supplier | Article | Menu };
export default function Masters(props: ScreenProps) {
  const { state, busy } = props,
    [tab, setTab] = useState<Kind>("Lieferanten"),
    [search, setSearch] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const suppliers = state.suppliers.filter((s) =>
      matches(`${s.name} ${s.email ?? ""}`),
    ),
    articles = state.articles.filter((a) =>
      matches(
        `${a.name} ${a.category} ${state.suppliers.find((s) => s.id === a.supplierId)?.name ?? ""}`,
      ),
    ),
    menu = state.menu.filter((m) => matches(`${m.name} ${m.category}`));
  return (
    <>
      <Heading
        eyebrow="Grundlage für eure Küche"
        title="Stammdaten pflegen"
        action={
          <button
            className="button primary"
            disabled={busy || (tab === "Artikel" && !state.suppliers.length)}
            onClick={() => setEditor({ kind: tab })}
          >
            <Plus size={20} />
            {tab === "Lieferanten"
              ? "Lieferant"
              : tab === "Artikel"
                ? "Artikel"
                : "Speise / Getränk"}{" "}
            ergänzen
          </button>
        }
      >
        Lieferanten, Artikel, Gebinde und Preise für {state.event.name}{" "}
        {state.event.year}.
      </Heading>
      <Tabs
        items={["Lieferanten", "Artikel", "Speisen & Getränke"]}
        value={tab}
        onChange={(value) => {
          setTab(value as Kind);
          setSearch("");
        }}
        label="Stammdatenbereiche"
      />
      <div className="toolbar">
        <label className="search-field">
          <span>
            <MagnifyingGlass size={17} />
            Suchen
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              tab === "Artikel"
                ? "Artikel, Lieferant oder Kategorie"
                : "Name oder Kategorie"
            }
          />
        </label>
        <span className="muted">
          Bestehende Angaben bearbeiten oder neue Datensätze anlegen.
        </span>
      </div>
      {tab === "Lieferanten" ? (
        suppliers.length ? (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Lieferant</th>
                  <th>E-Mail</th>
                  <th>Artikel</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.email ?? "Offen"}</td>
                    <td>
                      {
                        state.articles.filter((a) => a.supplierId === s.id)
                          .length
                      }
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditor({ kind: tab, item: s })}
                      >
                        <PencilSimple size={17} />
                        Öffnen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Keine Lieferanten gefunden">
            Lege einen Lieferanten an oder ändere deine Suche.
          </Empty>
        )
      ) : tab === "Artikel" ? (
        <>
          {!state.suppliers.length && (
            <Notice>
              Lege zuerst einen Lieferanten an. Danach kannst du ihm Artikel
              zuordnen.
            </Notice>
          )}
          {articles.length ? (
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Artikel</th>
                    <th>Lieferant</th>
                    <th>Gebinde</th>
                    <th>Netto je Einheit</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.name}</strong>
                        <small>
                          {a.category} · {a.unit}
                        </small>
                      </td>
                      <td>
                        {state.suppliers.find((s) => s.id === a.supplierId)
                          ?.name ?? "Lieferant fehlt"}
                      </td>
                      <td>
                        {a.packSize == null
                          ? "Offen"
                          : `${amount(a.packSize)} ${a.unit} / Gebinde`}
                      </td>
                      <td>
                        {unitEuros(a.unitPriceCents)}
                        <small>je {a.unit}</small>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setEditor({ kind: tab, item: a })}
                        >
                          <PencilSimple size={17} />
                          Öffnen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Keine Artikel gefunden">
              Lege einen Artikel an oder ändere deine Suche.
            </Empty>
          )}
        </>
      ) : menu.length ? (
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Speise / Getränk</th>
                <th>Verkaufspreis</th>
                <th>Rezeptur</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {menu.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    <small>{m.category}</small>
                  </td>
                  <td>{euros(m.priceCents)}</td>
                  <td>
                    {m.recipeStatus} · {m.recipe.length} Zutaten
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEditor({ kind: tab, item: m })}
                    >
                      <PencilSimple size={17} />
                      Öffnen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="Keine Speisen oder Getränke gefunden">
          Lege einen Menüeintrag an; die Rezeptur bearbeitest du in der Planung.
        </Empty>
      )}
      {editor && (
        <MasterEditor
          key={`${editor.kind}:${editor.item?.id ?? "new"}`}
          {...props}
          editor={editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
function MasterEditor({
  state,
  busy,
  commit,
  saveError,
  editor,
  onClose,
}: ScreenProps & { editor: Editor; onClose: () => void }) {
  const { item, kind } = editor,
    article = kind === "Artikel" ? (item as Article | undefined) : undefined,
    menu =
      kind === "Speisen & Getränke" ? (item as Menu | undefined) : undefined;
  const [name, setName] = useState(item?.name ?? ""),
    [email, setEmail] = useState(
      kind === "Lieferanten"
        ? ((item as Supplier | undefined)?.email ?? "")
        : "",
    ),
    [supplierId, setSupplier] = useState(
      article?.supplierId ?? state.suppliers[0]?.id ?? "",
    ),
    [unit, setUnit] = useState(article?.unit ?? ""),
    [category, setCategory] = useState(
      article?.category ??
        menu?.category ??
        (kind === "Artikel" ? "Lebensmittel" : "Speisen"),
    ),
    [pack, setPack] = useState(amount(article?.packSize ?? null)),
    [price, setPrice] = useState(
      amount(
        (article?.unitPriceCents ?? menu?.priceCents ?? null) === null
          ? null
          : (article?.unitPriceCents ?? menu?.priceCents)! / 100,
      ),
    ),
    [error, setError] = useState("");
  const referenced = article ? articleReferenced(state, article.id) : false;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const common = { ...(item ? { id: item.id } : {}), name };
      const type =
          kind === "Lieferanten"
            ? "supplier.save"
            : kind === "Artikel"
              ? "article.save"
              : "menu.save",
        payload =
          kind === "Lieferanten"
            ? { ...common, email }
            : kind === "Artikel"
              ? {
                  ...common,
                  supplierId,
                  unit,
                  category,
                  packSize: parseQuantity(pack),
                  unitPriceCents: parseMoney(price, true),
                }
              : { ...common, category, priceCents: parseMoney(price) };
      if (await commit(type, payload)) onClose();
      else setError("Noch nicht gespeichert. Bitte den Hinweis oben beachten.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal
      title={`${item ? "Bearbeiten" : "Ergänzen"} · ${kind === "Lieferanten" ? "Lieferant" : kind === "Artikel" ? "Artikel" : "Speise / Getränk"}`}
      onClose={onClose}
    >
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <label>
            Name
            <input
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {kind === "Lieferanten" ? (
            <label>
              E-Mail (optional)
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          ) : (
            <>
              <div className="form-row">
                {kind === "Artikel" ? (
                  <label>
                    Lieferant
                    <select
                      value={supplierId}
                      disabled={referenced}
                      onChange={(e) => setSupplier(e.target.value)}
                    >
                      {state.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  Kategorie
                  <input
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="master-categories"
                  />
                  <datalist id="master-categories">
                    {["Lebensmittel", "Getränke", "Material", "Speisen"].map(
                      (c) => (
                        <option key={c} value={c} />
                      ),
                    )}
                  </datalist>
                </label>
              </div>
              {kind === "Artikel" && (
                <>
                  <div className="form-row">
                    <label>
                      Artikel-Einheit
                      <input
                        required
                        maxLength={50}
                        value={unit}
                        disabled={referenced}
                        onChange={(e) => setUnit(e.target.value)}
                        placeholder="z. B. kg, Stück oder Liter"
                      />
                    </label>
                    <label>
                      Menge pro Gebinde
                      <input
                        inputMode="decimal"
                        value={pack}
                        onChange={(e) => setPack(e.target.value)}
                        placeholder="Offen"
                      />
                      <small>
                        In {unit || "Artikel-Einheiten"}. Unbekannt bleibt leer.
                      </small>
                    </label>
                  </div>
                  {referenced && (
                    <p className="muted">
                      Dieser Artikel wird bereits verwendet. Für eine andere
                      Einheit oder einen anderen Lieferanten lege bitte einen
                      neuen Artikel an.
                    </p>
                  )}
                </>
              )}
              <label>
                {kind === "Artikel"
                  ? `Einkaufspreis netto je ${unit || "Einheit"} · €`
                  : "Verkaufspreis je Portion / Stück · €"}
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="Offen"
                />
                <small>
                  {kind === "Artikel"
                    ? "Bis zu vier Nachkommastellen. Bereits vorbereitete Bestellungen behalten ihren Preisstand."
                    : "Bis zu zwei Nachkommastellen. Bereits erfasste Verkäufe behalten ihren Preisstand."}
                </small>
              </label>
              {article?.previousUnitPriceCents != null && (
                <p className="muted">
                  Preisreferenz {article.priceReferenceYear}:{" "}
                  {unitEuros(article.previousUnitPriceCents)}. Für diese
                  Veranstaltung neu bestätigen.
                </p>
              )}
              {menu && <SourceDetails source={menu.source} />}
            </>
          )}
          {(saveError || error) && (
            <p className="field-error" role="alert">
              {saveError || error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button primary"
              type="submit"
              disabled={kind === "Artikel" && !supplierId}
            >
              Speichern
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
