import { APP_VERSION } from './release.ts';
import type { Area, Season } from './model';
import { button, h } from './markup.ts';

/** Settings expose only operations already implemented by the application. */
export function settingsView(season: Season | undefined, area: Area): string {
  const current = season ? `${h(season.name)}${season.archived ? ' · archiviert' : ''}` : 'Noch keine Saison gewählt';
  return `<div class="page-heading"><div><h1>Einstellungen</h1><p>Saison, Einsatztage und Datensicherung.</p></div></div>
 <section class="settings-section"><div class="settings-heading"><h2>Saison und Einsatztage</h2><p>Einmal pflegen. Bestellungen, Portionen und Lieferplan nutzen dieselben Tage.</p></div>
  <div class="settings-row"><div><strong>Aktuelle Saison</strong><p>${current} · ${h(area)}</p></div><div class="actions">${season ? button('season-edit', 'Saison bearbeiten', season.id) : ''}${button('season-new', 'Neue Saison')}</div></div>
  <div class="settings-row"><div><strong>Einsatztage</strong><p>${season?.operatingDays?.map(d => h(d.split('-').reverse().join('.'))).join(', ') || 'Noch keine Einsatztage hinterlegt.'}<br>Bereich und Saison werden für dieses Konto auf diesem Gerät gemerkt. Lagerorte, Einheiten und Ansprechpartner pflegt ihr unter „Saison bearbeiten“.</p></div></div>
 </section>
 <section class="settings-section"><div class="settings-heading"><h2>Datensicherung</h2><p>Eine Kopie der App-Daten und gespeicherten Rechnungsoriginale herunterladen.</p></div>
  <div class="settings-row"><div><strong>Sicherung erstellen</strong><p>Bitte sichern, während niemand Änderungen vornimmt. Neue Kassen- und Menüimporte werden mit Originaldatei gesichert. Bei früheren Importen ohne Originaldatei bitte die Quelldateien separat aufbewahren. Eine Wiederherstellung ist nicht direkt in der App möglich; dafür ist technische Unterstützung erforderlich.</p></div>${button('ww-backup', 'Sicherung herunterladen')}</div>
 </section>
 <section class="settings-section"><div class="settings-heading"><h2>KI-Probe</h2><p>Vor dem Bau des Eingangs: prüfen, ob Foto, Diktat und der Weg zur KI auf diesem Gerät gehen.</p></div>
  <div class="settings-row"><div><strong>Probe auf diesem Gerät</strong><p>Dauert fünf Minuten. Nichts davon wird in SharePoint gespeichert.</p></div>${button('probe-open', 'KI-Probe öffnen')}</div>
 </section>
 <section class="settings-section"><div class="settings-heading"><h2>Hilfe und Informationen</h2><p>Die wichtigsten Arbeitswege und Vereinsangaben.</p></div>
  <div class="settings-row settings-help"><div><strong>So arbeitet ihr mit der App</strong><p>Bestellrunde vorbereiten und PDF selbst beim Lieferanten abgeben. Bei Ankunft tatsächliche Mengen bestätigen. Am Abend Bestand zählen und Hinweise für die nächste Schicht festhalten.</p></div></div>
  <div class="settings-row"><div><strong>Kontakt und Rechtliches</strong><p>Die Datenschutzerklärung bezieht sich auf die Vereinswebsite. Informationen zur Datenverarbeitung dieser App sind gesondert zu prüfen.</p></div><div class="settings-links"><a href="https://schelmenzunft.de/impressum/" target="_blank" rel="noopener noreferrer">Impressum</a><a href="https://schelmenzunft.de/datenschutz/" target="_blank" rel="noopener noreferrer">Datenschutzerklärung der Website</a><a href="mailto:kontakt@schelmenzunft.de">Verein kontaktieren</a></div></div>
  <div class="settings-row"><div><strong>Über Zunftküche</strong><p>Version ${APP_VERSION} · Daten im SharePoint des Vereins. Der Zugriff richtet sich nach den vorhandenen Microsoft-Berechtigungen.</p></div></div>
 </section>`;
}
