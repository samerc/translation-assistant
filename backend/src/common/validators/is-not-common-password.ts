import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { COMMON_PASSWORDS } from './common-passwords.js';

// Undo the usual decorations people add to meet complexity rules:
// "P@ssw0rd2024!" → "password", "Welcome1!" → "welcome".
const LEET: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '3': 'e',
  $: 's',
  '5': 's',
  '7': 't',
};

function stem(password: string): string {
  const lower = password.toLowerCase();
  // Strip leading/trailing digits and symbols first ("2024", "!", "123!"),
  // then map leetspeak inside what remains.
  const core = lower.replace(/^[^a-z@$]+/, '').replace(/[^a-z]+$/, '');
  return core.replace(/[@4013$57!]/g, (c) => LEET[c] ?? c);
}

// Stems of the list itself ("password123" → "password"), plus common words
// whose decorated forms are short of the list's 8-character minimum.
const COMMON_STEMS = new Set([
  ...[...COMMON_PASSWORDS].map(stem).filter((s) => s.length >= 4),
  'welcome',
  'qwerty',
  'admin',
  'letmein',
  'monkey',
  'dragon',
  'master',
  'login',
  'hello',
  'secret',
  'changeme',
  'translate',
  'translator',
]);

@ValidatorConstraint({ name: 'isNotCommonPassword', async: false })
export class IsNotCommonPasswordConstraint implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    if (typeof value !== 'string') return true;
    if (COMMON_PASSWORDS.has(value.toLowerCase())) return false;
    return !COMMON_STEMS.has(stem(value));
  }

  defaultMessage(): string {
    return 'This password is too common and has appeared in data breaches. Please choose a more unique password.';
  }
}

/**
 * Rejects passwords from the common breached-password list, including the
 * same words dressed up with digits, symbols or leetspeak ("Password1!").
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
