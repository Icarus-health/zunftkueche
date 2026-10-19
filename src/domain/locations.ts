import type { KitchenState } from './state.ts';

export const legacyLocations = ['Küche', 'Bar', 'Zunftscheuer', 'Brunnen', 'Mitwirkende / Aufbau / Probe'];

/** Absence preserves the legacy vocabulary. An explicit empty list means no active places. */
export function activeLocations(state: KitchenState): string[] {
  return state.event.locations === undefined
    ? [...legacyLocations]
    : state.event.locations.map(location => location.name);
}

/** Resolve only an explicitly confirmed alias. Never rewrite a stored label. */
export function resolveLocation(state: KitchenState, raw: string | undefined): string {
  const name = raw ?? 'Küche';
  return state.event.locations?.find(location =>
    location.name === name || location.historicalNames.includes(name))?.name ?? name;
}

export function sameLocation(state: KitchenState, raw: string | undefined, selected: string | null): boolean {
  return selected !== null && resolveLocation(state, raw) === resolveLocation(state, selected);
}

/** An owner selection wins. Otherwise only the literal/confirmed legacy Küche is a fallback. */
export function purchasingLocation(state: KitchenState): string | null {
  if (state.event.purchasingLocation !== undefined)
    return state.event.purchasingLocation && activeLocations(state).includes(state.event.purchasingLocation)
      ? state.event.purchasingLocation : null;
  const kitchen = resolveLocation(state, 'Küche');
  return activeLocations(state).includes(kitchen) ? kitchen : null;
}

export function requirePurchasingLocation(state: KitchenState): string {
  const location = purchasingLocation(state);
  if (!location) throw new Error('Bitte einen aktiven Ort für die Küchenplanung festlegen.');
  return location;
}

export function historicalLocations(state: KitchenState): string[] {
  return [...new Set([...activeLocations(state), ...state.planLines.map(line => line.location),
    ...state.movements.map(movement => movement.location), ...state.invoices.map(invoice => invoice.scope)]
    .filter((value): value is string => !!value))];
}

export function newEntryLocation(state: KitchenState, remembered?: string): string {
  const active = activeLocations(state);
  return remembered && active.includes(remembered) ? remembered : active[0] ?? '';
}

export function requireActiveLocation(state: KitchenState, location: string): string {
  // Older unconfigured aggregates historically allowed arbitrary valid location text.
  if (state.event.locations !== undefined && !activeLocations(state).includes(location))
    throw new Error('Dieser Ort ist nicht aktiv. Bitte einen aktiven Ort auswählen.');
  return location;
}

export function requireReceiptLocation(state: KitchenState, location: string, existing: boolean): string {
  if (!existing) return requireActiveLocation(state, location);
  if (state.event.locations !== undefined && !historicalLocations(state).includes(location))
    throw new Error('Bitte einen aktiven oder bereits historisch verwendeten Ort auswählen.');
  return location;
}
