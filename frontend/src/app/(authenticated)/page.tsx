'use client';

import { useAuth } from '@/lib/auth-context';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-1">
        Welcome back, {user?.firstName}
      </h1>
      <p className="text-text-secondary mb-6">Here&apos;s your overview</p>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Active Jobs" value="0" />
        <SummaryCard title="Revenue (Month)" value="$0" />
        <SummaryCard title="Pending Invoices" value="0" />
        <SummaryCard title="Due This Week" value="0" />
      </div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="text-2xl font-bold text-text">{value}</div>
      <div className="text-sm text-text-muted mt-1">{title}</div>
    </div>
  );
}
