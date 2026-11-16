// Karte für den Zunftabend: öffnen, Einträge hinzufügen, verschieben, entfernen, speichern, als PDF oder Word ausgeben.
import type { KitchenView } from '../view';
import type { MenuCard, MenuSection } from '../ww/model';
import { documents } from '../ww/model.ts';
import { validateDocument } from '../ww/domain.ts';
import {
  card2025,
  emptyMenu,
  lineFromRecipe,
  menuId,
  menuRecipes,
  moveLine,
  numberLines,
  proposeFromRecipes,
  readMenu,
  reorderSection
} from '../menu-card.ts';
import { menuDocx, menuPdf } from '../menu-export.ts';
import { menuHeader } from '../menu-header.ts';
import { saveFile } from '../save-file.ts';
import { uuid } from '../view-support.ts';

function current(app: KitchenView): MenuCard {
  const form = app.root.querySelector<HTMLFormElement>('form[data-form=menu]');
  if (!app.menuDraft) throw new Error('Karte bitte erneut öffnen.');
  return form ? readMenu(form, app.menuDraft) : app.menuDraft;
}
export function openMenu(app: KitchenView): void {
  const season = app.season();
  if (!season || !app.state) throw new Error('Bitte zuerst eine Saison wählen.');
  if (!app.state.ww?.ready) throw new Error('Die Warenwirtschaft ist noch nicht eingerichtet.');
  app.clearEditor();
  const stored = app.state.ww.records.find(r => r.value.kind === 'menu' && r.value.id === menuId(season.id));
  app.menuPrevious = stored;
  app.menuDraft = stored ? (structuredClone(stored.value) as MenuCard) : emptyMenu(season, app.user);
  app.view = 'planning';
  app.render();
}
function file(app: KitchenView, card: MenuCard, ext: string): string {
  return (card.name || 'Karte').replace(/[^\p{L}\p{N}]+/gu, '-') + '.' + ext;
}
export async function menuAction(app: KitchenView, action: string, id: string): Promise<boolean> {
  if (!action.startsWith('menu-')) return false;
  if (action === 'menu-open') {
    if (!app.canLeave()) return true;
    openMenu(app);
    return true;
  }
  if (action === 'menu-close') {
    if (!app.canLeave()) return true;
    app.clearEditor();
    app.view = 'planning';
    app.render();
    return true;
  }
  const card = current(app);
  if (action === 'menu-pdf' || action === 'menu-docx') {
    validateDocument(card);
    const header = await menuHeader(app.root.ownerDocument, card.title);
    const pdf = action === 'menu-pdf';
    const data = pdf ? menuPdf(card, header?.jpeg || null) : menuDocx(card, header?.png || null);
    saveFile(
      file(app, card, pdf ? 'pdf' : 'docx'),
      new Blob([new Uint8Array(data).buffer], {
        type: pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      }),
      app.root.ownerDocument
    );
    app.menuDraft = card;
    return true;
  }
  let lines = card.lines;
  if (action === 'menu-add') {
    const section = id as MenuSection;
    const choice = app.root.querySelector<HTMLSelectElement>(`select[name="add_${section}"]`)?.value || '';
    if (!choice) throw new Error('Bitte zuerst auswählen, was auf die Karte soll.');
    const recipe = menuRecipes(app.state!).find(r => r.id === choice);
    const line =
      choice === 'free' || !recipe
        ? {
            id: uuid(),
            section,
            recipeId: null,
            number: '',
            label: 'Neuer Eintrag',
            detail: '',
            size: '',
            producer: '',
            priceGross: null
          }
        : { ...lineFromRecipe(recipe, app.state!, uuid()), section };
    const lastOfSection = lines.map(l => l.section).lastIndexOf(section);
    lines = numberLines(
      lastOfSection < 0
        ? [...lines, line].sort(
            (a, b) =>
              ['wine', 'sparkling', 'drinks', 'food'].indexOf(a.section) -
              ['wine', 'sparkling', 'drinks', 'food'].indexOf(b.section)
          )
        : [...lines.slice(0, lastOfSection + 1), line, ...lines.slice(lastOfSection + 1)]
    );
  } else if (action === 'menu-up' || action === 'menu-down') lines = moveLine(lines, id, action === 'menu-up' ? -1 : 1);
  else if (action === 'menu-remove') lines = lines.filter(l => l.id !== id);
  else if (action === 'menu-propose') lines = proposeFromRecipes(app.state!, uuid);
  else if (action === 'menu-preset') lines = card2025(uuid);
  else return false;
  app.menuDraft = { ...card, lines };
  app.dirty = true;
  app.render();
  return true;
}
/** Nach Ziehen und Ablegen: Eingaben übernehmen, Reihenfolge der Rubrik setzen, neu zeichnen. */
export function menuReorder(app: KitchenView, section: string, ids: string[]): void {
  const card = current(app);
  if (!['wine', 'sparkling', 'drinks', 'food'].includes(section))
    throw new Error('Rubrik nicht erkannt. Bitte Pfeile nutzen.');
  app.menuDraft = { ...card, lines: reorderSection(card.lines, section as MenuSection, ids) };
  app.dirty = true;
  app.render();
}
export async function saveMenu(app: KitchenView, form: HTMLFormElement): Promise<void> {
  if (!app.menuDraft || !app.state) throw new Error('Karte bitte erneut öffnen.');
  if (!app.writable()) throw new Error('Bitte eine aktive Saison wählen.');
  const card: MenuCard = { ...readMenu(form, app.menuDraft), at: new Date().toISOString(), by: app.user };
  validateDocument(card);
  const previous = app.menuPrevious;
  await app.run(
    () => app.store.ww.save(card, previous, app.operationId),
    'Karte gespeichert und durch erneutes Lesen bestätigt.',
    () => {
      const stored = documents(app.state?.ww, 'menu').find(m => m.id === card.id);
      app.menuPrevious = app.state?.ww?.records.find(r => r.value.id === card.id);
      app.menuDraft = stored ? structuredClone(stored) : card;
      app.view = 'planning';
    }
  );
}
