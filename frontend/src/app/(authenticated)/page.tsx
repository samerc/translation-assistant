'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { PageHeader } from '@/components/ui/PageHeader';
import { BriefcaseIcon, ChartIcon, ClockIcon, ReceiptIcon } from '@/components/ui/icons';

interface DashboardStats {
  activeJobs: number;
  monthlyRevenue: number;
  pendingInvoices: number;
  dueThisWeek: number;
  currency: string;
}

export default function Dashboard() {
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

  return (
    <div>
      <PageHeader title={`Welcome back, ${user?.firstName ?? ''}`} description="Here's where your work stands today." />

      {/* Summary cards — all come from /reports/dashboard-stats, so hidden without reports:read */}
      {canSeeStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard href="/jobs" title="Active jobs" value={stats ? String(stats.activeJobs) : '0'} loading={loading} icon={<BriefcaseIcon />} />
          <SummaryCard href="/reports" title="Revenue this month" value={formatCurrency(stats?.monthlyRevenue ?? 0, currency)} loading={loading} icon={<ChartIcon />} />
          <SummaryCard href="/invoices" title="Pending invoices" value={stats ? String(stats.pendingInvoices) : '0'} loading={loading} icon={<ReceiptIcon />} />
          <SummaryCard href="/calendar" title="Due this week" value={stats ? String(stats.dueThisWeek) : '0'} loading={loading} icon={<ClockIcon />} />
        </div>
      )}
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
