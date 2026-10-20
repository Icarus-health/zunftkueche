# Aktueller Projektstand

Stand: 20. Oktober 2026. **Der Küchen-Kern läuft jetzt in der bestehenden Microsoft-App.** Entwicklungszweig: `feat/microsoft-release-pipeline`, PR #1. Pipeline und zusätzliche Funktionen sind auf Nutzerwunsch zurückgestellt; keine weiteren Agenten-/Prüfrunden.

## Tatsächlich veröffentlicht und geprüft

- Vorhandenes Dataverse-Serverpaket aktualisiert und anschließend seine tatsächlichen Paketbytes nachgelesen. Neues Paket: 319458 Bytes, SHA256 `4d7c3224a37d89df61911996d0a5762df5617c7bb20907f7262ffb0e55b8666b`. Vorheriges Paket und Rohdaten lokal erhalten.
- Direkter echter Protokoll-2-Ladeaufruf mit Vorstand erfolgreich. Beim Paketwechsel blieben Arbeitsdaten und die drei damaligen Vorgangsbelege unverändert.
- Passende vorhandene Oberfläche mit der offiziellen CLI in derselben Code App veröffentlicht. CLI meldete Erfolg; die tatsächliche Microsoft-Laufzeit `bfec495ec223417689a83e4d631337ae20261020t113432z37ec2868cc` wurde im Browser geladen.
- Tatsächlicher Browserbetrieb als **Schreiber@Schelmenzunft.onmicrosoft.com** geprüft: Startseite mit vorhandenen Daten, Stammdaten und Einstellungen geladen. Vorhandenen Lieferanten ohne Änderung der angezeigten Werte gespeichert; die App bestätigte „Gespeichert“. Anschließend Browserreload, frische App geladen und Lieferant erneut sichtbar. Kein Testbeleg und keine erfundenen Verkaufsmengen angelegt. Die normale Speicher-Prüfspur bleibt erhalten.
- Startseite im integrierten Browser für den Nutzer offen gelassen. Keine neuen Konten, Rollen, Tabellen, Lizenzen, Abos oder Hostingdienste eingerichtet.

[App öffnen](https://apps.powerapps.com/play/e/5684204c-3254-ec15-93f4-276ec50cc65b/app/bfec495e-c223-4176-89a8-3e4d631337ae?tenantId=1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9). Falls Microsoft eine alte Version zeigt, im Hostbanner **Aktualisieren** wählen.

## Umfang und verbleibende Grenzen

Der veröffentlichte Kern enthält Übersicht, Planung, Bestellungen, Lieferungen/Lager, manuelle Belege, Auswertung, Stammdaten und Einstellungen. Vorhandene 2026-Daten sind enthalten; offene Termine, Rezepturangaben, Verkäufe und Restmengen bleiben fachlich unbestätigt. Die Liveprüfung war ein begrenzter Lade-/Speicher-/Reloadtest, keine vollständige fachliche oder mobile Abnahme aller Abläufe.

Neue Foto-/PDF-Erfassung und finanzielle Entwurfsübernahme bleiben serverseitig ausgeschaltet. OCR/Cloud-KI ist nicht aktiv. Der erweiterte Eigentümer-Sicherungsweg ist weiterhin nicht produktiv gebunden; vollständige Microsoft-Wiederherstellung und tatsächliches iPhone sind nicht abgenommen. Keine Vollständigkeit oder Wiederherstellbarkeit aus diesem Kernrelease ableiten.

**Nächster Schritt:** Nutzer arbeitet mit der laufenden App; konkrete Bedienprobleme gezielt beheben. Pipeline, Belegautomatik und weitere Extras erst anschließend nach neuem Auftrag. Keine alten Inventur-/Deployment-Skripte blind erneut ausführen.

## Releaseweg und Nachweise

Der zunächst versuchte exakte Paket-ETag wurde von Microsoft mit RowVersion-Fehler abgewiesen; das alte Paket blieb nachweislich unverändert. Der alternative bestehende Paketinhalt-Upload ohne atomare Versionssperre wurde zuerst von der automatischen Freigabe blockiert. Der Nutzer hat **genau dieses Paketupdate** danach ausdrücklich bestätigt. Erst darauf erfolgte ein einzelnes Paketupdate mit frischem exaktem Vorhervergleich, erhaltener Paketkopie und anschließendem Byte-/Datenvergleich. Diese Freigabe ist keine allgemeine Erlaubnis für künftige Überschreibungen.

Private Rohantworten, Originale, Paketkopien und Screenshots bleiben lokal. Sichere technische Übergabe: [Release-Runbook](release-runbook.md). Frühere lokale Prüfungen sind in [Kernlaufzeit](validation/2026-10-20-core-runtime.md) und [Releasepfad](validation/2026-10-20-core-release-path.md) dokumentiert; deren damaliges „noch nicht veröffentlicht“ beschreibt den früheren Stand.
