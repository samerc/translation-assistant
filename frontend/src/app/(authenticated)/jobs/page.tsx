'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';
import { useAuth } from '@/lib/auth-context';
import { JOB_STATUS_BADGE, JOB_TYPE_BADGE } from '@/lib/status';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Pagination, RowChevron, SortableTh, TableCard } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { BriefcaseIcon, PlusIcon, XIcon } from '@/components/ui/icons';

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
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Returns a cancel fn: the effect uses it so only the latest request's response is applied.
  const loadJobs = () => {
    let ignore = false;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    const clientId = searchParams.get('clientId');
    if (clientId) params.set('clientId', clientId);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('limit', '25');

    api.get<JobsResponse>(`/jobs?${params}`).then((res) => {
      if (ignore) return;
      setLoadError(false);
      setJobs(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    }).catch(() => { if (!ignore) setLoadError(true); });
    return () => { ignore = true; };
  };

  useEffect(() => loadJobs(), [debouncedSearch, statusFilter, sortBy, sortOrder, page, searchParams]);

  const handleSort = (field: string) => {
    if (sortBy === field) { setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC'); }
    else { setSortBy(field); setSortOrder('DESC'); }
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

  const filtered = Boolean(search || statusFilter || searchParams.get('clientId'));

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="Quotes, translations in progress, and delivered work."
        actions={hasPermission('jobs:create') && (
          <Button variant="primary" icon={<PlusIcon />} onClick={() => router.push('/jobs/new')}>New job</Button>
        )}
      />

      {loadError && <Alert className="mb-4">Couldn&apos;t load jobs. Please refresh or try again.</Alert>}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <SearchInput placeholder="Search jobs…" aria-label="Search jobs" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select aria-label="Status" className="!w-auto" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        {searchParams.get('clientId') && (
          <Button size="sm" variant="ghost" icon={<XIcon />} onClick={() => router.push('/jobs')}>Clear client filter</Button>
        )}
      </div>

      <TableCard
        minWidth={820}
        footer={<Pagination page={page} totalPages={totalPages} total={total} pageSize={25} noun={total === 1 ? 'job' : 'jobs'} onPage={setPage} />}
      >
        <thead>
          <tr>
            <SortableTh field="title" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Job</SortableTh>
            <th>Client</th>
            <th>Languages</th>
            <SortableTh field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Status</SortableTh>
            <th className="text-right">Items</th>
            <SortableTh field="calculatedTotal" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right">Total</SortableTh>
            <SortableTh field="deadline" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Deadline</SortableTh>
            <SortableTh field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Created</SortableTh>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 && !loadError && (
            <tr>
              <td colSpan={9}>
                <EmptyState
                  icon={<BriefcaseIcon />}
                  title={filtered ? 'No jobs match your filters' : 'No jobs yet'}
                  description={filtered ? 'Try another search or status.' : 'Create a job when a client sends you something to translate.'}
                />
              </td>
            </tr>
          )}
          {jobs.map((job) => {
            const badge = getStatusBadge(job.status);
            return (
              <tr key={job.id} data-href onClick={() => router.push(`/jobs/${job.id}`)}>
                <td>
                  <div className="font-semibold text-text">{job.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono text-text-muted">{job.jobNumber}</span>
                    <span className={`text-[11px] font-semibold px-1.5 rounded ${job.type === 'freeform' ? JOB_TYPE_BADGE.freeform : JOB_TYPE_BADGE.template}`}>
                      {job.type === 'freeform' ? 'Free-form' : 'Template'}
                    </span>
                  </div>
                </td>
                <td>{job.client.name}</td>
                <td className="font-mono text-xs whitespace-nowrap">
                  {job.sourceLanguage.code.toUpperCase()}{job.targetLanguage ? ` → ${job.targetLanguage.code.toUpperCase()}` : ''}
                </td>
                <td><Badge dot tone={badge.color}>{badge.label}</Badge></td>
                <td className="text-right tabular-nums">{job.lineItemCount || 0}</td>
                <td className="text-right tabular-nums font-medium text-text whitespace-nowrap">{getPrice(job)}</td>
                <td className="tabular-nums whitespace-nowrap">{formatDate(job.deadline)}</td>
                <td className="tabular-nums whitespace-nowrap">{formatDate(job.createdAt)}</td>
                <RowChevron />
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </div>
  );
}
