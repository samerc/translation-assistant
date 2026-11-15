'use client';

// recharts lives only here — the reports page loads this module with
// next/dynamic, so the library is fetched when a chart is shown, not app-wide.
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
  PieChart, Pie, Cell,
} from 'recharts';
import { formatCurrency } from '@/lib/format';

const tooltipStyle = {
  contentStyle: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' },
  labelStyle: { color: 'var(--color-text)' },
};
const tick = (fontSize = 12) => ({ fill: 'var(--color-text-secondary)', fontSize });

/** Short axis amounts in the currency: "€1.2K". */
function axisMoney(currency: string) {
  return (n: number) => {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }).format(n);
    } catch {
      return String(n);
    }
  };
}

export function RevenueChart({ data, currency }: { data: { period: string; revenue: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="period" tick={tick()} />
        <YAxis tick={tick()} tickFormatter={axisMoney(currency)} allowDecimals={false} width={64} />
        <Tooltip {...tooltipStyle} itemStyle={{ color: 'var(--color-primary)' }}
          formatter={(v) => [formatCurrency(Number(v), currency), 'Received']} />
        {/* linear: a smoothed curve overshoots between points and misreads as data */}
        <Line type="linear" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ClientChart({ data, currency }: { data: { clientName: string; totalRevenue: number }[]; currency: string }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data} margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="clientName" tick={tick(11)} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={tick()} tickFormatter={axisMoney(currency)} allowDecimals={false} width={64} />
        <Tooltip {...tooltipStyle} formatter={(v) => [formatCurrency(Number(v), currency), 'Revenue']} />
        <Bar dataKey="totalRevenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Revenue" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusChart({ data, colors }: { data: { status: string; label: string; count: number }[]; colors: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%"
          innerRadius={60} outerRadius={120} paddingAngle={2} label={false} labelLine={false}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={colors[entry.status] || '#9ca3af'} />
          ))}
        </Pie>
        <Tooltip {...tooltipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}
