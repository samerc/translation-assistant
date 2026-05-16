'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (hasPermission('reports:read')) {
      api.get<DashboardStats>('/reports/dashboard-stats')
        .then(setStats)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const currency = stats?.currency || 'USD';
  const canSeeFinancials = hasPermission('reports:read');

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">
        Welcome back, {user?.firstName}
      </h1>
      <p className="text-text-secondary mb-6">Here&apos;s your overview</p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Active Jobs"
          value={loading ? '' : stats ? String(stats.activeJobs) : '0'}
          loading={loading}
          icon={<JobIcon />}
        />
        {canSeeFinancials && (
          <SummaryCard
            title="Revenue (Month)"
            value={loading ? '' : stats ? `${currency} ${stats.monthlyRevenue.toFixed(2)}` : '$0'}
            loading={loading}
            icon={<RevenueIcon />}
          />
        )}
        {canSeeFinancials && (
          <SummaryCard
            title="Pending Invoices"
            value={loading ? '' : stats ? String(stats.pendingInvoices) : '0'}
            loading={loading}
            icon={<InvoiceIcon />}
          />
        )}
        <SummaryCard
          title="Due This Week"
          value={loading ? '' : stats ? String(stats.dueThisWeek) : '0'}
          loading={loading}
          icon={<ClockIcon />}
        />
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon, loading }: { title: string; value: string; icon: React.ReactNode; loading?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center text-primary">
          {icon}
        </div>
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-bg rounded animate-pulse" />
      ) : (
        <div className="text-2xl font-bold text-text">{value}</div>
      )}
      <div className="text-sm text-text-muted mt-1">{title}</div>
    </div>
  );
}

function JobIcon() {
  return (<svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5z" clipRule="evenodd" /></svg>);
}
function RevenueIcon() {
  return (<svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" /></svg>);
}
function InvoiceIcon() {
  return (<svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>);
}
function ClockIcon() {
  return (<svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>);
}
