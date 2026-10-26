import { button, h } from '../markup.ts';
export type Screen = 'slots' | 'rules' | 'templates' | 'prices' | 'recipes' | 'plans' | 'bills' | 'systems' | 'journal' | 'reports';
export function businessTabs(active: Screen): string { const items: Array<[
    Screen,
    string
]> = [['slots', 'Liefertermine'], ['templates', 'Ordersätze'], ['prices', 'Preislisten'], ['rules', 'Lieferregeln'], ['bills', 'Rechnungen'], ['systems', 'Kassen- und Bestellsystem']]; return `<nav class="ww-tabs" aria-label="Einkauf und Daten">${button('nav', 'Bestellungen', 'orders')}${items.map(([id, label]) => `<button type="button" data-action="ww-open" data-id="${id}" aria-current="${active === id ? 'page' : 'false'}">${h(label)}</button>`).join('')}</nav>`; }
export function heading(title: string, description: string, actions = ''): string { return `<div class="page-heading"><div><h1>${h(title)}</h1><p>${h(description)}</p></div>${actions}</div>`; }
export function rowActions(id: string, editLabel = 'Bearbeiten'): string { return button('ww-edit', editLabel, id); }
export function confirmationActions(label = 'Speichern'): string { return `<div class="actions sticky-actions"><button type="submit" class="primary">${h(label)}</button>${button('ww-cancel', 'Abbrechen')}</div>`; }
export const today = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
export const dayLabel = (date: string): string => new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
