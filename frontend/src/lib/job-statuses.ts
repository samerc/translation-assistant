'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';

/**
 * Job statuses: the fixed stages (they drive locking, open/overdue, invoicing)
 * and the statuses inside them — platform defaults + the organization's own.
 * `GET /job-statuses` loads once per page load; `invalidateJobStatuses()` after edits.
 */

export interface StatusDef {
  id: string;
  stage: string;
  name: string;
  tone: string;
  notify: 'none' | 'assignees' | 'admins' | 'both';
  sortOrder: number;
  source: 'default' | 'own';
  hidden: boolean;
  jobCount: number;
}

export interface StageDef {
  stage: string;
  label: string;
  tone: string;
  locked: boolean;
  open: boolean;
  next: string[];
  statuses: StatusDef[];
}

/** What a job (or list row) carries about its status. */
export interface JobStatusRef {
  status: string;
  customStatus?: { id: string; name: string; tone: string } | null;
}

export const TONES = ['neutral', 'info', 'primary', 'accent', 'purple', 'success', 'warning', 'danger'] as const;
export const TONE_LABELS: Record<string, string> = {
  neutral: 'Grey', info: 'Blue', primary: 'Brand', accent: 'Accent',
  purple: 'Purple', success: 'Green', warning: 'Amber', danger: 'Red',
};
export const NOTIFY_LABELS: Record<StatusDef['notify'], string> = {
  none: 'Nobody',
  assignees: 'People on the job',
  admins: 'Organization admins',
  both: 'People on the job + admins',
};

/** Labels and colours before the catalogue loads (and its fallback). */
export const STAGE_LABELS: Record<string, string> = {
  quote: 'Quote', accepted: 'Accepted', in_progress: 'In Progress', delivered: 'Delivered',
  invoiced: 'Invoiced', paid: 'Paid', lost: 'Lost', cancelled: 'Cancelled',
};
const DEFAULT_TONES: Record<string, string> = {
  quote: 'neutral', accepted: 'info', in_progress: 'primary', delivered: 'purple',
  invoiced: 'warning', paid: 'success', lost: 'neutral', cancelled: 'danger',
};

export const toneClass = (tone: string) => `tone tone-${TONES.includes(tone as never) ? tone : 'neutral'}`;

// ── Store ──
let catalogue: StageDef[] | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function load() {
  if (loading) return loading;
  loading = api.get<StageDef[]>('/job-statuses')
    .then((c) => { catalogue = c; emit(); })
    .catch(() => { /* keep the fallback labels */ })
    .finally(() => { loading = null; });
  return loading;
}

/** Another person signed in / out: drop the cached list (it's per organization). */
export function forgetJobStatuses() {
  catalogue = null;
  emit();
}

export function invalidateJobStatuses() {
  catalogue = null;
  void load();
}

/** The organization's stages + statuses (null until loaded; loads on first use). */
export function useJobStatuses(): StageDef[] | null {
  const value = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => catalogue,
    () => null,
  );
  useEffect(() => { if (!catalogue) void load(); }, []);
  return value;
}

// ── Helpers ──
export function stageOf(cat: StageDef[] | null, stage: string): StageDef | undefined {
  return cat?.find((s) => s.stage === stage);
}

export function jobStatusLabel(job: JobStatusRef): string {
  return job.customStatus?.name ?? STAGE_LABELS[job.status] ?? job.status;
}

export function jobStatusTone(job: JobStatusRef, cat: StageDef[] | null): string {
  if (job.customStatus) return toneClass(job.customStatus.tone);
  return toneClass(stageOf(cat, job.status)?.tone ?? DEFAULT_TONES[job.status] ?? 'neutral');
}

/** A choice in a status menu: a stage itself (`id` null) or a status within it. */
export interface StatusOption {
  key: string;
  stage: string;
  statusId: string | null;
  label: string;
  allowed: boolean;
}

export const optionKey = (stage: string, statusId: string | null) => (statusId ? `s:${statusId}` : stage);

/**
 * The status menu for a job: every stage with its statuses (hidden ones left
 * out, except the job's current one). Allowed = the current stage (free moves
 * inside it) or a stage it may go to next.
 */
export function statusOptions(cat: StageDef[] | null, job: JobStatusRef): { label: string; options: StatusOption[] }[] {
  const stages = cat ?? Object.keys(STAGE_LABELS).map((s) => ({ stage: s, label: STAGE_LABELS[s], statuses: [], next: [] as string[] } as unknown as StageDef));
  const current = stageOf(cat, job.status);
  return stages.map((st) => {
    const allowed = st.stage === job.status || (current?.next ?? []).includes(st.stage);
    return {
      label: st.label,
      options: [
        { key: st.stage, stage: st.stage, statusId: null, label: st.label, allowed },
        ...st.statuses
          .filter((s) => !s.hidden || s.id === job.customStatus?.id)
          .map((s) => ({ key: optionKey(st.stage, s.id), stage: st.stage, statusId: s.id, label: s.name, allowed })),
      ],
    };
  });
}
