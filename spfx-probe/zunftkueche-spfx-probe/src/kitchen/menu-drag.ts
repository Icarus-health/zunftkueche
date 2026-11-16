// Ziehen und Ablegen für Zeilen der Karte. Zeigerereignisse statt HTML-Drag-and-drop, damit es auch am Handy und Tablet geht.
// Verschoben wird nur innerhalb einer Rubrik. Die Pfeiltasten bleiben für Tastatur und Screenreader.

const EDGE = 64,
  STEP = 14;

function scroller(from: HTMLElement): HTMLElement {
  for (let el: HTMLElement | null = from.parentElement; el; el = el.parentElement) {
    const style = el.ownerDocument.defaultView?.getComputedStyle(el);
    if (style && /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return (from.ownerDocument.scrollingElement as HTMLElement) || from.ownerDocument.documentElement;
}

/** Startet das Ziehen, wenn am Griff einer Zeile gedrückt wurde. Liefert true, wenn das Ereignis übernommen wurde. */
export function startMenuDrag(event: PointerEvent, done: (section: string, ids: string[]) => void): boolean {
  const handle = (event.target as Element | null)?.closest?.<HTMLElement>('[data-menu-drag]');
  if (!handle || (event.pointerType === 'mouse' && event.button !== 0)) return false;
  const row = handle.closest<HTMLElement>('[data-menu-line]');
  const list = row?.parentElement;
  const win = handle.ownerDocument.defaultView;
  if (!row || !list || !win) return false;
  event.preventDefault();
  const rows = (): HTMLElement[] =>
    Array.from(list.children).filter(
      (c): c is HTMLElement => c instanceof win.HTMLElement && c.hasAttribute('data-menu-line')
    );
  const ids = (): string[] => rows().map(r => r.dataset.menuLine || '');
  const before = ids();
  const section = (row.querySelector<HTMLInputElement>('input[name^="section_"]')?.value || '').trim();
  const box = scroller(list);
  const root = box === box.ownerDocument.documentElement || box === box.ownerDocument.body;
  let y = event.clientY,
    frame = 0;
  row.classList.add('dragging');
  list.classList.add('menu-sorting');
  try {
    handle.setPointerCapture(event.pointerId);
  } catch {
    /* ältere Browser: Ereignisse kommen trotzdem über das Fenster */
  }
  const place = (): void => {
    for (const other of rows()) {
      if (other === row) continue;
      const r = other.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        if (other.previousElementSibling !== row) list.insertBefore(row, other);
        return;
      }
    }
    const all = rows();
    const last = all[all.length - 1];
    if (last && last !== row) last.after(row);
  };
  const tick = (): void => {
    const top = root ? 0 : box.getBoundingClientRect().top;
    const bottom = root ? win.innerHeight : box.getBoundingClientRect().bottom;
    const delta = y < top + EDGE ? -STEP : y > bottom - EDGE ? STEP : 0;
    if (delta) {
      if (root) win.scrollBy(0, delta);
      else box.scrollTop += delta;
      place();
    }
    frame = win.requestAnimationFrame(tick);
  };
  const move = (e: PointerEvent): void => {
    if (e.pointerId !== event.pointerId) return;
    e.preventDefault();
    y = e.clientY;
    place();
  };
  const controller = new AbortController();
  const finish =
    (cancel: boolean): ((e: PointerEvent) => void) =>
    (e: PointerEvent): void => {
      if (e.pointerId !== event.pointerId) return;
      win.cancelAnimationFrame(frame);
      controller.abort();
      row.classList.remove('dragging');
      list.classList.remove('menu-sorting');
      if (cancel) {
        const byId = new Map(rows().map(r => [r.dataset.menuLine || '', r]));
        const anchor = rows()[rows().length - 1]?.nextSibling || null;
        for (const id of before) list.insertBefore(byId.get(id)!, anchor);
        return;
      }
      const after = ids();
      if (after.join('|') !== before.join('|')) done(section, after);
    };
  win.addEventListener('pointermove', move, { passive: false, signal: controller.signal });
  win.addEventListener('pointerup', finish(false), { signal: controller.signal });
  win.addEventListener('pointercancel', finish(true), { signal: controller.signal });
  frame = win.requestAnimationFrame(tick);
  return true;
}
