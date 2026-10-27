'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClass } from '@/components/ui/Button';
import { KeyIcon } from '@/components/ui/icons';

/**
 * Renders the page only for users holding `permission` — others (e.g. a
 * translator opening /invoices by URL) get a clear "no access" state instead
 * of a page whose requests all fail. The API enforces this regardless.
 */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { user, hasPermission } = useAuth();
  if (!user) return null;
  if (hasPermission(permission)) return <>{children}</>;
  return (
    <div className="card mt-6">
      <EmptyState
        icon={<KeyIcon />}
        title="You don't have access to this page"
        description="Your role doesn't include it. Ask an admin if you need access."
        action={<Link href="/" className={buttonClass()}>Back to dashboard</Link>}
      />
    </div>
  );
}
