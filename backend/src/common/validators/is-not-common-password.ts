import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { COMMON_PASSWORDS } from './common-passwords.js';

@ValidatorConstraint({ name: 'isNotCommonPassword', async: false })
export class IsNotCommonPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== 'string') return true;
    return !COMMON_PASSWORDS.has(value.toLowerCase());
  }

  defaultMessage(): string {
    return 'This password is too common and has appeared in data breaches. Please choose a more unique password.';
  }
}

/**
 * Rejects passwords found in the top 1,000 most common breached passwords.
 */
export function IsNotCommonPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsNotCommonPasswordConstraint,
    });
  };
}
