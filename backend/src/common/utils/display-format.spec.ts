import { formatDateOnly, formatMoney } from './display-format';

describe('formatDateOnly', () => {
  it('prints a date-only string in each organization format', () => {
    expect(formatDateOnly('2026-11-05')).toBe('05/11/2026');
    expect(formatDateOnly('2026-11-05', 'DD/MM/YYYY')).toBe('05/11/2026');
    expect(formatDateOnly('2026-11-05', 'MM/DD/YYYY')).toBe('11/05/2026');
    expect(formatDateOnly('2026-11-05', 'YYYY-MM-DD')).toBe('2026-11-05');
  });

  it('never shifts a calendar date through a time zone', () => {
    expect(formatDateOnly('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
    expect(formatDateOnly(new Date(Date.UTC(2026, 11, 31)))).toBe('31/12/2026');
  });

  it('is empty for missing or invalid input', () => {
    expect(formatDateOnly(null)).toBe('');
    expect(formatDateOnly('not a date')).toBe('');
  });
});

describe('formatMoney', () => {
  it('uses the currency symbol where there is one, the code otherwise', () => {
    expect(formatMoney(25, 'EUR')).toBe('€25.00');
    expect(formatMoney('1234.5', 'USD')).toBe('$1,234.50');
    expect(formatMoney(25, 'LBP')).toMatch(/^LBP\s?25/);
  });

  it('falls back to "CODE amount" for an unknown code', () => {
    expect(formatMoney(5, 'ZZ1')).toBe('ZZ1 5.00');
  });
});
