// Einheiten ausgeschrieben und in der richtigen Zahl: „1 Flasche“, „48 Flaschen“. Gespeichert bleibt, was eingetragen wurde.
const NAMES: Record<string, [string, string]> = {
  stk: ['Stück', 'Stück'],
  st: ['Stück', 'Stück'],
  stück: ['Stück', 'Stück'],
  fl: ['Flasche', 'Flaschen'],
  flasche: ['Flasche', 'Flaschen'],
  flaschen: ['Flasche', 'Flaschen'],
  port: ['Portion', 'Portionen'],
  portion: ['Portion', 'Portionen'],
  portionen: ['Portion', 'Portionen'],
  pck: ['Packung', 'Packungen'],
  pkg: ['Packung', 'Packungen'],
  packung: ['Packung', 'Packungen'],
  packungen: ['Packung', 'Packungen'],
  kiste: ['Kiste', 'Kisten'],
  kisten: ['Kiste', 'Kisten'],
  karton: ['Karton', 'Kartons'],
  sack: ['Sack', 'Säcke'],
  eimer: ['Eimer', 'Eimer'],
  glas: ['Glas', 'Gläser'],
  kopf: ['Kopf', 'Köpfe'],
  rolle: ['Rolle', 'Rollen'],
  dose: ['Dose', 'Dosen'],
  beutel: ['Beutel', 'Beutel'],
  paket: ['Paket', 'Pakete'],
  bund: ['Bund', 'Bund'],
  bon: ['Bon', 'Bons'],
  gebinde: ['Gebinde', 'Gebinde']
};
/** Ausgeschriebene Einheit passend zur Menge. Unbekannte Einheiten bleiben, wie sie sind. */
export function unitName(unit: string, quantity: number | null = 2): string {
  const key = (unit || '').trim().toLocaleLowerCase('de-DE').replace(/\.$/, '');
  const hit = NAMES[key];
  return hit ? (quantity === 1 ? hit[0] : hit[1]) : unit;
}
export const quantityUnit = (quantity: number | null, unit: string): string => unitName(unit, quantity);
/** „1 Gericht“, „25 Gerichte“. */
export function count(quantity: number, one: string, many: string): string {
  return quantity + ' ' + (quantity === 1 ? one : many);
}
