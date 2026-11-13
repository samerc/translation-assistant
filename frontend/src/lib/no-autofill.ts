/**
 * Spread onto inputs that hold someone else's details (an invitee's or a
 * client's email), so password managers don't fill in the signed-in user's own.
 * Bitwarden, 1Password, LastPass and Dashlane each use their own opt-out.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-bwignore': 'true',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;
