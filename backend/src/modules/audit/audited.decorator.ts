import { SetMetadata } from '@nestjs/common';

/** Kinds of record an audit entry can point at (see `TARGETS` in audit.service). */
export type AuditTargetType =
  | 'client'
  | 'job'
  | 'invoice'
  | 'template'
  | 'document'
  | 'user'
  | 'invite'
  | 'freeformType'
  | 'tenant'
  | 'role'
  | 'language'
  | 'label';

export interface AuditRef {
  /** Name of the entry in `details` (e.g. `user`, `role`). */
  key: string;
  type: AuditTargetType;
  /** Where its id comes from: a route param or a body field. */
  from: 'param' | 'body';
  name: string;
}

export interface AuditOptions {
  /** What the entry points at. Its id: route param `param` (default `id`), else the response's `id`. */
  target?: AuditTargetType;
  param?: string;
  /** Where a create's response keeps the new record's id, e.g. `tenant.id` (default `id`). */
  responseId?: string;
  /** Body fields whose values are recorded (never secrets). */
  body?: string[];
  /** Record which body fields were sent (names only — e.g. settings, where values may be secret). */
  bodyKeys?: boolean;
  /** Other records named in the request, stored by label (e.g. the user assigned to a job). */
  refs?: AuditRef[];
}

export const AUDIT_KEY = 'audit';

export interface AuditMeta extends AuditOptions {
  action: string;
}

/**
 * Record a successful call of this route in the audit log
 * (`AuditInterceptor`). Failed requests are not recorded.
 */
export const Audited = (action: string, options: AuditOptions = {}) =>
  SetMetadata(AUDIT_KEY, { action, ...options } satisfies AuditMeta);
