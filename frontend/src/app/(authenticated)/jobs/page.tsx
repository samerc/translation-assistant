'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Job {
  id: number;
  jobNumber: string;
  type: 'template' | 'freeform';
  title: string;
  status: string;
  client: { id: number; name: string };
  sourceLanguage: { code: string; name: string };
  targetLanguage: { code: string; name: string };
  deadline: string | null;
  lineItems: { id: number; pageCount: number }[];
  calculatedTotal: number;
  finalPrice: number | null;
  isFreeOfCharge: boolean;
  createdAt: string;
}

interface JobsResponse { data: Job[]; total: number; page: number; limit: number; totalPages: number; }

const STATUSES = [
  { value: 'quote', label: 'Quote', color: 'bg-sky-100 text-sky-700' },
  { value: 'accepted', label: 'Accepted', color: 'bg-teal-100 text-teal-700' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-primary-light text-primary' },
  { value: 'delivered', label: 'Delivered', color: 'bg-green-100 text-green-700' },
  { value: 'invoiced', label: 'Invoiced', color: 'bg-warning-light text-warning' },
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'lost', label: 'Lost', color: 'bg-gray-100 text-gray-500' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-danger-light text-danger' },
];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
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

    api.get<JobsResponse>(`/jobs?${params}`).then((res) => {
      setJobs(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    });
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
    return `$${Number(price).toFixed(2)}`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Jobs</h1>
        <button onClick={() => router.push('/jobs/new')}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
          + New Job
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input placeholder="Search jobs..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary" />
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
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
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
                      <span className={`text-xs px-1.5 py-0.5 rounded ${job.type === 'freeform' ? 'bg-bg text-text-muted' : 'bg-primary-light text-primary'}`}>
                        {job.type === 'freeform' ? 'Free-form' : 'Template'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{job.client.name}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {job.sourceLanguage.code.toUpperCase()} → {job.targetLanguage.code.toUpperCase()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${badge.color}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{job.lineItems?.length || 0}</td>
                  <td className="px-4 py-3 text-text-secondary">{getPrice(job)}</td>
                  <td className="px-4 py-3 text-text-secondary">{job.deadline ? new Date(job.deadline).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(job.createdAt).toLocaleDateString()}</td>
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
