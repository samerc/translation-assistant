'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';
import { useAuth } from '@/lib/auth-context';
import { INVOICE_STATUS_BADGE } from '@/lib/status';
import { formatCurrency, formatDate, todayLocal } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { Button } from '@/components/ui/Button';
import { SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Pagination, RowChevron, SortableTh, TableCard } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { PlusIcon, ReceiptIcon } from '@/components/ui/icons';
import { RequirePermission } from '@/components/RequirePermission';

interface Invoice {
  id: string;
  invoiceNumber: string;
  client: { id: string; name: string };
  status: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  paidAmount: number | null;
  itemCount: number;
  createdAt: string;
}

interface InvoicesResponse { data: Invoice[]; total: number; page: number; limit: number; totalPages: number; }
interface ClientOption { id: string; name: string; }

const STATUSES = [
  { value: 'draft', label: 'Draft', color: INVOICE_STATUS_BADGE.draft },
  { value: 'sent', label: 'Sent', color: INVOICE_STATUS_BADGE.sent },
  { value: 'paid', label: 'Paid', color: INVOICE_STATUS_BADGE.paid },
  { value: 'overdue', label: 'Overdue', color: INVOICE_STATUS_BADGE.overdue },
  { value: 'cancelled', label: 'Cancelled', color: INVOICE_STATUS_BADGE.cancelled },
];

function InvoicesPage() {
  const { hasPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const router = useRouter();
  const today = todayLocal(useNow());

  useEffect(() => {
    api.get<{ data: ClientOption[] }>('/clients?limit=100').then((res) => setClients(res.data));
  }, []);

  // Returns a cancel fn: the effect uses it so only the latest request's response is applied.
  const loadInvoices = () => {
    let ignore = false;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (clientFilter) params.set('clientId', clientFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('limit', '25');

    api.get<InvoicesResponse>(`/invoices?${params}`).then((res) => {
      if (ignore) return;
      setLoadError(false);
      setInvoices(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    }).catch(() => { if (!ignore) setLoadError(true); });
    return () => { ignore = true; };
  };

  useEffect(() => loadInvoices(), [debouncedSearch, statusFilter, clientFilter, sortBy, sortOrder, page]);

  const handleSort = (field: string) => {
    if (sortBy === field) { setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC'); }
    else { setSortBy(field); setSortOrder('DESC'); }
  };

  const getStatusBadge = (status: string) => {
    const s = STATUSES.find((st) => st.value === status);
    return s || { label: status, color: 'bg-bg text-text-secondary' };
  };

  const filtered = Boolean(search || statusFilter || clientFilter);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Bill clients for delivered jobs and record payments."
        actions={hasPermission('invoices:create') && (
          <Button variant="primary" icon={<PlusIcon />} onClick={() => router.push('/invoices/new')}>New invoice</Button>
        )}
      />

      {loadError && <Alert className="mb-4">Couldn&apos;t load invoices. Please refresh or try again.</Alert>}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <SearchInput placeholder="Search invoices…" aria-label="Search invoices" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select aria-label="Status" className="!w-auto" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Select aria-label="Client" className="!w-auto max-w-60" value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}>
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>

      <TableCard
        minWidth={760}
        footer={<Pagination page={page} totalPages={totalPages} total={total} pageSize={25} noun={total === 1 ? 'invoice' : 'invoices'} onPage={setPage} />}
      >
        <thead>
          <tr>
            <SortableTh field="invoiceNumber" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Invoice</SortableTh>
            <th>Client</th>
            <SortableTh field="status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Status</SortableTh>
            <SortableTh field="issueDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Issued</SortableTh>
            <SortableTh field="dueDate" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Due</SortableTh>
            <th className="text-right">Items</th>
            <SortableTh field="total" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right">Total</SortableTh>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {invoices.length === 0 && !loadError && (
            <tr>
              <td colSpan={8}>
                <EmptyState
                  icon={<ReceiptIcon />}
                  title={filtered ? 'No invoices match your filters' : 'No invoices yet'}
                  description={filtered ? 'Try another search, status or client.' : 'Create an invoice from a delivered job, or start a new one here.'}
                />
              </td>
            </tr>
          )}
          {invoices.map((inv) => {
            const badge = getStatusBadge(inv.status);
            const isOverdue = inv.status === 'sent' && inv.dueDate.slice(0, 10) < today;
            const partlyPaid = ['sent', 'overdue'].includes(inv.status) && Number(inv.paidAmount) > 0;
            return (
              <tr key={inv.id} data-href onClick={() => router.push(`/invoices/${inv.id}`)}>
                <td className="font-mono font-semibold text-text whitespace-nowrap">{inv.invoiceNumber}</td>
                <td>{inv.client?.name}</td>
                <td>
                  <div className="flex flex-col items-start gap-0.5">
                    <Badge dot tone={isOverdue ? INVOICE_STATUS_BADGE.overdue : badge.color}>{isOverdue ? 'Overdue' : badge.label}</Badge>
                    {partlyPaid && <span className="text-xs text-text-muted">Partially paid</span>}
                  </div>
                </td>
                <td className="tabular-nums whitespace-nowrap">{formatDate(inv.issueDate)}</td>
                <td className={`tabular-nums whitespace-nowrap ${isOverdue || inv.status === 'overdue' ? 'text-danger font-medium' : ''}`}>{formatDate(inv.dueDate)}</td>
                <td className="text-right tabular-nums">{inv.itemCount || 0}</td>
                <td className="text-right tabular-nums font-medium text-text whitespace-nowrap">{formatCurrency(inv.total, inv.currency)}</td>
                <RowChevron />
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </div>
  );
}

export default function InvoicesPageGate() {
  return <RequirePermission permission="invoices:read"><InvoicesPage /></RequirePermission>;
}
