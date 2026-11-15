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

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'] as const;

// The organization's date format (Settings > General), set by the auth context
// from the profile before each re-render. Default: DD/MM/YYYY.
let dateFormat: string = 'DD/MM/YYYY';
export function setDateFormat(format: string | null | undefined): void {
  dateFormat = format && (DATE_FORMATS as readonly string[]).includes(format) ? format : 'DD/MM/YYYY';
}

/** A calendar date in the organization's format, from a `Date` or `YYYY-MM-DD`. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseDate(value);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const y = d.getFullYear();
  if (dateFormat === 'MM/DD/YYYY') return `${mm}/${dd}/${y}`;
  if (dateFormat === 'YYYY-MM-DD') return `${y}-${mm}-${dd}`;
  return `${dd}/${mm}/${y}`;
}

/** Date and time ("15/11/2026, 11:43"), the date in the organization's format. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return `${formatDate(d)}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
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

/** Up to two initials from a name ("Al Noor Legal" -> "AN"); letters from any script. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /^\p{L}/u.test(w));
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

/** "holder_name" / "familyMembers" → "Holder name" / "Family members". */
export function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** "Edge on Windows" from a browser user-agent string (the raw string is kept for tooltips). */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null;
  const os =
    /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown device';
}
