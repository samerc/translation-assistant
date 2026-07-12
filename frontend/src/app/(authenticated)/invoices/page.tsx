'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { INVOICE_STATUS_BADGE } from '@/lib/status';

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

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const router = useRouter();

  useEffect(() => {
    api.get<{ data: ClientOption[] }>('/clients?limit=100').then((res) => setClients(res.data));
  }, []);

  const loadInvoices = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (clientFilter) params.set('clientId', clientFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('limit', '25');

    api.get<InvoicesResponse>(`/invoices?${params}`).then((res) => {
      setInvoices(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    });
  };

  useEffect(() => { loadInvoices(); }, [search, statusFilter, clientFilter, sortBy, sortOrder, page]);

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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Invoices</h1>
        <button onClick={() => router.push('/invoices/new')}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
          + New Invoice
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input placeholder="Search invoices..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={clientFilter} onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Clients</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-sm text-text-muted ml-auto">{total} invoice{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[650px]">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('invoiceNumber')}>
                Invoice # <SortIcon field="invoiceNumber" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Client</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('status')}>
                Status <SortIcon field="status" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('issueDate')}>
                Issue Date <SortIcon field="issueDate" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('dueDate')}>
                Due Date <SortIcon field="dueDate" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Items</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('total')}>
                Total <SortIcon field="total" />
              </th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-text-muted">No invoices found.</td></tr>
            )}
            {invoices.map((inv) => {
              const badge = getStatusBadge(inv.status);
              const isOverdue = inv.status === 'sent' && new Date(inv.dueDate) < new Date();
              return (
                <tr key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)}
                  className="border-b border-border last:border-0 hover:bg-bg/50 cursor-pointer">
                  <td className="px-4 py-3 font-mono font-medium text-text">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-text-secondary">{inv.client?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${isOverdue ? 'bg-danger-light text-danger' : badge.color}`}>
                      {isOverdue ? 'Overdue' : badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(inv.issueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-text-secondary">{inv.itemCount || 0}</td>
                  <td className="px-4 py-3 text-text-secondary font-medium">
                    {inv.currency} {Number(inv.total).toFixed(2)}
                  </td>
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
