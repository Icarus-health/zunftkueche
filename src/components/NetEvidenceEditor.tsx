import { useState } from 'react';
import type { ScreenProps } from '../App.tsx';
import { parseMoney } from '../ui/facts.ts';
import { Modal } from './shared.tsx';

export function NetEvidenceEditor({ state, scope, busy, commit, onClose }: ScreenProps & { scope: string; onClose: () => void }) {
  const [revenue, setRevenue] = useState('');
  const [consumption, setConsumption] = useState('');
  const [sourceReason, setSourceReason] = useState('');
  const [valuationReason, setValuationReason] = useState('');
  const [error, setError] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const netRevenueCents = parseMoney(revenue);
      const netConsumptionCents = parseMoney(consumption);
      if (netRevenueCents === null || netConsumptionCents === null) throw new Error('Beide Nettowerte ausdrücklich eintragen.');
      const saved = await commit('event.economics', {
        eventId: state.event.id,
        revision: state.revision,
        scope,
        netRevenueCents,
        netConsumptionCents,
        sourceReason,
        valuationReason,
      });
      if (saved) onClose();
      else setError('Nettogrundlage noch nicht gespeichert.');
    } catch (error) {
      setError((error as Error).message);
    }
  }

  return (
    <Modal title="Nettogrundlage ausdrücklich bestätigen" onClose={onClose}>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <p>{state.event.name} · Umfang {scope} · Ausgangsrevision {state.revision}</p>
          <p>Trage geprüfte Nettoerlöse und den bewerteten Nettoverbrauch für genau diesen Umfang ein. Bruttobelege werden nicht umgerechnet. Weitere gespeicherte Änderungen machen eine neue Bestätigung erforderlich.</p>
          <label>Nettoerlöse (€)<input required inputMode="decimal" value={revenue} onChange={event => setRevenue(event.target.value)} /></label>
          <label>Quelle der Nettoerlöse<textarea required maxLength={1000} value={sourceReason} onChange={event => setSourceReason(event.target.value)} placeholder="Abrechnung / Nachweis und geprüfter Umfang" /></label>
          <label>Bewerteter Nettoverbrauch (€)<input required inputMode="decimal" value={consumption} onChange={event => setConsumption(event.target.value)} /></label>
          <label>Verbrauchsnachweis und Bewertungsgrundlage<textarea required maxLength={1000} value={valuationReason} onChange={event => setValuationReason(event.target.value)} placeholder="Inventur / Verbrauchsliste, verwendete Nettopreise und Abgrenzung" /></label>
          <label className="checkbox-label"><input type="checkbox" required />Beide Nettowerte sind vollständig, geprüft und betreffen denselben Umfang.</label>
          <p>Die Differenz beschreibt Nettoerlöse minus bewerteten Verbrauch; weitere Betriebskosten sind darin nicht enthalten.</p>
          {error && <p role="alert">{error}</p>}
          <button className="button primary">Nettogrundlage verbindlich bestätigen</button>
        </fieldset>
      </form>
    </Modal>
  );
}
