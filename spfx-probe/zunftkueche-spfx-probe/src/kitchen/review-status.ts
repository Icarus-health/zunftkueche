import type { Supplier, Offer } from './model';
/** Was am Lieferanten fehlt, damit bestellt werden kann. Leerer Text heißt: alles da. */
export function supplierHint(s: Supplier): string {
  if (s.method === 'Telefon' && !s.phone.trim()) return 'Telefonnummer fehlt';
  if (s.method === 'E-Mail' && !s.email.trim()) return 'E-Mail-Adresse fehlt';
  if (!s.phone.trim() && !s.email.trim()) return 'Kontakt fehlt';
  return '';
}
export const supplierNeedsReview = (s: Supplier): boolean => !!supplierHint(s);
export const offerNeedsReview = (o: Offer): boolean => o.priceNet === null;
