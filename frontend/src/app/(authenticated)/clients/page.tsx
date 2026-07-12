'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface ClientEmail { id: string; email: string; label: string | null; }
interface ClientPhone { id: string; phone: string; label: string | null; }

interface Client {
  id: string;
  type: 'company' | 'person';
  name: string;
  emails: ClientEmail[];
  phones: ClientPhone[];
  contactsCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface ClientsResponse {
  data: Client[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function ClientsPage() {
  const { hasPermission } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'company' as 'company' | 'person', name: '', taxId: '', notes: '' });
  const router = useRouter();

  const loadClients = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('limit', '25');

    api.get<ClientsResponse>(`/clients?${params}`).then((res) => {
      setClients(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    });
  };

  useEffect(() => { loadClients(); }, [search, typeFilter, sortBy, sortOrder, page]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, string> = { type: form.type, name: form.name };
    if (form.taxId) body.taxId = form.taxId;
    if (form.notes) body.notes = form.notes;
    await api.post('/clients', body);
    setShowForm(false);
    setForm({ type: 'company', name: '', taxId: '', notes: '' });
    loadClients();
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <span className="text-text-muted ml-1">↕</span>;
    return <span className="text-primary ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Clients</h1>
        {hasPermission('clients:create') && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
          >
            + New Client
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-border rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-text mb-4">New Client</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as 'company' | 'person' })}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="company">Company</option>
                <option value="person">Person</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Tax ID</label>
              <input
                value={form.taxId}
                onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <p className="text-xs text-text-muted mt-3">Emails, phones, and addresses can be added after creating the client.</p>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
              Create Client
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Types</option>
          <option value="company">Company</option>
          <option value="person">Person</option>
        </select>
        <span className="text-sm text-text-muted self-center ml-auto">{total} client{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('name')}>
                Name <SortIcon field="name" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('type')}>
                Type <SortIcon field="type" />
              </th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Contacts</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                Created <SortIcon field="createdAt" />
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-text-muted">
                  No clients found. Create your first client above.
                </td>
              </tr>
            )}
            {clients.map((client) => (
              <tr
                key={client.id}
                className="border-b border-border last:border-0 hover:bg-bg/50 cursor-pointer"
                onClick={() => router.push(`/clients/${client.id}`)}
              >
                <td className="px-4 py-3 font-medium text-text">{client.name}</td>
                <td className="px-4 py-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    client.type === 'company'
                      ? 'bg-primary-light text-primary'
                      : 'bg-warning-light text-warning'
                  }`}>
                    {client.type === 'company' ? 'Company' : 'Person'}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{client.emails?.[0]?.email || '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{client.phones?.[0]?.phone || '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{client.type === 'company' ? (client.contactsCount || 0) : '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{new Date(client.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary disabled:opacity-40 hover:bg-border/50"
          >
            Previous
          </button>
          <span className="text-sm text-text-secondary">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text-secondary disabled:opacity-40 hover:bg-border/50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
