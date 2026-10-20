# Küchen-Kern: bestehende Releaseprüfungen

Stand: 20. Oktober 2026. Quelle `5984801..f3b00e8`, Aufgabe 2b. Keine privaten Rohdaten oder Zugänge enthalten.

Der bestehende Veröffentlichungsweg unterscheidet ausdrücklich den Küchen-Kern mit fehlenden neuen Belegtabellen von einem Dokumentrelease mit erforderlichen Tabellen. Kernprüfungen behalten Daten, Vorgänge, Rechte, bestehende Schutzregistrierungen, Originalanforderungen und Paket-/Clientidentität bei. Beide neuen Tabellen werden vor und nach der Prüfung nativ auf Abwesenheit kontrolliert. Unbekannte, teilweise oder leere installierte Tabellen erlauben keine Herabstufung.

Die abschließende Beobachtung vergleicht die tatsächliche Serverantwort mit nativ gelesenen Daten, Revisionen, Identitäten, Vorgängen und Paketbytes. Eine reine Bestandsprüfung ist getrennt von der Freigabe einer produktiven Sicherung oder Paketaktivierung. Die entsprechenden produktiven Bindungen und Veröffentlichungseinträge bleiben noch leer.

Gezielte lokale Prüfung: 85 Umfangs-/Server-/Native-Fälle, 53 bestehende Quellen-/Original-/Vorbereitungsfälle und 67 Schema-/Dokumentroutenfälle bestanden, zusammen 205 Fälle. Release- und net462-Build ohne Warnungen/Fehler. Unabhängige Spec-/Qualitätsprüfung freigegeben, keine Befunde. Keine erneute Ausführung bereits abgenommener Clienttests.

Noch offen: konkrete Artefaktbindung, frischer vollständiger Microsoft-Bestandslauf mit Originalsicherung, koordinierter Server-/Clientrelease und tatsächliches Speichern/Neuladen. Synthetische Prüfungen belegen weder Livebetrieb noch iPhone, Microsoft-Wiederherstellung oder vollständige Zugriffsabnahme.
