# Umsetzung Zunftküche — 14.10.2026

Plan: docs/superpowers/plans/2026-10-14-zunftkueche.md
Spec: docs/superpowers/specs/2026-10-14-zunftkueche.md

- Benutzerauftrag: App aufbauen, anschließend UI/UX an laufender App testen; alle Berechtigungen erteilt.
- Live geprüft: Teams-Zugriff und bestehender Kanal Küche Zunftabend; kostenlose 10 App-Pässe, noch nicht zugeordnet; bisher nur Standardumgebung ohne Dataverse.
- Offizielle Code-App-CLI 1.3.0 aus npm erreichbar nach erlaubter Netzwerkerweiterung.
- Ruling: Code App für die akzeptierte moderne UI verwenden; Online-Nutzung in Teams, kein unbestätigtes Offline-Versprechen. Microsoft-Hosting/Dataverse beibehalten.
- Ruling: Keine erneute abstrakte Design-/Baufreigabe erfragen; expliziter Benutzerauftrag deckt Umsetzung ab. Individuelle sicherheitsrelevante Freigaben erst beim konkreten Dialog.
- Pre-flight: Fachlogik liefert PlanLine/OrderSnapshot/AnalysisResult; Repository liefert KitchenState und explizite CommitResult; UI darf pending/conflict nicht als saved behandeln.
- Nächster Schritt: Dataverse-Umgebung erstellen, CLI installieren und anmelden. Noch keine App/Table/Daten cloudseitig angelegt.
