# Küchenzugriff für Schreiber

Der Helfer `server/Access` ist ausschließlich für `Schreiber@Schelmenzunft.onmicrosoft.com` in der bestehenden Zunftküchen-Umgebung bestimmt. Er verwendet die geprüfte administrative Anmeldung als Vorstand. Er erstellt keinen Benutzer und übernimmt weder App-Freigabe noch Teams-Richtlinie, Lizenzierung oder Plattform-Basisrolle.

Das ursprüngliche Sechs-Rechte-Profil für **Zunftküche Bearbeiter** verlangt genau:

| Tabelle | Privilegien | Tiefe |
| --- | --- | --- |
| `zk_kitchenworkspace` | Read, Write, AppendTo | Basic |
| `zk_kitchenoperation` | Read, Create, Append | Global |

Die direkte Freigabe betrifft ausschließlich Workspace `45deaf94-5661-4110-8f16-3d2678c09f04` mit ReadAccess, WriteAccess und AppendToAccess. Eigentümer bleibt Vorstand. Der Helfer liest keine Zustandsinhalte und führt keine Küchen-Commits aus. Er prüft Eigentümer und Revision (mindestens 2, innerhalb des Laufs unverändert) vor und nach Freigabeschritten.

## Aufruf

Im Repository mit dem vorhandenen .NET-10-SDK bauen; vorher unabhängig geprüften Commit verwenden:

```sh
DOTNET_CLI_HOME=../dotnet-home ../dotnet10/dotnet restore server/Access/Tests --locked-mode
DOTNET_CLI_HOME=../dotnet-home ../dotnet10/dotnet build server/Access/Tests --no-restore --disable-build-servers -p:UseSharedCompilation=false -m:1
DOTNET_CLI_HOME=../dotnet-home ../dotnet10/dotnet server/Access/Tests/bin/Debug/net10.0/Kitchen.Access.Tests.dll
```

Ohne Argumente: ausschließlich lokaler Plan, keine Anmeldung oder Provideraufrufe.

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll
```

Nach unabhängiger Prüfung zuerst tatsächlichen Bestand lesen:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --inspect
```

Erst nach Bewertung dieses Ergebnisses freigeben:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --execute
```

Die Anmeldung gibt ausschließlich eine öffentliche `AUTH_URL` aus; Root öffnet diese normal in DuckDuckGo. Kein Browser wird automatisch geöffnet. Tokens bleiben im Arbeitsspeicher. Es gibt keine alternativen Ziel-, Benutzer-, Rollen- oder Privilegienargumente.

## Beobachtete Rolle mit sechs Küchen- und vier zusätzlichen Rechten

Der einmalige Vorbereitungslauf stoppte korrekt: Dataverse behielt nach dem Ersatzversuch vier SharePoint-Privilegien zusätzlich zu den sechs Küchenrechten. Unabhängiges Nachlesen bestätigte zehn Rechte; Schreiber hatte weiterhin keine Rolle, effektiven Privilegien oder Workspace-Freigabe. **Keine weiteren Remove-/Replace-Versuche ausführen.** Der historische `--prepare-existing-role`-Modus bleibt erhalten, ist für diesen Zehn-Rechte-Zustand aber nicht vorgesehen und verweigert ihn.

Das getrennte beobachtete Profil akzeptiert ausschließlich vorhandene Rolle `660a97b9-a8c8-f111-a05c-7ced8d5f6c91`, den festen Schreiber-Benutzer samt AAD-ID und Geschäftsbereich sowie genau die sechs Küchenrechte plus diese vier Privilegien mit Global-Tiefe, passendem Geschäftsbereich und leerem Datensatzfilter:

| Zusätzliches Privileg | Feste Privileg-ID |
| --- | --- |
| `prvReadSharePointData` | `fecbd29c-df64-4ede-a611-47226b402c22` |
| `prvWriteSharePointData` | `cfdd12cf-090b-4599-8302-771962d2350a` |
| `prvCreateSharePointData` | `5eb85025-363b-46ea-a77e-ce24159cd231` |
| `prvReadSharePointDocument` | `d71fc8d0-99bc-430e-abd7-d95c64f11e9c` |

Diese vier Rechte sind keine belegte Pflichtbasis und nicht auf einen Küchenordner beschränkt. Die Genehmigung dieses Profils gilt nur bei nachgewiesen fehlender Dokumentdienst-Konfiguration in dieser Umgebung. Vor jeder Mutation und beim Nachlesen werden drei feste GET-Abfragen auf `sharepointmanagedidentities`, `sharepointsites` und `sharepointdocumentlocations` mit jeweils `$top=1` ausgeführt. Jeder Treffer, Providerfehler, fehlende/unklare Ergebnisliste oder Pagination stoppt. Die Ausgabe enthält nur die drei bestätigten Nullbestände, keine Konfigurationsinhalte oder URLs. Microsoft dokumentiert die zusätzliche [Managed-Identity-Konfiguration für SharePoint-Dokumentzugriff außerhalb des Dokumentrasters](https://learn.microsoft.com/en-us/power-platform/admin/configure-azure-app-with-sharepoint-access).

Nach unabhängigem Code-Review muss Root **zuerst ausschließlich prüfen**:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --inspect-observed-role
```

Nur wenn der Lauf die exakte Zehn-Rechte-Rolle und alle drei leeren Konfigurationsbestände bestätigt, ist der getrennte Ausführungsschritt vorgesehen:

```sh
../dotnet10/dotnet server/Access/bin/Debug/net10.0/Kitchen.Access.dll --execute-observed-role
```

Dieser Pfad erstellt keine Rolle und verändert keine Privilegien. Er kann höchstens zweimal schreiben: die feste Rolle ausschließlich Schreiber zuweisen und den bestehenden Workspace mit Read/Write/AppendTo freigeben. Bereits exakt vorhandene Schritte werden nur geprüft. Zulässig sind keine Teamrollen und direkt entweder keine Rolle oder genau diese eine Rolle; die effektiven Privilegien müssen entsprechend leer oder exakt diese zehn IDs sein. Eigentümer Vorstand und Revision ab 2 bleiben während des Laufs unverändert. Jede unklare Schreibantwort wird unabhängig zurückgelesen, niemals wiederholt. Das normale `--execute` bleibt beim Sechs-Rechte-Vertrag und akzeptiert die beobachtete Zehn-Rechte-Rolle nicht.

Es werden keine SharePoint-ACLs, Gruppen, Sites, Locations, Integrationsidentitäten, App-Registrierungen oder Zustimmungen geändert. Abwesenheitsprüfungen sind Momentaufnahmen, keine atomare Sperre gegen externe Administratoren. Wenn ein konfigurierter Pfad gefunden wird, erfolgen keine weiteren Grants; vor einer abweichenden Freigabe ist eine neue Nutzerentscheidung erforderlich. Falls Konfiguration erst nach einer Zuweisung entsteht, stoppt der Helfer ohne weitere Freigabe und ohne automatischen Entzug. Root muss Teilzustand und Risiko prüfen. Auch ein erfolgreicher Abschluss ersetzt weder SharePoint-Sicherheitsbewertung noch tatsächliche Schreiber-App-Abnahme.

## Verhalten und Grenzen des ursprünglichen Ausführungsmodus

- Identität, Geschäftsbereich, vorhandene direkte Rollen und Teamrollen, deren tatsächliche Privilegientiefen sowie effektiver Recordzugriff werden vor jeder ersten Mutation gelesen. API-Ausführungsprivilegien werden mit tatsächlichen Read-/Write-Privilegien aus Tabellenmetadaten verglichen.
- Eine vorhandene passende Rolle muss bereits exakt sechs Rechte enthalten. Eine leere oder abweichende vorhandene Rolle wird nicht verändert. Eine neu angelegte Rolle muss zuerst leer zurückgelesen werden; unerwartete Plattform-Standardprivilegien führen zum Stopp und erfordern eine neue Bewertung.
- Höchstens vier additive POSTs: Rolle erstellen, sechs Privilegien hinzufügen, nur Schreiber zuordnen, nur Workspace freigeben. Jeder Schritt wird unabhängig zurückgelesen. Ein Fehler führt niemals zu einem automatischen Retry. Ein unklarer Schreibausgang wird ausschließlich durch passenden Readback bestätigt; sonst Stopp.
- Bestehende Rollen werden weder entfernt noch verändert. Bereits vorhandene weitergehende Küchenrechte oder Workspace-Rechte führen zum Stopp. Andere bestehende Plattformrechte bleiben bestehen; die Ausgabe behauptet keine vollständige Least-Privilege-Zertifizierung des Benutzers.
- Ein leerer Rollenbestand beweist nicht, dass die App bereits startbar ist. **App Opener** bleibt eine getrennte, gegebenenfalls notwendige Plattformentscheidung: tatsächliche vorhandene Rolle und ihre Rechte prüfen, bevor Root sie separat zuweist. Der Helfer kopiert keine Basisrolle und gewährt keine App-Maker-, Administrations- oder Bypass-Rechte.
- Ein positiver Abschluss bestätigt die sechs Rollenprivilegien, Zuweisung und effektiven Workspace-Zugriff. Er ersetzt keine echte App-Prüfung unter Schreiber. Insbesondere `Load(canWrite=true)` und eine vereinbarte Bearbeitung mit korrektem Receipt-Akteur sind separat zu bestätigen.
- Es gibt keine rollenübergreifende atomare Transaktion oder CAS-Zusage. Root führt den Lauf in einem kontrollierten Fenster ohne gleichzeitige Rollenverwaltung aus. Bei einem Teilabschluss bleiben bestätigte additive Änderungen bestehen; es wird nichts zurückgerollt oder gelöscht. Insbesondere eine nach Stopp vorhandene unvollständige Rolle wird im nächsten Lauf nicht automatisch vervollständigt.

Offizielle API-Grundlagen: [AddPrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addprivilegesrole), [RetrieveRolePrivilegesRole](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveroleprivilegesrole), [RolePrivilege](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/roleprivilege), [GrantAccess](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/grantaccess), [RetrievePrincipalAccess](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveprincipalaccess), [RetrieveUserPrivileges und Einschränkung der Team-Tiefen](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveuserprivileges), [Rollen und App Opener](https://learn.microsoft.com/en-us/power-platform/admin/security-roles-privileges).
