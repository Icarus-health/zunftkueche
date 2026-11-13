# Zunftküche: Dashboard, Artikelliste und Lieferantenprofil

## Ziel und Rahmen

Die vorhandene Teams-/SharePoint-App erhält eine klarere Übersicht, eine kompakte Artikelliste und ein einfaches Lieferantenprofil. Große Klickflächen, verständliche Beschriftungen, Zunft-CI und die Nutzung auf schmalen Bildschirmen bleiben wichtig. Es werden keine zusätzlichen kostenpflichtigen Dienste eingeführt.

## Gestaltungsansatz

Die Übersicht zeigt auf einen Blick die Zahl der Bestellentwürfe, erwarteten Lieferungen, gemeldeten Nachbestellungen und tatsächlich gezählten Artikel. Daneben stehen konkrete nächste Schritte; leere Werte werden als solche erklärt. Bestandsmeldungen bleiben Beobachtungen zu einem Zeitpunkt und werden nicht als aktueller Livebestand ausgegeben.

Die Artikelseite zeigt eine durchsuchbare, kompakte Liste mit Artikelname, Kategorie, Zähleinheit und Lieferangeboten. Lieferanten, Gebinde und Preisstatus sind erkennbar; die zugehörigen Bearbeitungsaktionen bleiben erreichbar. Auch bei mehreren Lieferangeboten und auf kleinen Displays bleibt die Zuordnung eindeutig.

Die Lieferantenseite zeigt eine kompakte Liste und pro Lieferant ein Profil mit Name, Ansprechpartner, Adresse, Telefon, E-Mail, bevorzugtem Bestellweg, Kundennummer und Notizen. Bestehende Lieferanten und ihre Hinweisfelder bleiben unverändert erhalten. Bereits in Freitext vorhandene Angaben werden nicht automatisch als bestätigte Adressen oder Kontakte interpretiert; sie können bewusst in die neuen Felder übernommen werden.

## Technische Entscheidung und Sicherheit

Erweiterung der vorhandenen SPFx-App und SharePoint-Speicherung ohne neue Plattform. Neue optionale Profilfelder werden abwärtsverträglich gelesen. Ein Datenschema-Schutz muss verhindern, dass ältere geöffnete Appversionen neue Profilfelder beim Speichern stillschweigend verlieren. Bestand, Artikel, Lieferangebote, Bestellungen und bestehende IDs bleiben erhalten. Keine automatische Datenmigration oder Löschung.

## Prüfung und Veröffentlichung

Zuerst lokal mit künstlichen Daten prüfen: Dashboardwerte und leere Zustände, Suche und Angebotszuordnung in der Artikelliste, Neuanlage und Bearbeitung von Lieferantenprofilen einschließlich Altdaten und Konfliktschutz. Darstellung auf breitem und schmalem Bildschirm prüfen. Anschließend bestehende Teams-App aktualisieren und das Laden im Kanal Küche getrennt von lokalen Tests nachweisen.
