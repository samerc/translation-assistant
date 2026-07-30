import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { IsNotCommonPassword } from './is-not-common-password.js';

// Requires at least one lowercase, one uppercase, one digit and one special char.
const PASSWORD_COMPLEXITY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

/**
 * Single source of truth for the password policy (register, admin-create,
 * change-password, reset-password): length + complexity + breached-password check.
 */
export function IsStrongPassword(): PropertyDecorator {
  const decorators: PropertyDecorator[] = [
    IsString(),
    MinLength(8),
    MaxLength(100),
    Matches(PASSWORD_COMPLEXITY, {
      message:
        'Password must contain an uppercase letter, a lowercase letter, a number, and a special character.',
    }),
    IsNotCommonPassword() as PropertyDecorator,
  ];
  return (target, propertyKey) => {
    for (const decorate of decorators) decorate(target, propertyKey);
  };
}
