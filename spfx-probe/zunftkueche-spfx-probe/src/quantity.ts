// Reused verbatim from src/domain/kitchen.ts at a618100ed55b25492394bb7314737dbbfeb45b5e.
// Legacy contract preserves the existing distinction between an open amount and zero.
// eslint-disable-next-line @rushstack/no-new-null
export function parseQuantity(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+(,\d{1,4})?$/.test(value)) throw new Error('Menge bitte als positive Zahl mit Dezimalkomma eingeben.');
  const quantity = Number(value.replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity > 10000000)
    throw new Error('Menge liegt außerhalb des zulässigen Bereichs.');
  return quantity;
}
