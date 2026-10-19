import { useState } from 'react';
import { selectOriginalFiles } from '../data/backup.ts';
import type { OriginalBackup } from '../data/backup.ts';
import type { KitchenState } from '../domain/state.ts';

export function BackupPanel({ state, busy, canConfigure, canClose, onBackup }: {
  state: KitchenState;
  busy: boolean;
  canConfigure: boolean;
  canClose: boolean;
  onBackup: (originals: OriginalBackup[]) => Promise<string[]>;
}) {
  const [originals, setOriginals] = useState<OriginalBackup[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  async function select(files: File[]) {
    setWorking(true);
    try {
      setOriginals(await selectOriginalFiles(state, files));
      setMessage('Passende Originale ausgewählt.');
    } catch (error) {
      setOriginals([]);
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function download() {
    setWorking(true);
    setMessage('');
    try {
      const missing = await onBackup(originals);
      setMessage(missing.length
        ? `Unvollständige Sicherung heruntergeladen. ${missing.length} fehlende Nachweise sind in der Datei vermerkt.`
        : 'Sicherung im angegebenen Quellumfang heruntergeladen; genaue Quellen und Originalnachweise stehen in der Sicherungsdatei.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return <section className="panel">
    <h2>Datensicherung</h2>
    <p>CSV und Druckdateien sind Auswertungen. Die Sicherung liest den vollständigen Arbeitsbereich und seine Wiederholungsbelege mit Eigentümerprüfung.</p>
    <p>Wählen Sie historische Originaldateien auf diesem Gerät aus; nur exakt passende Dateihashes werden übernommen. Die Dateien werden nicht hochgeladen.</p>
    <p>Die aktuelle Microsoft-Quelle muss auch Dokumente, Prüfentwürfe und ihre Verläufe liefern. Verknüpfte Originale werden frisch gelesen und per Hash/Version geprüft. Unbestätigte Uploads, fehlende Quellen oder Originale halten die Sicherung unvollständig.</p>
    {canConfigure && canClose ? <>
      <label>Originaldateien für die Sicherung<input type="file" multiple disabled={busy || working}
        onChange={event => { void select(Array.from(event.target.files ?? [])); }} />{originals.length} passende Originale</label>
      <button className="button secondary" disabled={busy || working} onClick={download}>Datensicherung erstellen</button>
    </> : <p>Datensicherung benötigt bestätigte Eigentümerrechte.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
