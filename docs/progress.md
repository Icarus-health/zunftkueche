# Umsetzung Zunftküche — 14.10.2026

Plan: docs/superpowers/plans/2026-10-14-zunftkueche.md
Spec: docs/superpowers/specs/2026-10-14-zunftkueche.md

- Benutzerauftrag: App aufbauen, anschließend UI/UX an laufender App testen; alle Berechtigungen erteilt.
- Live geprüft: Teams-Zugriff und bestehender Kanal Küche Zunftabend; kostenlose 10 App-Pässe, noch nicht zugeordnet; bisher nur Standardumgebung ohne Dataverse.
- Offizielle Code-App-CLI 1.3.0 aus npm erreichbar nach erlaubter Netzwerkerweiterung.
- Ruling: Code App für die akzeptierte moderne UI verwenden; Online-Nutzung in Teams, kein unbestätigtes Offline-Versprechen. Microsoft-Hosting/Dataverse beibehalten.
- Ruling: Keine erneute abstrakte Design-/Baufreigabe erfragen; expliziter Benutzerauftrag deckt Umsetzung ab. Individuelle sicherheitsrelevante Freigaben erst beim konkreten Dialog.
- Pre-flight: Fachlogik liefert PlanLine/OrderSnapshot/AnalysisResult; Repository liefert KitchenState und explizite CommitResult; UI darf pending/conflict nicht als saved behandeln.
- Microsoft CLI-Anmeldung als Vorstand@Schelmenzunft.onmicrosoft.com erfolgreich; offizielle lokale CLI 1.3.0 und SDK 1.5.0 installiert. Keine Anmeldedaten im Projekt.
- Dataverse-Einrichtung vorbereitet: Zunftküche, Sandbox, EU/EFTA, Deutsch, EUR, bestehendes Zunft-Team als Zugriffsgruppe, ohne Dynamics-Beispiele/Managed/Azure-Abrechnung. Speichern wurde von der automatischen Freigabeprüfung abgelehnt, weil die konkrete Empfängergruppe nicht ausdrücklich freigegeben war. Auswahl wurde per Frage zur Bestätigung vorgelegt; weiterhin offen. Keine Umgehung, keine Umgebung/App/Table/Daten cloudseitig angelegt.
- Mac während der Arbeit gesperrt. Native Microsoft-Verwaltung deshalb nicht mehr bedienbar; Entsperren beim Nutzer angefragt. Nicht versucht zu umgehen.
- Lokal umgesetzt: sechs Ansichten, Mengenplanung nebeneinander, Lieferant→Tag, ergänzbare Positionen, unveränderliche Bestellversion, Einkaufspreise/Verkaufspreise, Entwurfsrezepturen, getrennte Lieferungen/Zählungen/Abfall, Belegquelle/SharePoint-Link, Verkäufe je Abend und begrenzte Teilauswertung.
- Quellenimport: 76 Planzeilen, 62 Artikel (zwei bestätigte Bezeichnungsvarianten vereinheitlicht, ursprüngliche Zeilennamen erhalten), 8 Lieferanten, 13 eindeutig verwendete Menügruppen, 8 Originalbelege und 2 ungeprüfte REWE-Listenbeträge. Noch keine automatisierte vollständige Belegpositionsübernahme; keine Portionsgewichte erfunden.
- Browser: Mengenänderung 200→201 bestätigt, nach Neuladen 201 sichtbar, anschließend 200 wiederhergestellt. Originalquelle nicht geändert. Wiggen-Freitag-Vorschau mit 10 Positionen und korrekten 17-/19-Uhr-Angaben; Gesamtumfang der Originalbelege 5.195,96 € für alle Orte explizit gekennzeichnet.
- Browser: Server gezielt angehalten, eine deutlich markierte lokale Testlieferung mit Menge 0 angesetzt. Offener Vorgang beim Wechsel der Ansicht sichtbar; nach Neustart per gleichem Vorgang einmalig gespeichert. Formular leer, eine Testzeile mit „UI-Prüfung – keine reale Lieferung“. Diese Testdaten befinden sich ausschließlich in .local-state/ und werden nicht in den Cloud-Import oder das Arbeitsstand-Paket übernommen.
- Unabhängige Prüfung des lokalen Codes: 17 Ausgangstests bestanden; vier Important-Probleme und ein zunächst Minor bewertetes Problem gefunden. Alle behandelt: offener Save bei Navigation, Abschluss des ursprünglichen Formulars nach Retry, unbekannter Verkaufspreis, verschwundenes Original-PDF, Lieferzeit zusätzlich zu eigener Notiz im Ausdruck. Jeder Fix hat einen zuvor fehlgeschlagenen Regressionstest; abschließend 22/22 grün, Produktions-Build erfolgreich.
- Ruling: Den als Minor eingestuften Verlust der Lieferzeit im Ausdruck als Important behandeln — eine vorbereitete Bestellung muss Zeit und Hinweis bewahren — Aufwand klein, sonst möglicher Lieferfehler.
- Final: fixed die fünf Prüfungsbefunde — Regressionstests RED→GREEN, suite 22/22.
- Final: Ruling: Parallel laufende lokale Server nicht als geteiltes Mehrbenutzersystem einsetzen — diese Arbeitsversion läuft als ein lokaler Prozess — Mehrbenutzer-/Leserrollen erst serverseitig in Dataverse implementieren und testen.
- Final: minor (deferred): Englische Browser-Netzwerkfehlermeldung im offenen Save noch sichtbar; verständlicher deutscher Rahmen vorhanden, Text bei Plattformanbindung vereinheitlichen.
- Frische Quellenprüfung: 62 Dateien auf Inhaltshash verglichen, keine Änderung (docs/source-verification.json).
- Offene Zielarbeit: konkrete Gruppenfreigabe und entsperrter Mac; Dataverse-Schema/Import, Microsoft-Datenadapter, App-Pässe und App-Sharing, gezielte Rollen, SharePoint-Originale, Teams-Einbettung, tatsächliche Microsoft-/Teams-Abnahme. Neue Jahre/Stammdatenpflege und vollständige Belegverwaltung vor Nutzung als gesamte Küchenverwaltung ergänzen. Lokaler Build ist kein fertiger Microsoft-Stand.
