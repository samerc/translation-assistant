'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';
import { formatDate, initials } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Pagination, RowChevron, SortableTh, TableCard } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { BuildingIcon, PlusIcon, UserIcon, UsersIcon } from '@/components/ui/icons';

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
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'company' as 'company' | 'person', name: '', taxId: '', notes: '' });
  const router = useRouter();

  // Returns a cancel fn: the effect uses it so only the latest request's response is applied.
  const loadClients = () => {
    let ignore = false;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (typeFilter) params.set('type', typeFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    params.set('page', String(page));
    params.set('limit', '25');

    api.get<ClientsResponse>(`/clients?${params}`).then((res) => {
      if (ignore) return;
      setLoadError(false);
      setClients(res.data);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    }).catch(() => { if (!ignore) setLoadError(true); });
    return () => { ignore = true; };
  };

  useEffect(() => loadClients(), [debouncedSearch, typeFilter, sortBy, sortOrder, page]);

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
    if (saving) return;
    const body: Record<string, string> = { type: form.type, name: form.name };
    if (form.taxId) body.taxId = form.taxId;
    if (form.notes) body.notes = form.notes;
    setSaving(true);
    try {
      const created = await api.post<{ id: string }>('/clients', body);
      // Straight to the new client, where emails, phones and addresses are added.
      router.push(`/clients/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create client.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Companies and people you translate for."
        actions={hasPermission('clients:create') && (
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowForm(true)}>New client</Button>
        )}
      />

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6">
          <h2 className="font-semibold text-text mb-4">New client</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Type" htmlFor="client-type">
              <Select id="client-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'company' | 'person' })}>
                <option value="company">Company</option>
                <option value="person">Person</option>
              </Select>
            </Field>
            <Field label="Name" htmlFor="client-name" required>
              <Input id="client-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Tax ID" htmlFor="client-tax">
              <Input id="client-tax" value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-text-muted mt-3">You can add emails, phones and addresses on the next screen.</p>
          <div className="flex gap-2 mt-4">
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Create client'}</Button>
            <Button onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {loadError && <Alert className="mb-4">Couldn&apos;t load clients. Please refresh or try again.</Alert>}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <SearchInput
          aria-label="Search clients"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <SegmentedControl
          label="Client type"
          value={typeFilter}
          onChange={(v) => { setTypeFilter(v); setPage(1); }}
          options={[
            { value: '', label: 'All' },
            { value: 'company', label: 'Companies' },
            { value: 'person', label: 'People' },
          ]}
        />
      </div>

      <TableCard
        minWidth={680}
        footer={<Pagination page={page} totalPages={totalPages} total={total} pageSize={25} noun={total === 1 ? 'client' : 'clients'} onPage={setPage} />}
      >
        <thead>
          <tr>
            <SortableTh field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Name</SortableTh>
            <SortableTh field="type" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Type</SortableTh>
            <th>Phone</th>
            <th>Contacts</th>
            <SortableTh field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Created</SortableTh>
            <th aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 && !loadError && (
            <tr>
              <td colSpan={6}>
                <EmptyState
                  icon={<UsersIcon />}
                  title={search || typeFilter ? 'No clients match your filters' : 'No clients yet'}
                  description={search || typeFilter ? 'Try another name, or clear the filters.' : 'Add the companies and people you translate for.'}
                />
              </td>
            </tr>
          )}
          {clients.map((client) => (
            <tr key={client.id} data-href onClick={() => router.push(`/clients/${client.id}`)}>
              <td>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 grid place-items-center flex-none text-xs font-semibold bg-primary-light text-primary-text ${client.type === 'company' ? 'rounded-lg' : 'rounded-full'}`}>
                    {initials(client.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-text truncate">{client.name}</div>
                    <div className="text-xs text-text-muted truncate">{client.emails?.[0]?.email || 'No email'}</div>
                  </div>
                </div>
              </td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  {client.type === 'company' ? <BuildingIcon className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                  {client.type === 'company' ? 'Company' : 'Person'}
                </span>
              </td>
              <td className="tabular-nums">{client.phones?.[0]?.phone || '—'}</td>
              <td className="tabular-nums">{client.type === 'company' ? (client.contactsCount || 0) : '—'}</td>
              <td className="tabular-nums">{formatDate(client.createdAt)}</td>
              <RowChevron />
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
