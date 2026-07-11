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

  it('accepts a strong, uncommon password', () => {
    expect(constraint.validate('Tr4nsl8! on-Assistant-9x')).toBe(true);
  });

  it('does not block non-string values (other validators handle those)', () => {
    expect(constraint.validate(undefined as unknown as string)).toBe(true);
  });
});
