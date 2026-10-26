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

/** "just now" / "5m ago" / "3h ago" / "2d ago", then a plain date after a week. Pass `now` from `useNow()`. */
export function formatTimeAgo(value: string | Date, now: number): string {
  const mins = Math.floor((now - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}
