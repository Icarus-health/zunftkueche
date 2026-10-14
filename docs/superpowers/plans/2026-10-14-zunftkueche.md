# Zunftküche Implementation Plan

> Ausführung: superpowers:executing-plans; im bestehenden Chat selbst umsetzen. Der Nutzer hat den Aufbau bereits beauftragt.

**Goal:** Eine echte Küchen-App mit persistierten Daten in Microsoft und Einstieg in Teams erstellen.

**Architecture:** Power Apps Code App mit React; Dataverse als geschützte Datenquelle, SharePoint-Beleglinks. Gemeinsame Fachlogik für Mengen, Bestellversionen, Rezepturen und Auswertung; Datenimport außerhalb des öffentlichen Builds.

**Tech Stack:** Offizielle Microsoft Power Apps CLI/SDK, React, TypeScript, Vite; Node-Testlauf für Fachlogik.

**Spec:** ../specs/2026-10-14-zunftkueche.md

## Global Constraints
- Keine zusätzliche kostenpflichtige Subscription oder Azure-Abrechnung.
- Fehlender Wert ist null, niemals automatisch 0.
- Bestellmenge ist keine Lieferung und kein Verkauf.
- Keine hardcodierten privaten Originaldaten in öffentlich abrufbaren App-Assets.
- Keine Originaldatei löschen oder ändern.
- Kein automatischer Versand an Lieferanten.

## Review Focus
- Deutsches Dezimalkomma: „2,5“ korrekt; mehrdeutige Schreibweisen zurückweisen.
- Fehlende Rechnung/Portionsgröße: Ergebnis als offen statt als 0/gesichert anzeigen.
- Wiederholtes Speichern nach Verbindungsabbruch: keine Doppelbuchung.
- Zwei Bearbeiter: parallele Änderungen erkennen.
- Leserrolle: Schreibrechte auf dem Server verweigern, nicht nur Buttons verstecken.

## Dateien und Aufgaben
### 1. Plattform und Datenzugriff
Files: package.json, power.config.json (CLI-generiert), docs/progress.md, schema/, src/data/.
- [ ] Eigene unverwaltete Dataverse-Umgebung EU/EFTA, Deutsch/EUR, keine Beispieldaten, keine Azure-Abrechnung erstellen und im Admin Center überprüfen.
- [ ] Offizielles SDK lokal installieren, legitim anmelden, konkrete Umgebungs-ID verwenden.
- [ ] Dataverse-Struktur mit Herkunft und Versionsschutz erstellen; Administratorzugriff prüfen. Keine vertraulichen Daten in Client-Build.
- [ ] Native Datenquellen verbinden und echte Erstellung/Neuladen prüfen.

Interfaces: Repository.load(): Promise<KitchenState>; Repository.commit(Operation): Promise<CommitResult>; CommitResult = saved | conflict | pending. Authentifizierung über Plattform, keine Token in Quellen.

### 2. Fachlogik und Quellimport
Files: src/domain/{quantities,orders,analysis}.ts; tests/*.test.mjs; import/2026.json (nicht public); scripts/import-2026.*.
- [ ] Tests für null/0, negatives/mehrdeutiges Eingabeformat, 10 Freitagspositionen/2 Zeitgruppen, unveränderliche Bestellversion und unvollständige Kalkulation schreiben; rot ausführen.
- [ ] parseQuantity(raw: string): number|null; prepareOrder(lines: PlanLine[], supplierId: string, day: Day): OrderSnapshot; analyse(state: KitchenState): AnalysisResult implementieren; Tests grün ausführen.
- [ ] Quellenpositionen mit Hash und Zellbezug aus Originalen übernehmen; Fehlpreise und ungeklärte Kalenderdaten null lassen. Importzahlen mit Original vergleichen.

### 3. Funktionale Oberfläche
Files: src/App.tsx, src/screens/, src/components/, src/styles.css.
- [ ] Gemeinsame Navigation und akzeptierten hellen Stil umsetzen; Teams-Rahmen weglassen.
- [ ] Start/Planung/Bestellungen bauen. Mengenänderung, Lieferant→Tag, Zeitgruppen, Vorschau und Bestellversion verbinden.
- [ ] Lieferung/Belege/Verkäufe/Reste/Entwurf-Rezeptur/Auswertung verbinden. Sichtbare Speicher-, Fehler- und Konfliktzustände.
- [ ] Alle Hauptpfade im echten Player benutzen und neuladen; kein Erfolg ohne bestätigte Serverspeicherung.

### 4. Microsoft-Auslieferung und Prüfung
Files: docs/verification.md, design-qa.md, exports/.
- [ ] Build/Testlauf; keine privaten Importdaten im dist-Verzeichnis.
- [ ] App mit vorhandenen App-Pässen bereitstellen; benötigte Anzahl zuweisen, übrige verfügbar lassen.
- [ ] Teams-Einbettung/CSP auf notwendige Ursprünge begrenzen; im bestehenden Küchenkanal integrieren.
- [ ] App im Teams-Kontext mit tatsächlichen Abläufen prüfen, UI/UX-Ergebnisse festhalten und kritische Bedienprobleme korrigieren.
- [ ] Konkreten Live-Status und verbleibende Daten-/Personenlücken berichten. Keine fertige App behaupten, wenn Anmeldung, Dataverse oder Integration nicht tatsächlich funktionieren.
