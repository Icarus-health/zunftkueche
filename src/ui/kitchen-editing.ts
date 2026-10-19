import type {KitchenState} from '../domain/state.ts';

/** Culinary fields are read-only after closure; navigation, export and reopen use their own permissions. */
export function kitchenEditingDisabled({state, busy, readOnly}: {state: KitchenState; busy: boolean; readOnly: boolean}): boolean {
  return busy || readOnly || state.event.status === 'Abgeschlossen';
}
