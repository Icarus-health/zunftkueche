import type { Article, Offer, Workspace } from './model';
import { button, field, select } from './markup.ts';
import { parseDecimal, validateEntity } from './domain.ts';
export interface IngredientDraft {
  articleId: string;
  offerId: string;
  supplierId: string;
}
export function ingredientForm(draft: IngredientDraft, state: Workspace, recipe = false): string {
  return `<form data-form="${recipe ? 'ww-ingredient' : 'ingredient'}" class="panel"><h1>Neuen Artikel mit Liefergebinde anlegen</h1><p>Danach geht es direkt mit euren bisherigen Eingaben weiter.</p><div class="formgrid">${field('name', 'Artikelname', '', true)}${field('unit', 'Einheit, z. B. kg, l oder Stück', '', true)}${select(
    'supplierId',
    'Lieferant',
    state.suppliers.filter(s => s.value.active).map(s => [s.value.id, s.value.name]),
    draft.supplierId
  )}${field('packName', 'Bestellgebinde, z. B. Sack oder Kiste', '', true)}${field('packSize', 'Einheiten je Gebinde', '1', true, 'text', 'inputmode="decimal"')}${field('priceNet', 'Nettopreis je Gebinde (optional)', '', false, 'text', 'inputmode="decimal"')}${field('code', 'Artikelnummer beim Lieferanten', '')}</div><div class="actions"><button type="submit" class="primary">Artikel anlegen und weiterarbeiten</button>${button(recipe ? 'ww-ingredient-cancel' : 'ingredient-cancel', 'Zurück ohne neuen Artikel')}</div></form>`;
}
export function readIngredient(form: HTMLFormElement, draft: IngredientDraft): { article: Article; offer: Offer } {
  const data = new FormData(form),
    get = (n: string): string => String(data.get(n) || '').trim();
  const article: Article = { id: draft.articleId, name: get('name'), unit: get('unit'), category: '', active: true };
  const offer: Offer = {
    id: draft.offerId,
    articleId: article.id,
    supplierId: get('supplierId'),
    code: get('code'),
    packName: get('packName'),
    packSize: parseDecimal(get('packSize'))!,
    priceNet: parseDecimal(get('priceNet')),
    priceDate: new Date().toISOString().slice(0, 10),
    deposit: null,
    note: '',
    active: true
  };
  validateEntity('articles', article);
  validateEntity('offers', offer);
  return { article, offer };
}
