import type { ReactNode } from 'react';

/**
 * Pill badge. `tone` is a tone class from lib/status.ts (e.g. JOB_STATUS_BADGE[status])
 * or 'tone tone-success' etc. `dot` adds a leading status dot.
 */
export function Badge({ tone = 'tone tone-neutral', dot = false, className = '', children }: {
  tone?: string;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <span className={`badge ${dot ? 'badge-dot' : ''} ${tone} ${className}`}>{children}</span>;
}
