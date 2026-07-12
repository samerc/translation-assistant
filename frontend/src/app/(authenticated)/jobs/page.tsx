'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { JOB_STATUS_BADGE, JOB_TYPE_BADGE } from '@/lib/status';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency, formatDate } from '@/lib/format';

interface Job {
  id: string;
  jobNumber: string;
  type: 'template' | 'freeform';
  title: string;
  status: string;
  client: { id: string; name: string };
  sourceLanguage: { code: string; name: string };
  targetLanguage: { code: string; name: string } | null;
  deadline: string | null;
  lineItemCount: number;
  calculatedTotal: number;
  finalPrice: number | null;
  isFreeOfCharge: boolean;
  createdAt: string;
}

interface JobsResponse { data: Job[]; total: number; page: number; limit: number; totalPages: number; }

const STATUSES = [
  { value: 'quote', label: 'Quote', color: JOB_STATUS_BADGE.quote },
  { value: 'accepted', label: 'Accepted', color: JOB_STATUS_BADGE.accepted },
  { value: 'in_progress', label: 'In Progress', color: JOB_STATUS_BADGE.in_progress },
  { value: 'delivered', label: 'Delivered', color: JOB_STATUS_BADGE.delivered },
  { value: 'invoiced', label: 'Invoiced', color: JOB_STATUS_BADGE.invoiced },
  { value: 'paid', label: 'Paid', color: JOB_STATUS_BADGE.paid },
  { value: 'lost', label: 'Lost', color: JOB_STATUS_BADGE.lost },
  { value: 'cancelled', label: 'Cancelled', color: JOB_STATUS_BADGE.cancelled },
];

export default function JobsPage() {
  const { baseCurrency } = useSettings();
  const { hasPermission } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const loadJobs = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    const clientId = searchParams.get('clientId');
    if (clientId) params.set('clientId', clientId);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('limit', '25');

    setLoadError(false);
    api.get<JobsResponse>(`/jobs?${params}`).then((res) => {
      setJobs(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    }).catch(() => setLoadError(true));
  };

  useEffect(() => { loadJobs(); }, [search, statusFilter, sortBy, sortOrder, page, searchParams]);

  const handleSort = (field: string) => {
    if (sortBy === field) { setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC'); }
    else { setSortBy(field); setSortOrder('DESC'); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <span className="text-text-muted ml-1">↕</span>;
    return <span className="text-primary ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>;
  };

  const getStatusBadge = (status: string) => {
    const s = STATUSES.find((st) => st.value === status);
    return s || { label: status, color: 'bg-bg text-text-secondary' };
  };

  const getPrice = (job: Job) => {
    if (job.isFreeOfCharge) return 'Free';
    const price = job.finalPrice ?? job.calculatedTotal;
    return formatCurrency(price, baseCurrency);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Jobs</h1>
        {hasPermission('jobs:create') && (
          <button onClick={() => router.push('/jobs/new')}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
            + New Job
          </button>
        )}
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">
          Couldn&apos;t load jobs. Please refresh or try again.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input placeholder="Search jobs..." aria-label="Search jobs" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {searchParams.get('clientId') && (
          <button onClick={() => router.push('/jobs')} className="px-3 py-1.5 bg-bg border border-border text-text-secondary rounded-lg text-xs">
            Clear client filter
          </button>
        )}
        <span className="text-sm text-text-muted ml-auto">{total} job{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('title')}>
                Job <SortIcon field="title" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Client</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Languages</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('status')}>
                Status <SortIcon field="status" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Items</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('calculatedTotal')}>
                Total <SortIcon field="calculatedTotal" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('deadline')}>
                Deadline <SortIcon field="deadline" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                Created <SortIcon field="createdAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-text-muted">No jobs found.</td></tr>
            )}
            {jobs.map((job) => {
              const badge = getStatusBadge(job.status);
              return (
                <tr key={job.id} onClick={() => router.push(`/jobs/${job.id}`)}
                  className="border-b border-border last:border-0 hover:bg-bg/50 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text">{job.title}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-text-muted">{job.jobNumber}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${job.type === 'freeform' ? JOB_TYPE_BADGE.freeform : JOB_TYPE_BADGE.template}`}>
                        {job.type === 'freeform' ? 'Free-form' : 'Template'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{job.client.name}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {job.sourceLanguage.code.toUpperCase()}{job.targetLanguage ? ` → ${job.targetLanguage.code.toUpperCase()}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{job.lineItemCount || 0}</td>
                  <td className="px-4 py-3 text-text-secondary">{getPrice(job)}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(job.deadline)}</td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(job.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary disabled:opacity-40 hover:bg-border/50">Previous</button>
          <span className="text-sm text-text-secondary">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary disabled:opacity-40 hover:bg-border/50">Next</button>
        </div>
      )}
    </div>
  );
}
