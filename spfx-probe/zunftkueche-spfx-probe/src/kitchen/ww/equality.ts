// Persisted object key order is immaterial; array order remains significant.
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, ordered(item)])
    );
  return value;
}
export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
