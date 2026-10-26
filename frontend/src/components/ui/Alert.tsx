import type { ReactNode } from 'react';
import { AlertIcon } from './icons';

/** Inline message box, e.g. a list that failed to load. */
export function Alert({ tone = 'danger', className = '', children }: {
  tone?: 'danger' | 'warning' | 'info' | 'success';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`tone tone-${tone} flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ${className}`}>
      <AlertIcon className="w-4 h-4 mt-0.5" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
