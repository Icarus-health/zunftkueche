// Liefertage einer Saison. Einsatztage werden einmal an der Saison gepflegt und gelten überall als mögliche Liefertage.
// Früher angelegte Liefertermine (mit Uhrzeit und Ort) bleiben gültig und haben Vorrang vor dem bloßen Tag.
import type { Workspace } from '../model';
import type { Slot } from './model';
import { documents } from './model.ts';

export const DAY_SLOT = 'day-';

export function deliverySlots(s: Workspace, seasonId: string, extraDays: string[] = []): Slot[] {
  const real = documents(s.ww, 'slot').filter(slot => slot.scope === seasonId);
  const season = s.seasons.find(row => row.value.id === seasonId)?.value;
  const taken = new Set(real.map(slot => slot.date));
  const days = [...new Set([...(season?.operatingDays || []), ...extraDays])].filter(day => day && !taken.has(day));
  const virtual: Slot[] = days.map(day => ({
    id: DAY_SLOT + day,
    kind: 'slot',
    scope: seasonId,
    at: day + 'T00:00:00.000Z',
    by: 'Einsatztag',
    confirmed: true,
    name: 'Lieferung',
    date: day,
    time: '',
    place: ''
  }));
  return [...real, ...virtual].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}
export const isDaySlot = (slot: Slot): boolean => slot.id.startsWith(DAY_SLOT);
