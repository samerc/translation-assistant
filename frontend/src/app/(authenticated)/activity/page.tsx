'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClass } from '@/components/ui/Button';
import { KeyIcon } from '@/components/ui/icons';
import { ActivityLog } from '@/components/ActivityLog';

/** The organization's audit log (Admin only): who did what, when. */
export default function ActivityPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.isPlatformAdmin || user.role?.name !== 'Admin') {
    return (
      <div className="card mt-6">
        <EmptyState icon={<KeyIcon />} title="You don't have access to this page"
          description="Only the organization's admins see its activity."
          action={<Link href="/" className={buttonClass()}>Back to dashboard</Link>} />
      </div>
    );
  }
  return (
    <div className="max-w-5xl">
      <PageHeader title="Activity"
        description="Who did what: deletions, status and role changes, payments, settings and invitations. Kept for two years." />
      <ActivityLog endpoint="/audit-log" />
    </div>
  );
}
