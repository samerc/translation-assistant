'use client';

import { Badge } from '@/components/ui/Badge';
import { toneClass } from '@/lib/job-statuses';
import { Fragment, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { RequirePermission } from '@/components/RequirePermission';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

// recharts is only fetched when a chart is on screen (see charts.tsx).
const chartFallback = () => <div className="h-[350px]" aria-hidden="true" />;
const RevenueChart = dynamic(() => import('./charts').then((m) => m.RevenueChart), { ssr: false, loading: chartFallback });
const ClientChart = dynamic(() => import('./charts').then((m) => m.ClientChart), { ssr: false, loading: chartFallback });
const StatusChart = dynamic(() => import('./charts').then((m) => m.StatusChart), { ssr: false, loading: chartFallback });

interface RevenueData { period: string; revenue: number; }
interface ClientData { clientId: string; clientName: string; invoiceCount: number; totalRevenue: number; }
interface StatusData { status: string; count: number; statuses?: { id: string; name: string; tone: string; count: number }[] }

const STATUS_COLORS: Record<string, string> = {
  quote: '#0ea5e9',
  accepted: '#14b8a6',
  in_progress: '#6366f1',
  delivered: '#22c55e',
  invoiced: '#f59e0b',
  paid: '#10b981',
  lost: '#9ca3af',
  cancelled: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  quote: 'Quote',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

type Range = '6m' | '12m' | 'year' | 'last-year';
const RANGES: { value: Range; label: string }[] = [
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'year', label: 'This year' },
  { value: 'last-year', label: 'Last year' },
];

const ym = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`;

/** `from`/`to` months (YYYY-MM, inclusive) for a range ending this month. */
function rangeMonths(range: Range, now: Date): { from: string; to: string } {
  const y = now.getFullYear(), m = now.getMonth();
  if (range === 'year') return { from: ym(y, 0), to: ym(y, m) };
  if (range === 'last-year') return { from: ym(y - 1, 0), to: ym(y - 1, 11) };
  const back = range === '6m' ? 5 : 11;
  const start = new Date(y, m - back, 1);
  return { from: ym(start.getFullYear(), start.getMonth()), to: ym(y, m) };
}

/** "2026-05" → "May 2026"; weekly "202646" → "Wk 46 2026". */
function periodLabel(period: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(period);
  if (month) {
    return new Date(Number(month[1]), Number(month[2]) - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const week = /^(\d{4})(\d{2})$/.exec(period);
  return week ? `Wk ${Number(week[2])} ${week[1]}` : period;
}

function ReportsPage() {
  const { baseCurrency } = useSettings();
  const now = useNow(60 * 60 * 1000);
  const [activeTab, setActiveTab] = useState<'revenue' | 'client' | 'status'>('revenue');
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [clientData, setClientData] = useState<ClientData[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [period, setPeriod] = useState<'monthly' | 'weekly'>('monthly');
  const [range, setRange] = useState<Range>('6m');
  const { from, to } = rangeMonths(range, new Date(now));

  useEffect(() => {
    // `ignore` drops a slower response for a tab/period the user has already left.
    let ignore = false;
    if (activeTab === 'revenue') {
      api.get<RevenueData[]>(`/reports/revenue?period=${period}&from=${from}&to=${to}`)
        // Aggregates come back as strings from the DB — coerce for the chart.
        .then((rows) => { if (!ignore) setRevenueData(rows.map((r) => ({ period: periodLabel(String(r.period)), revenue: Number(r.revenue) }))); })
        .catch(() => { if (!ignore) setRevenueData([]); });
    } else if (activeTab === 'client') {
      api.get<ClientData[]>('/reports/by-client')
        .then((rows) => { if (!ignore) setClientData(rows.map((c) => ({
          ...c,
          totalRevenue: Number(c.totalRevenue),
          invoiceCount: Number(c.invoiceCount),
        }))); })
        .catch(() => { if (!ignore) setClientData([]); });
    } else if (activeTab === 'status') {
      api.get<StatusData[]>('/reports/job-status')
        .then((rows) => { if (!ignore) setStatusData(rows.map((s) => ({ ...s, count: Number(s.count) }))); })
        .catch(() => { if (!ignore) setStatusData([]); });
    }
    return () => { ignore = true; };
  }, [activeTab, period, from, to]);

  const total = revenueData.reduce((sum, r) => sum + r.revenue, 0);
  const bestPeriod = revenueData.reduce<RevenueData | null>((best, r) => (r.revenue > (best?.revenue ?? 0) ? r : best), null);
  const money = (n: number) => formatCurrency(n, baseCurrency);

  return (
    <div>
      <PageHeader title="Reports" description="Payments received, who they came from, and where your jobs stand." />

      <div className="mb-6">
        <SegmentedControl
          label="Report"
          value={activeTab}
          onChange={setActiveTab}
          options={[
            { value: 'revenue', label: 'Revenue' },
            { value: 'client', label: 'By client' },
            { value: 'status', label: 'Job status' },
          ]}
        />
      </div>

      {/* Revenue */}
      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <SegmentedControl label="Date range" value={range} onChange={setRange} options={RANGES} />
            <SegmentedControl
              label="Group by"
              value={period}
              onChange={setPeriod}
              options={[{ value: 'monthly', label: 'Monthly' }, { value: 'weekly', label: 'Weekly' }]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <p className="text-sm text-text-secondary">Received in this period</p>
              <p className="text-2xl font-bold text-text mt-1">{money(total)}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-text-secondary">Best {period === 'weekly' ? 'week' : 'month'}</p>
              <p className="text-2xl font-bold text-text mt-1">
                {bestPeriod ? <>{money(bestPeriod.revenue)} <span className="text-sm font-medium text-text-secondary">· {bestPeriod.period}</span></> : '—'}
              </p>
            </div>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-text mb-6">Payments received ({baseCurrency})</h2>
            {total === 0 ? (
              <div className="text-center py-16 text-text-muted text-sm">No payments recorded in this period.</div>
            ) : (
              <RevenueChart data={revenueData} currency={baseCurrency} />
            )}
          </div>
        </div>
      )}

      {/* By client (all time) */}
      {activeTab === 'client' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-text">Revenue by client</h2>
          <p className="text-sm text-text-secondary mb-6">All time · payments received ({baseCurrency})</p>
          {clientData.length === 0 ? (
            <div className="text-center py-16 text-text-muted text-sm">No invoices yet.</div>
          ) : (
            <>
              <ClientChart data={clientData.slice(0, 10)} currency={baseCurrency} />
              <div className="mt-6 overflow-x-auto">
                <table className="data-table min-w-[400px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-semibold text-text-secondary">Client</th>
                      <th className="text-right py-2 font-semibold text-text-secondary">Invoices</th>
                      <th className="text-right py-2 font-semibold text-text-secondary">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientData.map((c) => (
                      <tr key={c.clientId} className="border-b border-border last:border-0">
                        <td className="py-2 text-text">{c.clientName}</td>
                        <td className="py-2 text-text-secondary text-right">{c.invoiceCount}</td>
                        <td className="py-2 text-text font-medium text-right">{money(c.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Job status */}
      {activeTab === 'status' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-text mb-6">Jobs by status</h2>
          {statusData.length === 0 ? (
            <div className="text-center py-16 text-text-muted text-sm">No jobs yet.</div>
          ) : (
            <div className="flex flex-col lg:flex-row items-start gap-8">
              <div className="w-full lg:w-1/2">
                <StatusChart data={statusData.map((s) => ({ ...s, label: STATUS_LABELS[s.status] || s.status }))} colors={STATUS_COLORS} />
              </div>
              <div className="w-full lg:flex-1 overflow-x-auto">
                <table className="data-table min-w-[300px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-semibold text-text-secondary">Status</th>
                      <th className="text-right py-2 font-semibold text-text-secondary">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusData.map((s) => (
                      <Fragment key={s.status}>
                        <tr className="border-b border-border last:border-0">
                          <td className="py-2 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] || '#9ca3af' }} />
                            <span className="text-text">{STATUS_LABELS[s.status] || s.status}</span>
                          </td>
                          <td className="py-2 text-text font-medium text-right">{s.count}</td>
                        </tr>
                        {/* The statuses within the stage (the rest of its jobs have the stage itself). */}
                        {(s.statuses ?? []).map((x) => (
                          <tr key={x.id} className="border-b border-border last:border-0">
                            <td className="py-1.5 pl-5"><Badge tone={toneClass(x.tone)}>{x.name}</Badge></td>
                            <td className="py-1.5 text-text-secondary text-right">{x.count}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReportsPageGate() {
  return <RequirePermission permission="reports:read"><ReportsPage /></RequirePermission>;
}
