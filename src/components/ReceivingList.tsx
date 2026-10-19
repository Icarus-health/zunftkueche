import {receivingSelection, savedSupplierLabel} from '../ui/order-selection.ts';
import type {ReceivingSelection} from '../ui/order-selection.ts';
import {kitchenEditingDisabled} from '../ui/kitchen-editing.ts';
import { useState } from 'react';
import type { ScreenProps } from '../App.tsx';
import { movementQuantity } from '../domain/corrections.ts';
import { buildReceivingList } from '../domain/receiving.ts';
import { activeLocations, newEntryLocation } from '../domain/locations.ts';
import { Modal, shownAmount, Notice, useDraftNavigation } from './shared.tsx';
import { parseQuantity } from '../domain/kitchen.ts';
import { ResponsiveTable } from './MobileItemCard.tsx';

export function ReceivingList(props: ScreenProps) {
  const { state } = props;
  const busy = kitchenEditingDisabled(props);
  const {navigate, pending} = useDraftNavigation();
  const [requested, setRequested] = useState<ReceivingSelection>({supplierId: '', day: 'Freitag', orderId: ''});
  const selection = receivingSelection(state, requested);
  const {supplierId, day, orderId, suppliers, days, orders} = selection;
  const [lineId, setLineId] = useState<string | null>(null);
  const selectedOrder = orders.find(order => order.id === orderId);
  const rows = orderId ? buildReceivingList(state, orderId) : [];
  function choose(next: ReceivingSelection) {
    navigate(() => { setRequested(next); setLineId(null); });
  }
  return <section className="form-card receiving-list">
    <h2>Lieferung nach Bestellfassung annehmen</h2>
    <div className="receiving-context">
      <label>Lieferant<select value={supplierId} disabled={pending} onChange={event => choose({supplierId: event.target.value, day, orderId: ''})}>
        {!suppliers.length && <option value="">Noch keine Lieferanten</option>}
        {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.label}</option>)}
      </select></label>
      <label>Liefertag<select value={day} disabled={pending || !days.length} onChange={event => choose({supplierId, day: event.target.value, orderId: ''})}>
        {!days.length && <option value={day}>Noch keine Bestellfassung</option>}
        {days.map(value => <option key={value}>{value}</option>)}
      </select></label>
      <label>Gespeicherte Fassung<select value={orderId} disabled={pending || !orders.length} onChange={event => choose({supplierId, day, orderId: event.target.value})}>
        {!orders.length && <option value="">Keine Fassung für diesen Kontext</option>}
        {orders.map((order, index) => <option key={order.id} value={order.id}>
          Fassung {index + 1} · {new Date(order.createdAt).toLocaleString('de-DE')} · {order.status}
        </option>)}
      </select></label>
    </div>
    {selectedOrder && <p className="selected-order-context">{savedSupplierLabel(state, selectedOrder)} · {selectedOrder.day}</p>}
    {orders.length > 1 && <details className="history-details"><summary>Alle Fassungen und offene Restmengen ({orders.length})</summary>
      {orders.map((order, index) => {
        const entries = buildReceivingList(state, order.id);
        const open = entries.filter(row => row.remaining === null || row.remaining > 0).length;
        return <div className="version-choice" key={order.id}>
          <span>Fassung {index + 1} · {new Date(order.createdAt).toLocaleString('de-DE')} · {open} Positionen mit offener Restmenge</span>
          <button className="text-button" disabled={pending || order.id === orderId} onClick={() => choose({supplierId, day, orderId: order.id})}>Fassung {index + 1} ansehen</button>
        </div>;
      })}
    </details>}
    <Notice>Sollmengen buchen keinen Zugang. Jede Teil- oder Ersatzlieferung ausdrücklich annehmen. Offene Restmengen älterer Bestellfassungen bleiben sichtbar.</Notice>
    <ResponsiveTable>
      <thead><tr><th>Artikel</th><th>Bestellt</th><th>Angenommen</th><th>Rest / Abweichung</th><th></th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{row.name}<small>{row.unit}</small>{row.entries.map(movement => <small key={movement.id}>
          {movement.day} · {state.articles.find(article => article.id === movement.articleId)?.name} · {shownAmount(movementQuantity(state, movement))} {row.unit} · {movement.note}
        </small>)}</td>
        <td>{shownAmount(row.ordered)}</td><td>{shownAmount(row.received)}</td>
        <td>{shownAmount(row.remaining)} offen · {shownAmount(row.deviation)} Abweichung</td>
        <td><button className="text-button" disabled={busy} onClick={() => setLineId(row.id)}>Tatsächliche Menge annehmen</button></td>
      </tr>)}</tbody>
    </ResponsiveTable>
    {lineId && <AcceptDelivery {...props} busy={busy} orderId={orderId} lineId={lineId} onClose={() => setLineId(null)} />}
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
