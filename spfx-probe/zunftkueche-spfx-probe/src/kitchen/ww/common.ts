import { button, h } from '../markup.ts';
export type Screen = 'slots' | 'rules' | 'templates' | 'prices' | 'recipes' | 'inbox' | 'plans' | 'equipment' | 'next-use' | 'bills' | 'systems' | 'journal' | 'reports';
export function businessTabs(_active: Screen): string { return `<nav class="ww-tabs" aria-label="Zurück zum Arbeitsbereich">${button('nav','Bestellungen','orders')}${button('nav','Lieferanten','suppliers')}${button('nav','Auswertung','reports')}</nav>`; }
export function heading(title: string, description: string, actions = ''): string { return `<div class="page-heading"><div><h1>${h(title)}</h1>${description ? '<p>' + h(description) + '</p>' : ''}</div>${actions}</div>`; }
export function rowActions(id: string, editLabel = 'Bearbeiten'): string { return button('ww-edit', editLabel, id); }
export function confirmationActions(label = 'Speichern', back = 'Abbrechen'): string { return `<div class="actions sticky-actions"><button type="submit" class="primary">${h(label)}</button>${button('ww-cancel', back)}</div>`; }
export const today = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
export const dayLabel = (date: string): string => new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
