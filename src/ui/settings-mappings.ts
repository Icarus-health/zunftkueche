import type { KitchenState } from '../domain/state.ts';

type Locations = NonNullable<KitchenState['event']['locations']>;

export function historicalMappingNames(state: KitchenState, draftLocations: Locations) {
  // Retain persisted aliases until the atomic edit is saved or discarded.
  return [...new Set([
    ...(state.event.locations ?? []).flatMap(location => location.historicalNames),
    ...draftLocations.flatMap(location => location.historicalNames),
    ...state.planLines.map(line => line.location),
    ...state.movements.map(line => line.location),
    ...state.invoices.map(line => line.scope),
  ].filter((name): name is string => !!name))].sort();
}
