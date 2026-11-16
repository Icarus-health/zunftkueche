/* eslint-disable @rushstack/no-new-null -- Offene Liefertermine sind ausdrücklich ohne Datum. */
// Gesamtbestellung einer Saison: alle Lieferanten nebeneinander nach Liefertag.
// Zeigt, was wann von wem kommt, prüft Überschneidungen und erlaubt Datum, Zeit und Ort bei Entwürfen einzutragen.
import type { Area, Delivery, Order, Season, Stored, Workspace } from './model';
import { documents } from './ww/model.ts';
import { withSchedule, scheduledOrder } from './supplier-orders.ts';
import { button, empty, h, n } from './markup.ts';
import { PdfPage, pdfDocument, wrap } from './pdf-document.ts';

export interface OverviewLine {
  articleId: string;
  name: string;
  quantity: number | null;
  packName: string;
  packSize: number;
  unit: string;
}
export interface OverviewDelivery {
  orderId: string;
  supplierName: string;
  status: Order['status'];
  deliveryId: string;
  date: string | null;
  time: string;
  place: string;
  /** Datum aus dem Wochentag in Zeit oder Kennung, nur als Vorschlag. */
  suggestedDate: string | null;
  editable: boolean;
  lines: OverviewLine[];
}
export interface OverviewData {
  days: string[];
  deliveries: OverviewDelivery[];
  suppliers: string[];
  issues: string[];
}

const historic = (o: Order): boolean => /^historisch(?:e|er|es)?\b/i.test(o.occasion.trim());
const weekdays: Array<[RegExp, number]> = [
  [/^(?:mo|mon)|\bmontag\b|\bmo\b/i, 1],
  [/^(?:di|tue)|\bdienstag\b|\bdi\b/i, 2],
  [/^(?:mi|wed)|\bmittwoch\b|\bmi\b|generalprobe/i, 3],
  [/^(?:do|thu)|\bdonnerstag\b|\bdo\b/i, 4],
  [/^(?:fr|fri)|\bfreitag\b|\bfr\b/i, 5],
  [/^(?:sa|sat)|\bsamstag\b|\bsa\b/i, 6],
  [/^(?:so|sun)|\bsonntag\b|\bso\b/i, 0]
];
const weekdayOf = (date: string): number => new Date(date + 'T12:00:00Z').getUTCDay();
export const shortDay = (date: string): string =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC'
  });
export const longDay = (date: string): string =>
  new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  });
/** Uhrzeit aus einem freien Zeitfenster, z. B. „Freitag 17:00 – Datum prüfen“ → „17:00“. */
export function clockTime(time: string): string {
  const m = time.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return m ? m[1].padStart(2, '0') + ':' + m[2] : '';
}
/** Wert im Uhrzeitfeld: erkannte Uhrzeit, sonst der freie Text eines datierten Termins; Hinweise wie „Mittwoch – Datum prüfen“ bleiben nur Platzhalter. */
export function timeValue(d: { date: string | null; time: string }): string {
  return clockTime(d.time) || (d.date ? d.time : '');
}
/** Vorschlag für ein fehlendes Datum: Wochentag aus Zeitfenster oder Terminkennung, nur wenn genau ein Tag passt. */
export function suggestDate(delivery: Delivery, candidates: string[]): string | null {
  for (const source of [delivery.time, delivery.id]) {
    const hit = weekdays.find(([pattern]) => pattern.test(source.trim()));
    if (!hit) continue;
    const days = candidates.filter(d => weekdayOf(d) === hit[1]);
    return days.length === 1 ? days[0] : null;
  }
  return null;
}
/** Tage, für die geliefert werden kann: Betriebstage der Saison und geplante Einsätze. */
export function candidateDays(state: Workspace, season: Season, area: Area): string[] {
  const plans = documents(state.ww, 'plan')
    .filter(p => p.scope === season.id && p.area === area)
    .map(p => p.date);
  const slots = documents(state.ww, 'slot')
    .filter(s => s.scope === season.id)
    .map(s => s.date);
  return [...new Set([...(season.operatingDays || []), ...plans, ...slots])].filter(Boolean).sort();
}
export function seasonOrders(state: Workspace, seasonId: string, area: Area): Stored<Order>[] {
  return state.orders.filter(
    r => r.value.seasonId === seasonId && r.value.area === area && r.value.status !== 'Storniert' && !historic(r.value)
  );
}

export function overviewData(state: Workspace, season: Season, area: Area): OverviewData {
  const candidates = candidateDays(state, season, area);
  const deliveries: OverviewDelivery[] = [];
  for (const { value: order } of seasonOrders(state, season.id, area)) {
    const planned = order.deliveries?.length
      ? order.deliveries
      : [{ id: 'single', date: order.deliveryDate, time: '', place: '' }];
    for (const d of planned) {
      deliveries.push({
        orderId: order.id,
        supplierName: order.supplierName,
        status: order.status,
        deliveryId: d.id,
        date: d.date,
        time: d.time,
        place: d.place,
        suggestedDate: d.date ? null : suggestDate(d, candidates),
        editable: order.status === 'Entwurf',
        lines: order.lines.map(l => ({
          articleId: l.articleId,
          name: l.articleName,
          quantity: order.deliveries?.length ? (l.schedule?.[d.id] ?? null) : l.quantity,
          packName: l.packName,
          packSize: l.packSize,
          unit: l.unit
        }))
      });
    }
  }
  deliveries.sort(
    (a, b) =>
      (a.date || a.suggestedDate || '9999').localeCompare(b.date || b.suggestedDate || '9999') ||
      clockTime(a.time).localeCompare(clockTime(b.time)) ||
      a.supplierName.localeCompare(b.supplierName, 'de')
  );
  const days = [...new Set([...candidates, ...deliveries.map(d => d.date).filter((d): d is string => !!d)])].sort();
  const issues: string[] = [];
  // Gleicher Artikel am selben Tag bei mehreren Lieferanten
  const byDay = new Map<string, Map<string, Set<string>>>();
  for (const d of deliveries) {
    if (!d.date) continue;
    for (const l of d.lines) {
      if (!l.quantity) continue;
      const day = byDay.get(d.date) || new Map<string, Set<string>>();
      const suppliers = day.get(l.name) || new Set<string>();
      suppliers.add(d.supplierName);
      day.set(l.name, suppliers);
      byDay.set(d.date, day);
    }
  }
  for (const [date, articles] of [...byDay].sort())
    for (const [name, suppliers] of articles)
      if (suppliers.size > 1)
        issues.push(name + ' kommt am ' + shortDay(date) + ' von ' + [...suppliers].sort().join(' und ') + '.');
  const filled = (d: OverviewDelivery): boolean => d.lines.some(l => l.quantity);
  const undated = deliveries.filter(d => !d.date && filled(d));
  if (undated.length) {
    const names = [...new Set(undated.map(d => d.supplierName))];
    issues.push(
      undated.length +
        (undated.length === 1 ? ' Lieferung hat' : ' Lieferungen haben') +
        ' noch kein Datum: ' +
        names.join(', ') +
        '.'
    );
  }
  const timeless = deliveries.filter(d => d.date && filled(d) && !clockTime(d.time));
  if (timeless.length)
    issues.push(
      timeless.length +
        (timeless.length === 1 ? ' Lieferung hat' : ' Lieferungen haben') +
        ' noch keine Uhrzeit: ' +
        [...new Set(timeless.map(d => d.supplierName))].join(', ') +
        '.'
    );
  const outside = deliveries.filter(d => d.date && candidates.length && !candidates.includes(d.date) && filled(d));
  for (const d of outside)
    issues.push(d.supplierName + ' liefert am ' + shortDay(d.date!) + ', an keinem geplanten Einsatztag.');
  const suppliers = [...new Set(deliveries.map(d => d.supplierName))].sort((a, b) => a.localeCompare(b, 'de'));
  return { days, deliveries, suppliers, issues };
}

const quantity = (l: OverviewLine): string =>
  l.quantity === null
    ? 'Menge offen'
    : n(l.quantity) +
      ' ' +
      l.packName +
      (l.packSize !== 1 ? ' (' + n(l.quantity * l.packSize) + ' ' + l.unit + ')' : '');
const statusTone = (s: Order['status']): string =>
  s === 'Entwurf' ? 'warning' : s === 'Bestellt' ? 'success' : 'info';

function grid(data: OverviewData): string {
  const columns = [...data.days, ...(data.deliveries.some(d => !d.date) ? [''] : [])];
  const head = columns.map(d => `<th scope="col">${d ? h(shortDay(d)) : 'ohne Datum'}</th>`).join('');
  const rows = data.suppliers
    .map(name => {
      const cells = columns
        .map(day => {
          const hits = data.deliveries.filter(d => d.supplierName === name && (d.date || '') === day);
          const content = hits
            .map(d => {
              const count = d.lines.filter(l => l.quantity).length;
              return `<span class="ov-slot ${d.status === 'Entwurf' ? 'draft' : 'fixed'}">${h(clockTime(d.time) || 'Zeit offen')}${d.place ? ' · ' + h(d.place) : ''}<small>${count} ${count === 1 ? 'Position' : 'Positionen'}</small></span>`;
            })
            .join('');
          return `<td>${content || '<span class="ov-none" aria-label="keine Lieferung">–</span>'}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${h(name)}</th>${cells}</tr>`;
    })
    .join('');
  return `<div class="ov-grid-wrap" tabindex="0" role="region" aria-label="Lieferanten und Liefertage"><table class="ov-grid"><thead><tr><th scope="col">Lieferant</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function deliveryCard(d: OverviewDelivery): string {
  const key = d.orderId + '|' + d.deliveryId;
  const lines = d.lines.filter(l => l.quantity !== 0);
  const body = lines.length
    ? `<ul class="ov-lines">${lines.map(l => `<li><span>${h(l.name)}</span><span>${h(quantity(l))}</span></li>`).join('')}</ul>`
    : '<p class="hint">Noch keine Mengen für diesen Termin.</p>';
  const editor = d.editable
    ? `<div class="ov-edit"><label>Datum<input type="date" name="date|${h(key)}" value="${h(d.date || d.suggestedDate || '')}" /></label><label>Uhrzeit<input name="time|${h(key)}" value="${h(timeValue(d))}" placeholder="${h(timeValue(d) ? 'z. B. 17:00' : d.time || 'z. B. 17:00')}" maxlength="100" /></label><label>Ort<input name="place|${h(key)}" value="${h(d.place)}" placeholder="z. B. Halle, Küchentür" maxlength="200" /></label></div>${!d.date && d.suggestedDate ? `<p class="hint">Datum vorgeschlagen aus „${h(d.time || d.deliveryId)}“. Mit Speichern übernehmen.</p>` : ''}`
    : `<p class="ov-fixed">${h(d.date ? longDay(d.date) : 'Datum offen')}${clockTime(d.time) ? ' · ' + h(clockTime(d.time)) : ''}${d.place ? ' · ' + h(d.place) : ''}<small>Bereits bestellt. Änderungen als Lieferhinweis erfassen.</small></p>`;
  return `<article class="ov-card"><header><h4>${h(d.supplierName)}</h4><span class="badge ${statusTone(d.status)}">${h(d.status)}</span>${button('order-open', 'Bestellung öffnen', d.orderId)}</header>${editor}${body}</article>`;
}

/** Ganze Seite. */
export function orderOverview(state: Workspace, season: Season | undefined, area: Area): string {
  if (!season) return '<h1>Gesamtbestellung</h1><p>Bitte zuerst eine Saison wählen.</p>';
  const data = overviewData(state, season, area);
  const heading = `<div class="page-heading"><div><h1>Gesamtbestellung</h1><p>${h(season.name)} · ${h(area)} · alle Lieferanten nach Liefertag</p></div><div class="actions">${button('overview-pdf', 'Lieferplan als PDF')}${button('order-round', 'Zur Bestellrunde')}</div></div>`;
  if (!data.deliveries.length)
    return heading + empty('Noch keine Bestellungen in dieser Saison. In der Bestellrunde je Lieferant beginnen.');
  const issues = data.issues.length
    ? `<section class="ov-issues" role="status"><h2>Bitte prüfen</h2><ul>${data.issues.map(i => `<li>${h(i)}</li>`).join('')}</ul></section>`
    : '<p class="ov-ok" role="status">Keine Überschneidungen. Alle Lieferungen haben Datum und Uhrzeit.</p>';
  const groups = [...data.days, ''].map(day => {
    const hits = data.deliveries.filter(d => (d.date || '') === day);
    if (!hits.length) return '';
    const title = day ? longDay(day) : 'Ohne Datum';
    return `<section class="ov-day" aria-labelledby="ov-${h(day || 'offen')}"><h3 id="ov-${h(day || 'offen')}">${h(title)}<small>${hits.length} ${hits.length === 1 ? 'Lieferung' : 'Lieferungen'}</small></h3>${hits.map(deliveryCard).join('')}</section>`;
  });
  const editable = data.deliveries.some(d => d.editable);
  return (
    heading +
    issues +
    `<section class="ov-section"><h2>Überblick</h2>${grid(data)}</section>` +
    `<form data-form="order-overview" class="ov-section"><h2>Je Liefertag</h2>${groups.join('')}${editable ? '<div class="actions sticky-actions"><button type="submit" class="primary">Liefertermine speichern</button></div>' : ''}</form>`
  );
}

/** Liest die Eingaben und liefert nur die Entwürfe, deren Liefertermine sich geändert haben. */
export function overviewChanges(
  form: HTMLFormElement | FormData,
  state: Workspace,
  seasonId: string,
  area: Area
): Array<{ order: Order; previous: Stored<Order> }> {
  const data = form instanceof FormData ? form : new FormData(form);
  const get = (name: string): string | null => {
    const value = data.get(name);
    return value === null ? null : String(value).trim();
  };
  const result: Array<{ order: Order; previous: Stored<Order> }> = [];
  for (const record of seasonOrders(state, seasonId, area)) {
    const original = record.value;
    if (original.status !== 'Entwurf') continue;
    const base = original.deliveries?.length
      ? structuredClone(original)
      : withSchedule(original, [{ id: 'delivery-1', date: original.deliveryDate, time: '', place: '' }]);
    const sourceId = (d: Delivery): string => (original.deliveries?.length ? d.id : 'single');
    let changed = false;
    const deliveries = base.deliveries!.map(d => {
      const key = original.id + '|' + sourceId(d);
      const date = get('date|' + key),
        time = get('time|' + key),
        place = get('place|' + key);
      if (date === null && time === null && place === null) return d;
      const next = {
        ...d,
        date: date === null ? d.date : date || null,
        time: time === null ? d.time : time,
        place: place === null ? d.place : place
      };
      const before = original.deliveries?.length ? d : { ...d, time: '', place: '' };
      if (next.date !== before.date || next.time !== timeValue(before) || next.place !== before.place) changed = true;
      // Unverändertes Feld behält den ursprünglichen Freitext, z. B. „Freitag 17:00 – Datum prüfen“.
      if (time !== null && time === clockTime(d.time) && next.date === d.date) next.time = d.time;
      return next;
    });
    if (!changed) continue;
    result.push({ order: scheduledOrder({ ...base, deliveries }), previous: record });
  }
  return result;
}

/** Lieferplan zum Aushängen, A4 hoch, je Tag die Lieferungen mit allen Positionen. */
export function overviewPdf(
  state: Workspace,
  season: Season,
  area: Area,
  generatedAt = new Date().toISOString()
): Uint8Array {
  const data = overviewData(state, season, area);
  const pages: string[] = [];
  let page = new PdfPage(),
    y = 0;
  const stamp = new Date(generatedAt).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const start = (): void => {
    page = new PdfPage();
    page.box(0, 782, 595, 60, [0.25, 0.27, 0.58]);
    page.raw('1 1 1 rg\n');
    page.text(36, 812, 'Lieferplan · Gesamtbestellung', 16, true);
    page.text(36, 794, season.name + ' · ' + area + ' · Stand ' + stamp, 9);
    page.raw('0 0 0 rg\n');
    y = 752;
  };
  const finish = (): void => {
    page.text(500, 30, 'Seite ' + (pages.length + 1), 7);
    pages.push(page.stream);
  };
  const need = (height: number): void => {
    if (y - height < 50) {
      finish();
      start();
    }
  };
  start();
  if (data.issues.length) {
    need(16 + data.issues.length * 11);
    page.text(36, y, 'Bitte prüfen', 10, true);
    y -= 14;
    for (const issue of data.issues)
      for (const part of wrap(issue, 105)) {
        need(11);
        page.text(44, y, part, 8);
        y -= 11;
      }
    y -= 6;
  }
  for (const day of [...data.days, '']) {
    const hits = data.deliveries.filter(d => (d.date || '') === day && d.lines.some(l => l.quantity));
    if (!hits.length) continue;
    need(40);
    page.box(36, y - 4, 523, 18, [0.9, 0.91, 0.96]);
    page.text(42, y + 1, day ? longDay(day) : 'Ohne Datum', 11, true);
    y -= 24;
    for (const d of hits) {
      const lines = d.lines.filter(l => l.quantity);
      need(18 + Math.min(lines.length, 4) * 11);
      page.text(
        36,
        y,
        (clockTime(d.time) || 'Zeit offen') +
          '  ' +
          d.supplierName +
          (d.place ? ' · ' + d.place : '') +
          (d.status === 'Entwurf' ? '  (Entwurf)' : ''),
        10,
        true
      );
      y -= 13;
      for (const l of lines) {
        need(11);
        page.text(48, y, l.name, 9);
        page.text(330, y, quantity(l), 9);
        page.frame(540, y - 2, 9, 9);
        y -= 11;
      }
      y -= 7;
    }
  }
  page.text(36, 30, 'Kästchen: bei Ankunft abhaken', 7);
  finish();
  return pdfDocument(pages, 595, 842);
}
