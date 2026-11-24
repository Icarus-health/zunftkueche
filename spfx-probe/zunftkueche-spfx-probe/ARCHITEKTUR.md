# Zunftküche: Aufbau des Codes (Stand 1.27.1)

Für alle, die die App später pflegen. Kurz: Daten und Rechenregeln sind von der Oberfläche getrennt, jede Oberfläche hat ihr eigenes Modul, und für fast jede Regel gibt es einen Test.

## Wo liegt was

| Ordner / Datei | Inhalt |
|---|---|
| `src/webparts/kitchen/KitchenWebPart.ts` | Einstieg in SharePoint. Startet `KitchenView` und reicht hell oder dunkel vom Rahmen durch (SharePoint-Theme, im Teams-Tab das Teams-Design). |
| `src/kitchen/host-theme.ts` | Entscheidung hell oder dunkel als reine Funktion, schreibt `data-dark` an das Wurzelelement. |
| `src/webparts/kitchen/KitchenWebPart.module.scss` | Gesamtes Aussehen nach dem Zunft-Standard build-like-apple. Farbrollen hell und dunkel im Kopf, Schlussschicht am Dateiende. Logo in `assets/`, keine eigene Schrift. |
| `src/kitchen/model.ts` | Datentypen und die Liste der Bereiche (`AREAS`: Küche, Zunftscheuer, Marktplatz). Neue Bereiche nur hier ergänzen. |
| `src/kitchen/domain.ts`, `operations.ts` | Prüfregeln und Rechnungen für Stammdaten, Bestellungen, Zählungen, Wareneingang. |
| `src/kitchen/sharepoint.ts` | Lesen und Schreiben der SharePoint-Listen (`ZK_V1_…`). Jeder Datensatz ist JSON in einer Listenzeile. |
| `src/kitchen/view.ts` | Rahmen der App: Laden, Zeichnen, Navigation, Zurück-Geste, Fokus, Speichern-Ablauf. |
| `src/kitchen/actions/` | Was beim Tippen auf eine Schaltfläche passiert, je Bereich eine Datei: `order-actions`, `overview-actions`, `menu-actions`, `receipt-actions`, `count-actions`, `master-actions`, `import-actions`, `ui-actions`. |
| `src/kitchen/home.ts`, `workspace.ts`, `operation-forms.ts`, `order-sheet.ts`, `supplier-forms.ts` | Bildschirme als HTML-Bausteine (Übersicht, Bestand, Abendabschluss, Warenannahme, Bestellblatt). |
| `src/kitchen/fasnet-report.ts` | Auswertung der ganzen Saison über alle Bereiche. |
| `src/kitchen/order-overview.ts` | Bestellungen nach Liefertag: alle Lieferanten, Prüfhinweise, Liefertage der Entwürfe, Lieferplan als PDF. |
| `src/kitchen/markup.ts`, `units.ts` | Kleine Bausteine für alle Bildschirme: Felder, Knöpfe, Umschalter (`segments`), „Mehr“-Menü, Zurück-Link, Beträge (`euro`, `amount2`), Datum (`dateDe`), ausgeschriebene Einheiten (`unitName`). |
| `src/kitchen/menu-card.ts`, `menu-export.ts`, `menu-header.ts`, `menu-drag.ts` | Preiskarte für den Zunftabend: Auswahl aus Rezepten, Reihenfolge per Ziehen (Zeigerereignisse, auch Touch) oder Pfeilen, Word- und PDF-Ausgabe im Aufbau der Druckvorlage, Kopfbild mit Jahr. Bild und Schrift in `menu-assets/`. |
| `src/kitchen/zip.ts` | ZIP ohne Kompression für die Word-Datei. |
| `src/kitchen/pdf-document.ts` | Kleiner PDF-Baukasten mit Helvetica, schräg, JPEG-Bild und Zeichenbreiten. Genutzt für Bestellung, Abendabschluss auf Papier, Lieferplan und Karte. |
| `src/kitchen/ww/` | Warenwirtschaft: Rezepte, Planung, Einkauf aus Planung, Rechnungen, Kassendaten, Bewegungen, Auswertung je Bereich. Eigener Controller mit Host-Schnittstelle. |
| `src/kitchen/ww/delivery-days.ts` | Einsatztage der Saison als Liefertage. Früher angelegte Liefertermine gelten weiter. |
| `src/kitchen/ww/bill-suggest.ts`, `invoice-prices.ts` | Rechnung prüfen: Artikel je Zeile (auch aus früher bestätigten Rechnungen), Lieferant, Preise für die Preisliste. |
| `src/kitchen/imports/` | Lesen von PDF (auch Scans per Texterkennung), CSV und Excel. `bill-proposal.ts` liest Kopf, Summen und Positionen einer Rechnung, `bill-hints.ts` Lieferant, Lieferdatum, Zahlungsziel, Skonto und Bereich. Alles sind Vorschläge: passt eine Summe nicht, bleibt das Feld leer. |
| `src/kitchen/ai/` | KI-Baustein. `provider.ts` spricht mit dem Sprachmodell (Claude direkt oder OpenRouter) und kennt keine Küchendaten. `intake.ts` versteht eine Meldung (Bestand, Nachbestellung), prüft sie gegen die Stammdaten und vergleicht zwei Lesungen. `bill-reader.ts` lässt einen Beleg abschreiben und rechnet ihn nach. `photo.ts` verkleinert Telefonfotos vor dem Senden. |
| `src/kitchen/intake-records.ts`, `actions/intake-actions.ts` | Eingang: aus bestätigten Kartenzeilen werden Bestandsmeldungen und Bestellentwürfe (über die vorhandenen Speicherwege), dazu die Seite „Eingang“ und die Einrichtung für Besitzer. |
| `tools/pruefstand/` | Prüfstand außerhalb der App: eine eigenständige Seite, die Testdiktate und Belege an die echte KI schickt und mit Sollwerten vergleicht. Nicht im Paket. |
| `tests/` | Rund 530 Tests mit Node und jsdom. `tests/preview-server.mjs` startet eine lokale Vorschau mit künstlichen Daten. |

## Aufbau der Oberfläche seit 1.23

Sieben Punkte in der Seitenleiste: Übersicht, Bestellungen, Lieferanten, Speisen & Getränke, Karte, Auswertung, Einstellungen. Unterseiten hängen als Umschalter an ihrem Punkt: Bestellungen (Nach Lieferant, Nach Liefertag, Rechnungen), Lieferanten (Lieferanten, Artikel), Speisen (Rezepte, Portionen), Auswertung (Zahlen, Bestand). Jede Seite hat einen Hauptknopf, Seltenes steht unter „Mehr“.

Stammdaten: ein Preis je Artikel und Lieferant. Preisänderungen entstehen als Preisliste mit Datum (im Profil des Lieferanten unter „Preise ändern“ oder beim Bestätigen einer Rechnung). Alte Bestellungen behalten ihre Preise.

## Bedienung seit 1.26

- **Zurück**: jede Unterseite hat oben links ein Zurück mit dem Namen der Seite, von der man kam. Das setzt `placeBack()` in `view.ts` zentral; einzelne Seiten bauen keinen eigenen Rückweg mehr. Hauptseiten (Reiter der Navigation, Seiten mit Umschalter) haben keines.
- Zurück verwirft nichts stillschweigend: bei offenen Eingaben fragt `askLeave()` mit einem Dialog („Weiter bearbeiten“ / „Verwerfen“). Nach der Rückkehr steht man wieder dort, wo man die Unterseite geöffnet hat (`places`, `returnTo()`): Abschnitt offen, Fokus auf dem Knopf.
- **Lieferanten zusammenlegen**: `supplier-merge.ts` rechnet aus, was geschieht (`planMerge`, ändert nichts), `actions/merge-actions.ts` zeigt die Vorschau und führt aus. Nach vorn Wirkendes wechselt (Artikel mit Gebinde und Preis, Bestellentwürfe, Vorlagen, Bestellschluss), Geschehenes bleibt beim alten Namen (aufgegebene Bestellungen, Rechnungen, frühere Preislisten). Der alte Lieferant wird inaktiv und merkt sich das Ziel (`mergedInto`). Jeder Schritt hat eine feste Kennung: bricht es ab, setzt ein neuer Versuch dort fort.
- **Artikel** stehen nach Kategorie gruppiert, mit Filter. Im Lieferantenprofil ist die Preisliste ebenso sortiert.
- **Rechnungen lesen**: `imports/bill-proposal.ts` bleibt die strenge Erkennung. `imports/bill-loose.ts` greift nur, wenn sie nichts findet (Scans, unübliche Belege): Beschriftung mitten in der Zeile, Nummer in der Folgezeile, zweistelliges Jahr, Beträge mit Punkt, verlorene Kommas. Ein Betrag wird nur übernommen, wenn er sich nachrechnen lässt (Netto × Satz = Steuer, Netto + Steuer = Brutto, Menge × Preis = Betrag, Zeilensumme = Belegsumme). Was errechnet oder aus dem Dateinamen übernommen wurde, steht als Hinweis über dem Formular (`BillProposal.notes`). Neue Regeln immer mit einem Test in `tests/bedienung-1-26.test.mjs` und gegen echte Belege prüfen.
- Rechnungsformular: zwei Wege zum Abschluss, „Rechnung bestätigen“ und „Als Entwurf speichern“. Das versteckte Feld `confirmed` trägt nur den Zustand.

## Eingang seit 1.27 (KI schlägt vor, App prüft, Mensch bestätigt)

Der Eingang nimmt eine diktierte, getippte oder fotografierte Meldung und macht daraus eine Karte zum Bestätigen. In 1.27 kennt er zwei Vorgänge: Bestand melden und Nachbestellen. Alles andere weist er an die vorhandenen Seiten.

- **Ablauf**: `actions/intake-actions.ts` schickt die Meldung zweimal unabhängig an das Modell (`ai/intake.ts`, `readIntake`). `checkIntake()` prüft jede Lesung gegen die Stammdaten, `mergeReadings()` legt beide übereinander. Jede Unsicherheit steht als Satz an der Zeile (`flags`): Artikel mehrdeutig, Einheit nicht genannt, Menge unlesbar, zwei Lesungen uneins, ungewöhnlich große Menge. Markierte Zeilen müssen abgehakt sein, sonst wird nicht gespeichert.
- **Das Modell schreibt nur ab**: Zahlen kommen als Text, den Tag („morgen“, „Samstag“) löst `resolveDay()` in der App auf, Gebinde mal Größe rechnet die App. Text in der Meldung gilt nie als Anweisung.
- **Speichern**: `intake-records.ts` baut aus den bestätigten Zeilen Bestandsmeldungen (`buildCounts`) und Bestellentwürfe je Lieferant und Liefertag (`buildOrders`) und prüft sie mit denselben Regeln wie die übrige App. Gespeichert wird über `saveMaster('counts')` und `saveOrder`. Der Wortlaut der Meldung steht im Hinweis des Datensatzes. Nachbestellungen sind Entwürfe: „aufgegeben“ markiert ein Mensch wie bisher unter Bestellungen.
- **Zugang zur KI**: ein Datensatz in der Liste `ZK_V1_Einstellungen` (`AiSettings` in `sharepoint.ts`). Einrichten können nur Besitzer der Seite (`canManage()`: Websiteadministrator oder Recht „Website verwalten“; der Rahmen meldet es zusätzlich über `managerHint`).
- **Der Schlüssel steht nie lesbar in SharePoint** (seit 1.27.1): `ai/vault.ts` verschlüsselt ihn im Browser mit dem „Kennwort für den Eingang“ (PBKDF2 mit SHA-256 und 600.000 Runden, danach AES-GCM). Gespeichert wird nur der Geheimtext. Wer den Eingang nutzt, gibt das Kennwort einmal je Gerät ein; das Gerät merkt sich den abgeleiteten Arbeitsschlüssel (`LocalState`, Eintrag `ai-unlock`), nie Kennwort oder Schlüssel. Ein neues Kennwort sperrt alle Geräte wieder. Der entschlüsselte Schlüssel lebt nur im Arbeitsspeicher (`aiKey`), wird nie gezeichnet und ist nicht Teil der Datensicherung. Grenze: wer das Kennwort kennt, kann den Schlüssel mit Fachwissen auslesen, weil die App ohne eigenen Server direkt beim Anbieter anfragt. Deshalb gehört ein Ausgabenlimit an den Schlüssel. Ganz verbergen ließe er sich nur mit einem eigenen Dienst, der die Anfragen weiterreicht.
- **Altbestand**: 1.27.0 speicherte den Schlüssel lesbar. `aiSettings()` gibt so einen Datensatz als `legacy` zurück, benutzt ihn nicht und überschreibt ihn beim nächsten Speichern. Im Versionsverlauf der Liste bleibt er stehen: der alte Schlüssel muss beim Anbieter gelöscht werden.
- **Anbieter und Modell** gehören zusammen (`modelFits`): bei Claude direkt `claude-haiku-5-5`, bei OpenRouter `anthropic/claude-haiku-5.5`. Beim Wechsel des Anbieters springt der Modellname mit.
- **Weg zum Modell**: `ai/provider.ts`, direkt aus dem Browser. Zwei Anbieter: Claude (`api.anthropic.com`) und OpenRouter (Verarbeitung in Europa nur im Business-Tarif von OpenRouter). Antwort als JSON nach festem Schema. Fehler werden zu Sätzen für die Person am Gerät (`AiError`), die Rohmeldung bleibt in `detail`.
- **Belege und Fotos**: `ai/bill-reader.ts` (Beleg abschreiben, nachrechnen) und `ai/photo.ts` (Foto auf 2.576 Pixel verkleinern) sind gebaut; Rechnung und Lieferschein kommen als nächste Vorgänge in den Eingang.
- **Prüfen gehört nicht in die App**: `tools/pruefstand/` baut eine eigenständige Seite (`node tools/pruefstand/bauen.mjs daten.json ausgabe.html`). Sie nutzt denselben Code wie die App und urteilt je Fall: richtig, richtig mit Rückfrage, abgefangen, falsch ohne Hinweis. Die letzte Zahl muss null sein, bevor ein Paket hinausgeht. Echte Prüfdaten liegen nicht im Repo.

## Aussehen seit 1.25 (Zunft-Design-System, freigegeben 16.11.2026)

- Farben und Schrift kommen aus dem Design-System der Zunft: Nachtblau, Zunftblau, Schiefer, Nebel, Hauch; Montserrat (Light, Regular, Medium) als Hausschrift. Thema Papier hell, Thema Nacht dunkel. Die Schlussschicht „1.25.0 Zunft-Design-System“ am Ende des Stylesheets setzt nur Rollen.
- Montserrat liegt im Paket (`src/kitchen/fonts`, woff2) und wird in `fonts.ts` per FontFace angemeldet. Keine SemiBold/Bold-Schnitte: angefragtes Fett fällt auf Medium, `font-synthesis: none`.
- Bedienregeln aus build-like-apple bleiben (44 px, ein Hauptknopf, Symbole in der Navigation, Statusfarben). Keine Schlagschatten mehr, schwebende Flächen tragen eine feine Linie.
- Wappen: Fassung „Wappen allein, blau“ aus der Gruppe Logos, unverändert; dunkel als weiße Maske.
- Karte: `menu-layout.ts` setzt die Seite einmal (pt, A4). Daraus zeichnen `menu-export.ts` das PDF (Montserrat als TrueType eingebettet, Breiten in `menu-font-metrics.ts`) und `menu-preview.ts` die Live-Vorschau als SVG. Word baut dieselbe Optik als Tabelle und bettet die Schriften verschleiert ein (ECMA-376 17.8.1). Schriften für PDF/Word: `menu-assets/montserrat-*.ttf`, auf WinAnsi beschnitten.
- Vorschau: am Rechner ab 1100 px rechts neben dem Editor, darunter über den Knopf „Vorschau“. Editorzeilen werden über eine Container-Abfrage zweizeilig, sobald die Spalte schmal wird.

## Aussehen seit 1.24 (Zunft-Standard build-like-apple)

- Schrift ist die System-Schrift (`-apple-system`, auf Windows Segoe UI). Textstile: Seitentitel 28 fett, Abschnitt 20, Zwischentitel 17, Fließtext 16, Listen 15 oder 14, Nebentext 13. Fett ist nur der Seitentitel, sonst höchstens 600.
- Farben stehen nur als Rollen im Kopf des Stylesheets (`--bg`, `--surface`, `--ink`, `--dim`, `--line`, `--fill…`, `--action…`), einmal hell und einmal im Block `.kitchen[data-dark='true']`. Im Bauteil steht nie ein fester Farbwert. Ein Test prüft das. Akzent ist das Blau aus dem Zunftlogo.
- Hell oder dunkel bestimmt der Rahmen, die App hat keinen eigenen Schalter. In der lokalen Vorschau schaltet `?dark=1` um.
- Knöpfe sind Kapseln, 44 px hoch. Je Seite eine gefüllte Hauptaktion (`primary`), betonte Aktionen in einem Abschnitt getönt (`button(…, 'tinted')`), der Rest grau mit Akzentschrift. „Entfernen“ ist rot und ohne Fläche.
- Listen sind weiße Gruppen (Radius 14) auf grauem Grund mit eingerückten Haarlinien, Karten und Formulare Radius 20, Felder Radius 10. Abstände im 4er-Raster.
- Leere Listen nennen den nächsten Schritt als Knopf (`emptyAction`). Beim Laden stehen Platzhalterzeilen.
- Bewegung ist kurz und schaltet sich mit „Bewegung reduzieren“ ab.
- Symbole (`icons.ts`): eigene SVGs im 24er-Raster, Strich 1,8 mit runden Enden, Punkte als gefüllte Kreise. Keine SF Symbols (Lizenz nur für Apple-Plattformen), kein Überschreiben der Strichstärke im Stylesheet.
- Menüeinträge, nach denen noch eine Eingabe folgt, enden mit „ …“ (geschütztes Leerzeichen).
- Während gespeichert wird, trägt der auslösende Knopf `aria-busy` und zeigt einen Spinner.

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
