'use client';

import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { ActivityLog } from '@/components/ActivityLog';

/** What platform admins did: organization decisions, accounts, platform settings. */
export default function PlatformActivityPage() {
  const { user } = useAuth();
  if (!user?.isPlatformAdmin) return null;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Activity"
        description="What platform admins did: approvals, suspensions, deletions, account help and platform settings. Organizations see the entries about them." />
      <ActivityLog endpoint="/platform/audit-log" platform />
    </div>
  );
}
