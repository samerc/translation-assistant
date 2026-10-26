'use client';

// recharts lives only here — the reports page loads this module with
// next/dynamic, so the library is fetched when a chart is shown, not app-wide.
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
  PieChart, Pie, Cell,
} from 'recharts';

const tooltipStyle = {
  contentStyle: { backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' },
  labelStyle: { color: 'var(--color-text)' },
};
const tick = (fontSize = 12) => ({ fill: 'var(--color-text-secondary)', fontSize });

export function RevenueChart({ data }: { data: { period: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="period" tick={tick()} />
        <YAxis tick={tick()} />
        <Tooltip {...tooltipStyle} itemStyle={{ color: 'var(--color-primary)' }} />
        <Line type="monotone" dataKey="revenue" stroke="var(--color-primary)" strokeWidth={2} dot={{ fill: 'var(--color-primary)' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ClientChart({ data }: { data: { clientName: string; totalRevenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="clientName" tick={tick(11)} angle={-20} textAnchor="end" height={60} />
        <YAxis tick={tick()} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="totalRevenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Revenue" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StatusChart({ data, colors }: { data: { status: string; count: number }[]; colors: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <PieChart>
        <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%"
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
