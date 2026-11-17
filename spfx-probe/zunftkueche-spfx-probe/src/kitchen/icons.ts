// Eigene Liniensymbole als Inline-SVG. Keine Schriftdatei, kein fremder Symbolsatz, kein Abruf von außen.
// Strich 1,8 mit runden Enden im 24er-Raster (Zunft-Standard build-like-apple), Punkte als gefüllte Kreise.
// Zweiter Eintrag: gefüllte Fassung für den gewählten Bereich in der Navigation.
const CUT = 'stroke="var(--icon-cut,#fff)" fill="none"';
const shapes: Record<string, [string, string?]> = {
  home: ['<path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z"/>', '<path d="M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z"/>'],
  cart: [
    '<path d="M3 5h2.5l2 10h10l2-7H7"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    '<path d="M3 5h2.5l2 10h10l2-7H7" fill="none"/><path d="M7.2 8h12.1l-1.9 6.8H8.6z"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'
  ],
  package: [
    '<path d="M4 8h16v11H4z"/><path d="M3 5h18v3H3z"/><path d="M10 12h4"/>',
    '<path d="M4 9h16v10H4z"/><path d="M3 5h18v3H3z"/><path d="M10 12.5h4" ' +
      CUT +
      ' stroke-width="1.8" stroke-linecap="round"/>'
  ],
  list: [
    '<path d="M8 7h11"/><path d="M8 12h11"/><path d="M8 17h11"/><circle cx="4.5" cy="7" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17" r="1.2" fill="currentColor" stroke="none"/>'
  ],
  truck: [
    '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7.5" cy="17.5" r="1.6"/><circle cx="17.5" cy="17.5" r="1.6"/>',
    '<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="7.5" cy="17.5" r="1.9" ' +
      CUT +
      ' stroke-width="1.4"/><circle cx="17.5" cy="17.5" r="1.9" ' +
      CUT +
      ' stroke-width="1.4"/><circle cx="7.5" cy="17.5" r="1.1"/><circle cx="17.5" cy="17.5" r="1.1"/>'
  ],
  calendar: [
    '<rect x="4" y="6" width="16" height="14" rx="1.5"/><path d="M4 10h16"/><path d="M8 4v4"/><path d="M16 4v4"/>',
    '<rect x="4" y="6" width="16" height="14" rx="1.5"/><path d="M5.5 10.5h13" ' +
      CUT +
      ' stroke-width="1.6" stroke-linecap="round"/><path d="M8 4v3" stroke-linecap="round" stroke-width="2"/><path d="M16 4v3" stroke-linecap="round" stroke-width="2"/>'
  ],
  count: [
    '<rect x="6" y="5" width="12" height="15" rx="1.5"/><path d="M9 5V3.5h6V5"/><path d="M9 10h6"/><path d="M9 14h6"/>'
  ],
  chart: ['<path d="M5 19v-8"/><path d="M12 19V5"/><path d="M19 19v-5"/>'],
  settings: [
    '<path d="M4 7h8"/><path d="M18 7h2"/><circle cx="15" cy="7" r="2.4"/><path d="M4 17h2"/><path d="M12 17h8"/><circle cx="9" cy="17" r="2.4"/>'
  ],
  info: [
    '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1.2" fill="currentColor" stroke="none"/>'
  ],
  chevron: ['<path d="m9 6 6 6-6 6"/>'],
  down: ['<path d="m6 9 6 6 6-6"/>'],
  up: ['<path d="M12 19V6"/><path d="m6 11 6-6 6 6"/>'],
  card: [
    '<rect x="5" y="3.5" width="14" height="17" rx="1.8"/><path d="M8.5 8h7"/><path d="M8.5 12h7"/><path d="M8.5 16h4"/>',
    '<rect x="5" y="3.5" width="14" height="17" rx="1.8"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" ' +
      CUT +
      ' stroke-width="1.6" stroke-linecap="round"/>'
  ],
  arrowdown: ['<path d="M12 5v13"/><path d="m6 13 6 6 6-6"/>'],
  grip: [
    '<circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none"/>'
  ],
  updown: ['<path d="m8 9 4-4 4 4"/><path d="m8 15 4 4 4-4"/>'],
  search: ['<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>'],
  check: ['<path d="m5 12.5 4.5 4.5L19 7.5"/>'],
  plus: ['<path d="M12 5v14"/><path d="M5 12h14"/>'],
  minus: ['<path d="M5 12h14"/>'],
  more: [
    '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>'
  ]
};
export function icon(name: string): string {
  const [line, solid] = shapes[name] || shapes.info;
  return (
    '<svg class="zk-icon zk-' +
    name +
    (solid ? ' zk-dual' : '') +
    '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g class="zk-line" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    line +
    '</g>' +
    (solid
      ? '<g class="zk-solid" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
        solid +
        '</g>'
      : '') +
    '</svg>'
  );
}
