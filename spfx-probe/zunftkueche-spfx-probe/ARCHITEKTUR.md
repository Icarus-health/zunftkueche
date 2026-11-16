# Zunftküche: Aufbau des Codes (Stand 1.22.1)

Für alle, die die App später pflegen. Kurz: Daten und Rechenregeln sind von der Oberfläche getrennt, jede Oberfläche hat ihr eigenes Modul, und für fast jede Regel gibt es einen Test.

## Wo liegt was

| Ordner / Datei | Inhalt |
|---|---|
| `src/webparts/kitchen/KitchenWebPart.ts` | Einstieg in SharePoint. Startet `KitchenView`. |
| `src/webparts/kitchen/KitchenWebPart.module.scss` | Gesamtes Aussehen. Schrift Archivo und Logo liegen in `assets/`. |
| `src/kitchen/model.ts` | Datentypen und die Liste der Bereiche (`AREAS`: Küche, Zunftscheuer, Marktplatz). Neue Bereiche nur hier ergänzen. |
| `src/kitchen/domain.ts`, `operations.ts` | Prüfregeln und Rechnungen für Stammdaten, Bestellungen, Zählungen, Wareneingang. |
| `src/kitchen/sharepoint.ts` | Lesen und Schreiben der SharePoint-Listen (`ZK_V1_…`). Jeder Datensatz ist JSON in einer Listenzeile. |
| `src/kitchen/view.ts` | Rahmen der App: Laden, Zeichnen, Navigation, Zurück-Geste, Fokus, Speichern-Ablauf. |
| `src/kitchen/actions/` | Was beim Tippen auf eine Schaltfläche passiert, je Bereich eine Datei: `order-actions`, `overview-actions`, `menu-actions`, `receipt-actions`, `count-actions`, `master-actions`, `import-actions`, `ui-actions`. |
| `src/kitchen/home.ts`, `workspace.ts`, `operation-forms.ts`, `order-sheet.ts`, `supplier-forms.ts` | Bildschirme als HTML-Bausteine (Übersicht, Bestand, Abendabschluss, Warenannahme, Bestellblatt). |
| `src/kitchen/fasnet-report.ts` | Auswertung der ganzen Saison über alle Bereiche. |
| `src/kitchen/order-overview.ts` | Gesamtbestellung: alle Lieferanten nach Liefertag, Prüfhinweise, Liefertermine der Entwürfe, Lieferplan als PDF. |
| `src/kitchen/menu-card.ts`, `menu-export.ts`, `menu-header.ts`, `menu-drag.ts` | Karte für den Zunftabend: Auswahl aus Rezepten, Reihenfolge per Ziehen (Zeigerereignisse, auch Touch) oder Pfeilen, Word- und PDF-Ausgabe im Aufbau der Druckvorlage, Kopfbild mit Jahr. Bild und Schrift in `menu-assets/`. |
| `src/kitchen/zip.ts` | ZIP ohne Kompression für die Word-Datei. |
| `src/kitchen/pdf-document.ts` | Kleiner PDF-Baukasten mit Helvetica, schräg, JPEG-Bild und Zeichenbreiten. Genutzt für Bestellung, Abendabschluss auf Papier, Lieferplan und Karte. |
| `src/kitchen/ww/` | Warenwirtschaft: Rezepte, Planung, Einkauf aus Planung, Rechnungen, Kassendaten, Bewegungen, Auswertung je Bereich. Eigener Controller mit Host-Schnittstelle. |
| `src/kitchen/imports/` | Lesen von PDF (auch Scans per Texterkennung), CSV und Excel. |
| `tests/` | Rund 390 Tests mit Node und jsdom. `tests/preview-server.mjs` startet eine lokale Vorschau mit künstlichen Daten. |

## Regeln, die den Code sauber halten

- Eine Schaltfläche trägt `data-action`. Die Ansicht reicht die Aktion der Reihe nach an die Module in `actions/` weiter. Neue Aktionen gehören in das Modul ihres Bereichs.
- Aktionsfunktionen bekommen als ersten Parameter `app` (die Ansicht). Sie lesen und ändern nur deren Zustand und rufen deren Dienste (`render`, `run`, `paintStatus`).
- Bildschirm-Bausteine sind reine Funktionen: Daten rein, HTML-Text raus. Alle Werte gehen durch `h()` (Escaping).
- Prüfregeln stehen in `domain.ts`, `operations.ts` oder `ww/domain.ts`, nie nur in der Oberfläche.
- Formatierung: `npx prettier --write "src/**/*.{ts,scss}"`. Regeln in `.prettierrc.json`.

## Prüfen und bauen

```sh
npm run test:probe   # alle Tests
npm run build        # Tests, Build und Paket sharepoint/solution/zunftkueche-spfx-probe.sppkg
```

Version steht in `package.json` und `config/package-solution.json`; `scripts/sync-version.mjs` überträgt sie in die App.

## Hochladen

SharePoint Admin Center → Weitere Features → Apps → Apps verwalten → Hochladen. Datei als `Zunftkueche-SPFx-Test-1.0.0.sppkg` hochladen, „Ersetzen“, dann „Aktivieren“. Danach steht die neue Version unten links in der App.
