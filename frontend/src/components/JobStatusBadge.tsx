'use client';

import { Badge } from '@/components/ui/Badge';
import { jobStatusLabel, jobStatusTone, useJobStatuses, type JobStatusRef } from '@/lib/job-statuses';

/** A job's status pill: its status within the stage (organization colour), else the stage. */
export function JobStatusBadge({ job, className = '' }: { job: JobStatusRef; className?: string }) {
  const cat = useJobStatuses();
  return <Badge tone={jobStatusTone(job, cat)} className={className}>{jobStatusLabel(job)}</Badge>;
}
