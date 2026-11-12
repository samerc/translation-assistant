'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClass } from '@/components/ui/Button';
import { KeyIcon } from '@/components/ui/icons';

export type TenantStatus = 'pending' | 'active' | 'suspended';

export interface TenantRow {
  id: string;
  name: string;
  status: TenantStatus;
  source: 'platform' | 'signup';
  createdAt: string;
  approvedAt: string | null;
  userCount?: number;
  admins?: { id: string; email: string; name: string; emailVerified: boolean }[];
}

export const STATUS_LABEL: Record<TenantStatus, string> = {
  pending: 'Waiting for approval',
  active: 'Active',
  suspended: 'Suspended',
};

const STATUS_TONE: Record<TenantStatus, string> = {
  pending: 'tone tone-warning',
  active: 'tone tone-success',
  suspended: 'tone tone-danger',
};

export function TenantStatusBadge({ status }: { status: TenantStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** The platform area is for the platform admin only (the API enforces it too). */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return null;
  if (user.isPlatformAdmin) return <>{children}</>;
  return (
    <div className="card mt-6">
      <EmptyState
        icon={<KeyIcon />}
        title="You don't have access to this page"
        description="Only the platform administrator manages organizations."
        action={<Link href="/" className={buttonClass()}>Back to dashboard</Link>}
      />
    </div>
  );
}

/** Shows a one-time secret (invite link, temporary password) and copies it. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
