// Single source of truth for status/type badge styling.
// Uses theme tokens (palette- and dark-mode-aware) instead of hardcoded swatches.

export const JOB_STATUS_BADGE: Record<string, string> = {
  quote: 'bg-info-light text-info',
  accepted: 'bg-accent-light text-accent',
  in_progress: 'bg-primary-light text-primary',
  delivered: 'bg-success-light text-success',
  invoiced: 'bg-warning-light text-warning',
  paid: 'bg-success-light text-success',
  lost: 'bg-neutral-light text-neutral',
  cancelled: 'bg-danger-light text-danger',
};

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-neutral-light text-neutral',
  sent: 'bg-info-light text-info',
  paid: 'bg-success-light text-success',
  overdue: 'bg-danger-light text-danger',
  cancelled: 'bg-neutral-light text-neutral',
};

export const TEMPLATE_TYPE_BADGE: Record<string, string> = {
  designer: 'bg-primary-light text-primary',
  word: 'bg-info-light text-info',
  simple: 'bg-warning-light text-warning',
};

export const JOB_TYPE_BADGE: Record<string, string> = {
  freeform: 'bg-warning-light text-warning',
  template: 'bg-accent-light text-accent',
};

export function badgeClass(map: Record<string, string>, key: string): string {
  return map[key] || 'bg-neutral-light text-neutral';
}
