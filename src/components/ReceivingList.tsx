import { useState } from 'react';
import type { ScreenProps } from '../App.tsx';
import { movementQuantity } from '../domain/corrections.ts';
import { buildReceivingList } from '../domain/receiving.ts';
import { activeLocations, newEntryLocation } from '../domain/locations.ts';
import { Modal, shownAmount, Notice } from './shared.tsx';
import { parseQuantity } from '../domain/kitchen.ts';
import { ResponsiveTable } from './MobileItemCard.tsx';

export function ReceivingList(props: ScreenProps) {
  const { state, busy } = props;
  const [orderId, setOrderId] = useState(state.orders.at(-1)?.id ?? '');
  const [lineId, setLineId] = useState<string | null>(null);
  const rows = orderId ? buildReceivingList(state, orderId) : [];
  return <section className="form-card">
    <h2>Annahmeliste nach Bestellfassung</h2>
    <label>Bestellfassung<select value={orderId} onChange={event => setOrderId(event.target.value)}>
      <option value="">Fassung wählen</option>
      {state.orders.map(order => <option key={order.id} value={order.id}>
        {order.context?.supplierName ?? order.supplierId} · {order.day} · {new Date(order.createdAt).toLocaleString('de-DE')} · {order.status}
      </option>)}
    </select></label>
    <Notice>Sollmengen buchen keinen Zugang. Jede Teil- oder Ersatzlieferung ausdrücklich annehmen. Offene Restmengen älterer Bestellfassungen bleiben sichtbar.</Notice>
    <ResponsiveTable>
      <thead><tr><th>Artikel</th><th>Bestellt</th><th>Angenommen</th><th>Rest / Abweichung</th><th></th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{row.name}<small>{row.unit}</small>{row.entries.map(movement => <small key={movement.id}>
          {movement.day} · {state.articles.find(article => article.id === movement.articleId)?.name} · {shownAmount(movementQuantity(state, movement))} {row.unit} · {movement.note}
        </small>)}</td>
        <td>{shownAmount(row.ordered)}</td><td>{shownAmount(row.received)}</td>
        <td>{shownAmount(row.remaining)} offen · {shownAmount(row.deviation)} Abweichung</td>
        <td><button className="text-button" disabled={busy || state.event.status === 'Abgeschlossen'} onClick={() => setLineId(row.id)}>Tatsächliche Menge annehmen</button></td>
      </tr>)}</tbody>
    </ResponsiveTable>
    {lineId && <AcceptDelivery {...props} orderId={orderId} lineId={lineId} onClose={() => setLineId(null)} />}
  </section>;
}
function AcceptDelivery({ state, busy, commit, orderId, lineId, onClose, lastLocation }: ScreenProps & {
  orderId: string; lineId: string; onClose: () => void;
}) {
  const row = buildReceivingList(state, orderId).find(line => line.id === lineId)!;
  const [articleId, setArticle] = useState(row.articleId);
  const [raw, setRaw] = useState('');
  const [day, setDay] = useState(state.orders.find(order => order.id === orderId)!.day);
  const [location, setLocation] = useState(newEntryLocation(state, lastLocation));
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const quantity = parseQuantity(raw);
      if (quantity === null) throw new Error('Tatsächliche Menge fehlt.');
      const saved = await commit('delivery.accept', {
        orderId, day, location, note,
        lines: [{ lineId, articleId, quantity, substitutionConfirmed: confirmed }],
      });
      if (saved) onClose();
      else setError('Annahme noch nicht gespeichert.');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return <Modal title={`Lieferung annehmen · ${row.name}`} onClose={onClose}>
    <form onSubmit={save}><fieldset disabled={busy}>
      <p>{shownAmount(row.remaining)} {row.unit} noch offen</p>
      <label>Gelieferter Artikel<select value={articleId} onChange={event => { setArticle(event.target.value); setConfirmed(false); }}>
        {state.articles.filter(article => article.unit === row.unit).map(article => <option value={article.id} key={article.id}>{article.name}</option>)}
      </select></label>
      <label>Tatsächliche Menge<input required value={raw} inputMode="decimal" onChange={event => setRaw(event.target.value)} /></label>
      <label>Tag<select value={day} onChange={event => setDay(event.target.value)}>
        {['Mittwoch', 'Freitag', 'Samstag', 'Sonntag', 'Allgemein'].map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Ort<select value={location} onChange={event => setLocation(event.target.value)}>
        {activeLocations(state).map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Teil-/Abweichungsnotiz<textarea value={note} maxLength={1000} required={articleId !== row.articleId} onChange={event => setNote(event.target.value)} /></label>
      {articleId !== row.articleId && <label><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Diesen Ersatzartikel ausdrücklich annehmen (gleiche Einheit).</label>}
      {error && <p role="alert">{error}</p>}
      <button className="button primary" disabled={!location}>Liefermenge verbindlich annehmen</button>
    </fieldset></form>
  </Modal>;
}
