import type {TextAssist} from '../ocr/receipt-parser.ts';
import type {Supplier} from '../domain/state.ts';

export const receiptFieldLabels = {supplierId: 'Lieferant', number: 'Belegnummer', date: 'Datum', grossCents: 'Brutto gesamt'} as const;
export function receiptDateLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value || 'Offen';
}
/** Presentation only: proposals, integer cents and their source quotations remain untouched. */
export function receiptProposalLabel(proposal: TextAssist['proposals'][number], suppliers: Supplier[]): string {
  if (proposal.value === null) return proposal.status === 'ambiguous' ? 'Mehrdeutig · manuell prüfen' : 'Offen';
  if (proposal.field === 'supplierId') return suppliers.find(supplier => supplier.id === proposal.value)?.name ?? 'Lieferant nicht mehr verfügbar';
  if (proposal.field === 'date') return receiptDateLabel(proposal.value);
  if (proposal.field === 'grossCents') return new Intl.NumberFormat('de-DE', {style: 'currency', currency: 'EUR'}).format(Number(proposal.value) / 100);
  return proposal.value;
}
