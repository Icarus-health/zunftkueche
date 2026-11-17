/**
 * Hell oder dunkel entscheidet der Rahmen, in dem die App läuft, nie die App selbst.
 * Teams meldet sein Design als Text ('default', 'dark', 'contrast'), SharePoint über `isInverted` am Theme
 * (dunkler Abschnitts- oder Seitenhintergrund). Meldet Teams etwas, gilt Teams.
 */
export function hostIsDark(inverted: boolean | undefined, teamsTheme?: string): boolean {
  if (teamsTheme) return teamsTheme !== 'default';
  return inverted === true;
}

/** Schreibt das Ergebnis als `data-dark` an das Wurzelelement. Das Stylesheet schaltet darüber alle Farbrollen um. */
export function applyHostTheme(root: HTMLElement, inverted: boolean | undefined, teamsTheme?: string): void {
  root.dataset.dark = String(hostIsDark(inverted, teamsTheme));
}
