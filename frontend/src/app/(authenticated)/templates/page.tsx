'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency, formatDate } from '@/lib/format';
import { TEMPLATE_TYPE_BADGE } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Field, Input, SearchInput, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { RowChevron, SortableTh, TableCard } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { FileTextIcon, GridIcon, PlusIcon, TableIcon } from '@/components/ui/icons';

interface Template {
  id: string;
  type: 'designer' | 'word' | 'simple';
  name: string;
  description: string | null;
  pricePerPage: number;
  discountedPricePerPage: number | null;
  isActive: boolean;
  fields: { id: string }[];
  createdAt: string;
}

type ViewMode = 'table' | 'cards';

export default function TemplatesPage() {
  const { hasPermission } = useAuth();
  const { baseCurrency } = useSettings();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'designer' as 'designer' | 'word' | 'simple', name: '', description: '', pricePerPage: '', discountedPricePerPage: '' });
  const [view, setView] = useState<ViewMode>('table');
  const router = useRouter();

  // Returns a cancel fn: the effect uses it so only the latest request's response is applied.
  const loadTemplates = () => {
    let ignore = false;
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('isActive', statusFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    api.get<Template[]>(`/templates?${params}`)
      .then((res) => { if (!ignore) { setTemplates(res); setLoadError(false); } })
      .catch(() => { if (!ignore) setLoadError(true); });
    return () => { ignore = true; };
  };

  useEffect(() => loadTemplates(), [debouncedSearch, statusFilter, sortBy, sortOrder]);

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
    setSaving(true);
    try {
      const created = await api.post<Template>('/templates', {
        type: form.type,
        name: form.name,
        description: form.description || undefined,
        pricePerPage: form.pricePerPage ? parseFloat(form.pricePerPage) : 0,
        discountedPricePerPage: form.discountedPricePerPage ? parseFloat(form.discountedPricePerPage) : undefined,
      });
      setShowForm(false);
      setForm({ type: 'designer', name: '', description: '', pricePerPage: '', discountedPricePerPage: '' });
      router.push(`/templates/${created.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create template.');
    } finally {
      setSaving(false);
    }
  };

  const filtered = Boolean(search || statusFilter);
  const empty = templates.length === 0 && !loadError && (
    <EmptyState
      icon={<FileTextIcon />}
      title={filtered ? 'No templates match your filters' : 'No templates yet'}
      description={filtered ? 'Try another name, or clear the status filter.' : 'Templates hold the fields and layout for documents you translate often, like passports or certificates.'}
    />
  );

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Document layouts and per-page pricing."
        actions={hasPermission('templates:create') && (
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowForm(true)}>New template</Button>
        )}
      />

      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 mb-6">
          <h2 className="font-semibold text-text mb-4">New template</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Field label="Type" htmlFor="tpl-type">
              <Select id="tpl-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'designer' | 'word' | 'simple' })}>
                <option value="designer">Designer (build layout)</option>
                <option value="word">Word (upload .docx)</option>
                <option value="simple">Simple (pricing only)</option>
              </Select>
            </Field>
            <Field label="Name" htmlFor="tpl-name" required>
              <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Description" htmlFor="tpl-desc">
              <Input id="tpl-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Price per page" htmlFor="tpl-price">
              <Input id="tpl-price" type="number" step="0.01" min="0" value={form.pricePerPage} onChange={(e) => setForm({ ...form, pricePerPage: e.target.value })} />
            </Field>
            <Field label="Discounted price" htmlFor="tpl-disc">
              <Input id="tpl-disc" type="number" step="0.01" min="0" value={form.discountedPricePerPage} placeholder="Optional"
                onChange={(e) => setForm({ ...form, discountedPricePerPage: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Create & configure fields'}</Button>
            <Button onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {loadError && <Alert className="mb-4">Couldn&apos;t load templates. Please refresh or try again.</Alert>}

      {/* Filters + view toggle */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <SearchInput placeholder="Search templates…" aria-label="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} />
        <SegmentedControl
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: '', label: 'All' },
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
        />
        <span className="text-sm text-text-muted ml-auto tabular-nums">{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
        <SegmentedControl<ViewMode>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'table', label: <TableIcon />, title: 'Table view' },
            { value: 'cards', label: <GridIcon />, title: 'Card view' },
          ]}
        />
      </div>

      {/* Table view */}
      {view === 'table' && (
        <TableCard minWidth={760}>
          <thead>
            <tr>
              <SortableTh field="name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Name</SortableTh>
              <th>Type</th>
              <th className="text-right">Fields</th>
              <SortableTh field="pricePerPage" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} className="text-right">Price / page</SortableTh>
              <th className="text-right">Discounted</th>
              <th>Status</th>
              <SortableTh field="createdAt" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort}>Created</SortableTh>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {empty && <tr><td colSpan={8}>{empty}</td></tr>}
            {templates.map((t) => (
              <tr key={t.id} data-href onClick={() => router.push(`/templates/${t.id}`)}>
                <td className="max-w-sm">
                  <div className="font-semibold text-text truncate">{t.name}</div>
                  {t.description && <div className="text-xs text-text-muted truncate">{t.description}</div>}
                </td>
                <td><TemplateTypeBadge type={t.type} /></td>
                <td className="text-right tabular-nums">{t.type === 'simple' ? '—' : t.fields.length}</td>
                <td className="text-right tabular-nums text-text font-medium whitespace-nowrap">{formatCurrency(t.pricePerPage, baseCurrency)}</td>
                <td className="text-right tabular-nums whitespace-nowrap">
                  {t.discountedPricePerPage ? formatCurrency(t.discountedPricePerPage, baseCurrency) : '—'}
                </td>
                <td><ActiveBadge active={t.isActive} /></td>
                <td className="tabular-nums whitespace-nowrap">{formatDate(t.createdAt)}</td>
                <RowChevron />
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}

      {/* Card view */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {empty && <div className="col-span-full card">{empty}</div>}
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => router.push(`/templates/${t.id}`)}
              className="card p-5 text-left flex flex-col gap-3 hover:border-border-strong hover:shadow-md transition-[box-shadow,border-color]">
              <div className="flex justify-between items-start gap-3 w-full">
                <div className="min-w-0">
                  <h3 className="font-semibold text-text truncate">{t.name}</h3>
                  <div className="mt-1.5"><TemplateTypeBadge type={t.type} /></div>
                </div>
                <ActiveBadge active={t.isActive} />
              </div>
              {t.description && <p className="text-sm text-text-secondary line-clamp-2">{t.description}</p>}
              <div className="mt-auto pt-3 border-t border-border flex justify-between text-xs text-text-muted w-full">
                <span>{t.type === 'simple' ? 'Pricing only' : `${t.fields.length} field${t.fields.length !== 1 ? 's' : ''}`}</span>
                <span className="tabular-nums">
                  <span className="text-text font-semibold">{formatCurrency(t.pricePerPage, baseCurrency)}</span> / page
                  {t.discountedPricePerPage && <span className="text-success"> ({formatCurrency(t.discountedPricePerPage, baseCurrency)})</span>}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const TEMPLATE_TYPE_LABEL: Record<string, string> = { designer: 'Designer', word: 'Word', simple: 'Simple' };

function TemplateTypeBadge({ type }: { type: string }) {
  return <Badge tone={TEMPLATE_TYPE_BADGE[type] ?? TEMPLATE_TYPE_BADGE.designer}>{TEMPLATE_TYPE_LABEL[type] ?? type}</Badge>;
}

function ActiveBadge({ active }: { active: boolean }) {
  return <Badge dot tone={active ? 'tone tone-success' : 'tone tone-neutral'}>{active ? 'Active' : 'Inactive'}</Badge>;
}
