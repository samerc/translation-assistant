import type { SelectHTMLAttributes } from 'react';
import { Select } from './Field';

// Usual currencies first, then every ISO 4217 code the browser knows.
const COMMON = ['USD', 'EUR', 'GBP', 'LBP', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR', 'JOD', 'EGP', 'TRY', 'CAD', 'AUD', 'CHF'];

function allCurrencies(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('currency');
  } catch {
    return COMMON;
  }
}

const OTHERS = allCurrencies().filter((c) => !COMMON.includes(c));

function label(code: string): string {
  try {
    const name = new Intl.DisplayNames(undefined, { type: 'currency' }).of(code);
    return name && name !== code ? `${code} — ${name}` : code;
  } catch {
    return code;
  }
}

/** A 3-letter currency code picker (value = ISO code such as "EUR"). */
export function CurrencySelect({ value, ...props }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { value: string }) {
  // Keep an unusual stored code selectable even if this browser doesn't list it.
  const extra = value && !COMMON.includes(value) && !OTHERS.includes(value) ? [value] : [];
  return (
    <Select value={value} {...props}>
      <optgroup label="Common">
        {[...extra, ...COMMON].map((c) => <option key={c} value={c}>{label(c)}</option>)}
      </optgroup>
      <optgroup label="All currencies">
        {OTHERS.map((c) => <option key={c} value={c}>{label(c)}</option>)}
      </optgroup>
    </Select>
  );
}
