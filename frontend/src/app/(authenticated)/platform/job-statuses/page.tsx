'use client';

import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { JobStatusesEditor } from '@/components/JobStatusesEditor';

/** The default job statuses every organization gets (platform admin). */
export default function PlatformJobStatusesPage() {
  const { user } = useAuth();
  if (!user?.isPlatformAdmin) return null;
  return (
    <div className="max-w-4xl">
      <PageHeader title="Job statuses"
        description="Statuses inside the stages (for example Proofreading under In progress), offered to every organization." />
      <JobStatusesEditor platform />
    </div>
  );
}
