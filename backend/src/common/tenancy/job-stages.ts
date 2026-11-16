/**
 * Job stages: the fixed statuses that carry behaviour (open/overdue, locking,
 * invoicing, allowed next steps). Organizations add their own statuses *inside*
 * a stage (`job_statuses`); a job's `status` column is always its stage and
 * `customStatusId` the optional status within it (null = the stage itself).
 */
export const JOB_STAGES = [
  'quote',
  'accepted',
  'in_progress',
  'delivered',
  'invoiced',
  'paid',
  'lost',
  'cancelled',
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const STAGE_LABELS: Record<JobStage, string> = {
  quote: 'Quote',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

/** Colours are the app's tone names (readable in every palette and dark mode). */
export const STATUS_TONES = [
  'neutral',
  'info',
  'primary',
  'accent',
  'purple',
  'success',
  'warning',
  'danger',
] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export const DEFAULT_STAGE_TONES: Record<JobStage, StatusTone> = {
  quote: 'neutral',
  accepted: 'info',
  in_progress: 'primary',
  delivered: 'purple',
  invoiced: 'warning',
  paid: 'success',
  lost: 'neutral',
  cancelled: 'danger',
};

/** Who hears about a move to a status. */
export const STATUS_NOTIFY = ['none', 'assignees', 'admins', 'both'] as const;
export type StatusNotify = (typeof STATUS_NOTIFY)[number];

export const LOCKED_STAGES: readonly string[] = [
  'delivered',
  'invoiced',
  'paid',
];
export const OPEN_STAGES: readonly string[] = [
  'quote',
  'accepted',
  'in_progress',
];
/** Stages a job can be created in. */
export const CREATE_STAGES: readonly string[] = OPEN_STAGES;

/**
 * Allowed manual moves between stages (PATCH /jobs/:id/status). Moving between
 * statuses of the same stage is always allowed. Invoice automation moves jobs
 * via batch updates and isn't constrained here; leaving a locked stage
 * backwards goes through reopen.
 */
export const STAGE_TRANSITIONS: Record<string, string[]> = {
  quote: ['accepted', 'in_progress', 'lost', 'cancelled'],
  accepted: ['in_progress', 'lost', 'cancelled'],
  in_progress: ['delivered', 'lost', 'cancelled'],
  delivered: ['invoiced', 'cancelled'],
  invoiced: ['paid', 'cancelled'],
  paid: [],
  lost: ['quote', 'in_progress'],
  cancelled: ['quote', 'in_progress'],
};

export const stageLabel = (s: string) => STAGE_LABELS[s as JobStage] ?? s;
