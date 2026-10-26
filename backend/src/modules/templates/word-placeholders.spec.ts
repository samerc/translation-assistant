import { scanWordPlaceholders } from './word-placeholders.js';

describe('scanWordPlaceholders', () => {
  it('finds fields and records which group loop each sits in', () => {
    const scan = scanWordPlaceholders(
      'Holder {full_name} {#children}{child_name} {child_dob}{/children} {notes}',
    );
    expect(scan.fields).toEqual([
      'full_name',
      'child_name',
      'child_dob',
      'notes',
    ]);
    expect(scan.groupOf).toEqual({
      child_name: 'children',
      child_dob: 'children',
    });
    expect(scan.groups).toEqual(['children']);
    expect(scan.malformed).toEqual([]);
  });

  it('accepts the same loop used twice (paragraphs and a table)', () => {
    const scan = scanWordPlaceholders(
      '{#kids}{name}{/kids} … {#kids}{name}{/kids}',
    );
    expect(scan.malformed).toEqual([]);
    expect(scan.groups).toEqual(['kids']);
  });

  it('reports unclosed, mismatched and nested loops', () => {
    expect(scanWordPlaceholders('{#a}{x}').malformed[0].reason).toMatch(
      /never closed/,
    );
    expect(scanWordPlaceholders('{x}{/a}').malformed[0].reason).toMatch(
      /never opened/,
    );
    expect(
      scanWordPlaceholders('{#a}{#b}{x}{/b}{/a}').malformed[0].reason,
    ).toMatch(/cannot be nested/);
  });

  it('reports bad names and unbalanced braces', () => {
    const reasons = scanWordPlaceholders(
      '{first name} {1st} {a-b} {x',
    ).malformed.map((m) => m.reason);
    expect(reasons).toEqual([
      expect.stringMatching(/spaces/),
      expect.stringMatching(/number/),
      expect.stringMatching(/invalid characters/),
      expect.stringMatching(/Mismatched braces/),
    ]);
  });
});
