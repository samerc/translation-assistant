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

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Bare `YYYY-MM-DD` strings are calendar dates: parse them as local midnight (not UTC) so they don't shift a day. */
function parseDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = DATE_ONLY.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseDate(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** A Date's local calendar date as `YYYY-MM-DD` (unlike `toISOString()`, which is UTC). */
export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local date as `YYYY-MM-DD`. In render, pass `now` from `useNow()` instead of relying on the default. */
export function todayLocal(now: number = Date.now()): string {
  return localDateString(new Date(now));
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
