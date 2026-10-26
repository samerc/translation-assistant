import { IsNotCommonPasswordConstraint } from './is-not-common-password.js';

describe('IsNotCommonPasswordConstraint', () => {
  const constraint = new IsNotCommonPasswordConstraint();

  it('rejects well-known breached passwords', () => {
    expect(constraint.validate('password')).toBe(false);
    expect(constraint.validate('12345678')).toBe(false);
    expect(constraint.validate('iloveyou')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(constraint.validate('PASSWORD')).toBe(false);
    expect(constraint.validate('Password')).toBe(false);
  });

  it('sees through added digits, symbols and leetspeak', () => {
    for (const p of [
      'Password1!',
      'Welcome1!',
      'Qwerty123!',
      'P@ssw0rd2024',
      '2024Dragon!',
      'Admin123!',
      'Sunshine#9',
    ]) {
      expect(constraint.validate(p)).toBe(false);
    }
  });

  it('does not flag passwords that merely contain a common word', () => {
    expect(constraint.validate('Welcome-to-Beirut-7')).toBe(true);
    expect(constraint.validate('Lina!Trans-2026')).toBe(true);
    expect(constraint.validate('Correct-Horse-9-Battery')).toBe(true);
  });

  it('accepts a strong, uncommon password', () => {
    expect(constraint.validate('Tr4nsl8! on-Assistant-9x')).toBe(true);
  });

  it('does not block non-string values (other validators handle those)', () => {
    expect(constraint.validate(undefined as unknown as string)).toBe(true);
  });
});
