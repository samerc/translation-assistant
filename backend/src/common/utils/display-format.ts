/**
 * How amounts and dates are printed on documents (invoice PDF/Word, emails),
 * matching the app: currency symbol where one exists ("€25.00", "LBP 25.00")
 * and the organization's chosen date format.
 */

export function formatMoney(amount: unknown, currency: string): string {
  const n = Number(amount ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(safe);
  } catch {
    return `${currency} ${safe.toFixed(2)}`;
  }
}

/**
 * A calendar date in the organization's format. Date-only strings
 * ("2026-10-26") are read as-is — never through the server's time zone.
 */
export function formatDateOnly(
  value: string | Date | null | undefined,
  format = 'DD/MM/YYYY',
): string {
  if (!value) return '';
  let y: number, m: number, d: number;
  const match =
    typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null;
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '';
    [y, m, d] = [
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    ];
  }
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  if (format === 'MM/DD/YYYY') return `${mm}/${dd}/${y}`;
  if (format === 'YYYY-MM-DD') return `${y}-${mm}-${dd}`;
  return `${dd}/${mm}/${y}`;
}
