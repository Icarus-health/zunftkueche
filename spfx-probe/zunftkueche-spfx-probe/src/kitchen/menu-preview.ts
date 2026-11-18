// Vorschau der Karte im Editor: derselbe Satz wie das PDF, als SVG gezeichnet. Ändert sich bei jeder Eingabe.
import type { MenuCard } from './ww/model';
import { PAGE, layoutMenu } from './menu-layout.ts';

const esc = (v: string): string =>
  v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n = (v: number): string => String(Math.round(v * 100) / 100);

/** Seiten als SVG. `wappen` ist die Bildadresse mit Seitenverhältnis oder null. */
export function menuPreview(card: MenuCard, wappen: { href: string; width: number; height: number } | null): string {
  const pages = layoutMenu(card, wappen ? wappen.width / wappen.height : null);
  return pages
    .map((ops, i) => {
      const body = ops
        .map(op => {
          if (op.t === 'text')
            return `<text x="${n(op.x)}" y="${n(op.y)}" font-size="${op.size}" font-weight="${op.weight}" fill="${op.color}"${op.spacing ? ` letter-spacing="${op.spacing}"` : ''}>${esc(op.value)}</text>`;
          if (op.t === 'line')
            return `<line x1="${n(op.x1)}" y1="${n(op.y1)}" x2="${n(op.x2)}" y2="${n(op.y2)}" stroke="${op.color}" stroke-width="${op.width}"/>`;
          return wappen
            ? `<image href="${esc(wappen.href)}" x="${n(op.x)}" y="${n(op.y)}" width="${n(op.width)}" height="${n(op.height)}"/>`
            : '';
        })
        .join('');
      return `<svg class="menu-page" viewBox="0 0 ${PAGE.width} ${PAGE.height}" role="img" aria-label="Vorschau der Karte${pages.length > 1 ? `, Seite ${i + 1} von ${pages.length}` : ''}" font-family="ZKMontserrat, Montserrat, Arial, sans-serif"><rect width="${PAGE.width}" height="${PAGE.height}" fill="#fff"/>${body}</svg>`;
    })
    .join('');
}
