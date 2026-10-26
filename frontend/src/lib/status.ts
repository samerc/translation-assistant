// Single source of truth for status/type badge styling.
// Values are tone classes (globals.css) — readable in every palette and in dark mode.

export const JOB_STATUS_BADGE: Record<string, string> = {
  quote: 'tone tone-neutral',
  accepted: 'tone tone-info',
  in_progress: 'tone tone-primary',
  delivered: 'tone tone-purple',
  invoiced: 'tone tone-warning',
  paid: 'tone tone-success',
  lost: 'tone tone-neutral',
  cancelled: 'tone tone-danger',
};

export const INVOICE_STATUS_BADGE: Record<string, string> = {
  draft: 'tone tone-neutral',
  sent: 'tone tone-info',
  paid: 'tone tone-success',
  overdue: 'tone tone-danger',
  cancelled: 'tone tone-neutral',
};

export const TEMPLATE_TYPE_BADGE: Record<string, string> = {
  designer: 'tone tone-primary',
  word: 'tone tone-info',
  simple: 'tone tone-warning',
};

export const JOB_TYPE_BADGE: Record<string, string> = {
  freeform: 'tone tone-warning',
  template: 'tone tone-purple',
};

export function badgeClass(map: Record<string, string>, key: string): string {
  return map[key] || 'tone tone-neutral';
}

/** Job statuses still being worked on — the ones a deadline matters for. */
export const OPEN_JOB_STATUSES = ['quote', 'accepted', 'in_progress'];

/** An open job whose deadline (YYYY-MM-DD) is before `today` (from `todayLocal(useNow())`). */
export function isJobOverdue(job: { status: string; deadline: string | null }, today: string): boolean {
  return Boolean(job.deadline && OPEN_JOB_STATUSES.includes(job.status) && job.deadline.slice(0, 10) < today);
}
