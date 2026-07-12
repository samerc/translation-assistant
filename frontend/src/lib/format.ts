// Shared, locale-aware formatting helpers. Use these instead of hardcoding `$`
// or ad-hoc `Number(x).toFixed(2)` / `new Date(x).toLocaleDateString()`.

export function formatCurrency(
  amount: number | string | null | undefined,
  currency = 'USD',
): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(safe);
  } catch {
    // Invalid/unknown ISO code — fall back to a plain amount with the code.
    return `${currency} ${safe.toFixed(2)}`;
  }
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
