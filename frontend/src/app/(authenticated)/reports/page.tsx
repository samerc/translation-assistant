'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency } from '@/lib/format';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface RevenueData { period: string; revenue: number; }
interface ClientData { clientId: string; clientName: string; invoiceCount: number; totalRevenue: number; }
interface StatusData { status: string; count: number; }

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

export default function ReportsPage() {
  const { baseCurrency } = useSettings();
  const [activeTab, setActiveTab] = useState('revenue');
  const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
  const [clientData, setClientData] = useState<ClientData[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [period, setPeriod] = useState('monthly');

  useEffect(() => {
    if (activeTab === 'revenue') {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const fromStr = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
      api.get<RevenueData[]>(`/reports/revenue?period=${period}&from=${fromStr}`)
        // Aggregates come back as strings from the DB — coerce for recharts + toFixed.
        .then((rows) => setRevenueData(rows.map((r) => ({ ...r, revenue: Number(r.revenue) }))))
        .catch(() => setRevenueData([]));
    } else if (activeTab === 'client') {
      api.get<ClientData[]>('/reports/by-client')
        .then((rows) => setClientData(rows.map((c) => ({
          ...c,
          totalRevenue: Number(c.totalRevenue),
          invoiceCount: Number(c.invoiceCount),
        }))))
        .catch(() => setClientData([]));
    } else if (activeTab === 'status') {
      api.get<StatusData[]>('/reports/job-status')
        .then((rows) => setStatusData(rows.map((s) => ({ ...s, count: Number(s.count) }))))
        .catch(() => setStatusData([]));
    }
  }, [activeTab, period]);

  const tabs = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'client', label: 'By Client' },
    { key: 'status', label: 'Job Status' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-6">Reports</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-bg border border-border rounded-lg p-1 w-fit">
        {tabs.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Revenue Tab */}
      {activeTab === 'revenue' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-text">Revenue Over Time</h2>
            <div className="flex gap-1 bg-bg border border-border rounded-lg p-1">
              <button onClick={() => setPeriod('monthly')}
                className={`px-3 py-1 rounded-md text-xs font-medium ${period === 'monthly' ? 'bg-surface text-text shadow-sm' : 'text-text-muted'}`}>
                Monthly
              </button>
              <button onClick={() => setPeriod('weekly')}
                className={`px-3 py-1 rounded-md text-xs font-medium ${period === 'weekly' ? 'bg-surface text-text shadow-sm' : 'text-text-muted'}`}>
                Weekly
              </button>
            </div>
          </div>
          {revenueData.length === 0 ? (
            <div className="text-center py-16 text-text-muted text-sm">No revenue data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="period" tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--color-text)' }}
                  itemStyle={{ color: 'var(--color-primary)' }}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* By Client Tab */}
      {activeTab === 'client' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text mb-6">Revenue by Client</h2>
          {clientData.length === 0 ? (
            <div className="text-center py-16 text-text-muted text-sm">No client data yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={clientData.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="clientName" tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}
                    labelStyle={{ color: 'var(--color-text)' }}
                  />
                  <Bar dataKey="totalRevenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-6">
                <table className="w-full text-sm">
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
                        <td className="py-2 text-text font-medium text-right">{formatCurrency(c.totalRevenue, baseCurrency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Job Status Tab */}
      {activeTab === 'status' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-text mb-6">Jobs by Status</h2>
          {statusData.length === 0 ? (
            <div className="text-center py-16 text-text-muted text-sm">No job data yet</div>
          ) : (
            <div className="flex flex-col lg:flex-row items-start gap-8">
              <div className="w-full lg:w-1/2">
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={statusData} dataKey="count" nameKey="status" cx="50%" cy="50%"
                    innerRadius={60} outerRadius={120} paddingAngle={2}
                    label={false}
                    labelLine={false}>
                    {statusData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#9ca3af'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              </div>
              <div className="w-full lg:flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 font-semibold text-text-secondary">Status</th>
                      <th className="text-right py-2 font-semibold text-text-secondary">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusData.map((s) => (
                      <tr key={s.status} className="border-b border-border last:border-0">
                        <td className="py-2 flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] || '#9ca3af' }} />
                          <span className="text-text">{STATUS_LABELS[s.status] || s.status}</span>
                        </td>
                        <td className="py-2 text-text font-medium text-right">{s.count}</td>
                      </tr>
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
