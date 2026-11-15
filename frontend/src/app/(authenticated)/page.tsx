'use client';

import { Badge } from '@/components/ui/Badge';
import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { formatCurrency, formatDate, todayLocal } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { JOB_STATUS_BADGE, OPEN_JOB_STATUSES, badgeClass, isJobOverdue } from '@/lib/status';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { BriefcaseIcon, ChartIcon, CheckIcon, ClockIcon, ReceiptIcon, XIcon } from '@/components/ui/icons';

interface DashboardStats {
  activeJobs: number;
  monthlyRevenue: number;
  pendingInvoices: number;
  dueThisWeek: number;
  currency: string;
}

interface UpcomingJob { id: string; jobNumber: string; title: string; status: string; deadline: string | null; client: { name: string } | null; }

const STATUS_LABEL: Record<string, string> = { quote: 'Quote', accepted: 'Accepted', in_progress: 'In Progress' };

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  // The platform admin's home is the organizations list.
  useEffect(() => {
    if (user?.isPlatformAdmin) router.replace('/platform');
  }, [user, router]);
  if (user?.isPlatformAdmin) return null;
  return <TenantDashboard />;
}

function TenantDashboard() {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const canSeeStats = hasPermission('reports:read');
  const [loading, setLoading] = useState(canSeeStats);

  useEffect(() => {
    if (!canSeeStats) return;
    api.get<DashboardStats>('/reports/dashboard-stats')
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canSeeStats]);

  const currency = stats?.currency || 'USD';
  // Right on the first visit and every one after (unlike "Welcome back").
  const hour = new Date(useNow()).getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <PageHeader title={`${greeting}, ${user?.firstName ?? ''}`} description="Here's where your work stands today." />

      {user?.role?.name === 'Admin' && <GettingStarted />}

      {/* Summary cards — all come from /reports/dashboard-stats, so hidden without reports:read */}
      {canSeeStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SummaryCard href="/jobs" title="Active jobs" value={stats ? String(stats.activeJobs) : '0'} loading={loading} icon={<BriefcaseIcon />} />
          <SummaryCard href="/reports" title="Revenue this month" value={formatCurrency(stats?.monthlyRevenue ?? 0, currency)} loading={loading} icon={<ChartIcon />} />
          <SummaryCard href="/invoices" title="Pending invoices" value={stats ? String(stats.pendingInvoices) : '0'} loading={loading} icon={<ReceiptIcon />} />
          <SummaryCard href="/calendar" title="Due this week" value={stats ? String(stats.dueThisWeek) : '0'} loading={loading} icon={<ClockIcon />} />
        </div>
      )}

      {hasPermission('jobs:read') && <UpcomingDeadlines />}
    </div>
  );
}

function SummaryCard({ href, title, value, icon, loading }: { href: string; title: string; value: string; icon: ReactNode; loading?: boolean }) {
  return (
    <Link href={href} className="card p-5 flex flex-col gap-3 hover:border-border-strong hover:shadow-md transition-[box-shadow,border-color]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">{title}</span>
        <span className="w-8 h-8 rounded-lg bg-primary-light text-primary-text grid place-items-center">{icon}</span>
      </div>
      {loading ? (
        <div className="h-8 w-24 bg-sunken rounded animate-pulse" />
      ) : (
        <div className="text-2xl font-bold tracking-tight text-text tabular-nums">{value}</div>
      )}
    </Link>
  );
}

// ── Upcoming deadlines (open jobs the user can see — assigned ones for translators) ──

function UpcomingDeadlines() {
  const { user } = useAuth();
  // Admins who also translate: their own jobs, or everyone's.
  const isAdmin = user?.role?.name === 'Admin';
  const [scope, setScope] = useState<'all' | 'me'>('all');
  const [loaded, setLoaded] = useState<{ scope: string; jobs: UpcomingJob[] } | null>(null);
  const jobs = loaded?.scope === scope ? loaded.jobs : null;
  const today = todayLocal(useNow());

  useEffect(() => {
    let ignore = false;
    const mine = scope === 'me' ? '&assignee=me' : '';
    api.get<{ data: UpcomingJob[] }>(`/jobs?status=${OPEN_JOB_STATUSES.join(',')}&hasDeadline=true&sortBy=deadline&sortOrder=ASC&limit=6${mine}`)
      .then((res) => { if (!ignore) setLoaded({ scope, jobs: res.data }); })
      .catch(() => { if (!ignore) setLoaded({ scope, jobs: [] }); });
    return () => { ignore = true; };
  }, [scope]);

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <h2 className="font-semibold text-text">Upcoming deadlines</h2>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <SegmentedControl<'all' | 'me'> label="Whose jobs" value={scope} onChange={setScope}
              options={[{ value: 'all', label: 'Everyone' }, { value: 'me', label: 'Mine' }]} />
          )}
          <Link href={scope === 'me' ? '/jobs?assignee=me' : '/jobs'} className="text-sm font-medium text-primary-text hover:underline">All jobs</Link>
        </div>
      </div>
      {jobs === null ? (
        <div className="px-5 pb-5 space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-sunken rounded animate-pulse" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={<ClockIcon />} title="Nothing due" description="Open jobs with a deadline will show up here." />
      ) : (
        <ul className="divide-y divide-border">
          {jobs.map((job) => {
            const overdue = isJobOverdue(job, today);
            const dueToday = job.deadline?.slice(0, 10) === today;
            return (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text truncate">{job.title}</div>
                    <div className="text-xs text-text-muted truncate">{job.jobNumber}{job.client ? ` · ${job.client.name}` : ''}</div>
                  </div>
                  <Badge className="hidden sm:inline-flex" tone={badgeClass(JOB_STATUS_BADGE, job.status)}>
                    {STATUS_LABEL[job.status] ?? job.status}
                  </Badge>
                  <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${overdue ? 'text-danger' : dueToday ? 'text-warning' : 'text-text-secondary'}`}>
                    {overdue ? 'Overdue · ' : dueToday ? 'Today · ' : ''}{formatDate(job.deadline)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Getting started (admins, until every step is done or it is dismissed) ──

const DISMISS_KEY = 'gettingStartedDismissed';

interface Step { done: boolean; title: string; hint: string; href: string; }

function GettingStarted() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return typeof window !== 'undefined' && localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (dismissed) return;
    api.get<{ companyDetails: boolean; template: boolean; client: boolean; team: boolean; googleTranslate: boolean }>('/settings/getting-started')
      .then((d) => {
        setSteps([
          // The name comes from the organization; the address is what the admin adds.
          { done: d.companyDetails, title: 'Add your company details', hint: 'Address, logo and payment details appear on invoices.', href: '/settings?tab=general' },
          { done: d.template, title: 'Create a document template', hint: 'Birth certificates, diplomas, contracts…', href: '/templates' },
          { done: d.client, title: 'Add your first client', hint: 'A company or a person you translate for.', href: '/clients' },
          { done: d.team, title: 'Invite a translator', hint: 'Team › Invite.', href: '/team' },
          { done: d.googleTranslate, title: 'Connect Google Translate (optional)', hint: 'Turns on the GT helper in documents.', href: '/settings?tab=general' },
        ]);
      })
      .catch(() => setSteps(null)); // not an admin, or offline: no checklist
  }, [dismissed]);

  if (dismissed || !steps || steps.every((s) => s.done)) return null;

  const doneCount = steps.filter((s) => s.done).length;
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode — hide for this visit only */ }
    setDismissed(true);
  };

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-semibold text-text">Getting started</h2>
          <p className="text-sm text-text-secondary">{doneCount} of {steps.length} done</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Hide getting started" className="btn btn-ghost btn-sm btn-icon"><XIcon /></button>
      </div>
      <div className="h-1.5 rounded-full bg-sunken overflow-hidden mt-3 mb-4">
        <div className="h-full bg-primary rounded-full transition-[width]" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {steps.map((s) => (
          <li key={s.title}>
            <Link href={s.href} className={`flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors ${s.done ? 'opacity-60' : 'hover:bg-sunken'}`}>
              <span className={`mt-0.5 w-5 h-5 flex-none rounded-full grid place-items-center border ${s.done ? 'bg-success border-success text-white' : 'border-border-strong'}`}>
                {s.done && <CheckIcon className="w-3 h-3" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${s.done ? 'text-text-secondary line-through' : 'text-text'}`}>{s.title}</span>
                <span className="block text-xs text-text-muted">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
