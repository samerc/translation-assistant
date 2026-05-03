'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Template {
  id: number;
  name: string;
  description: string | null;
  pricePerPage: number;
  discountedPricePerPage: number | null;
  isActive: boolean;
  fields: { id: number }[];
  createdAt: string;
}

type ViewMode = 'table' | 'cards';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', pricePerPage: '', discountedPricePerPage: '' });
  const [view, setView] = useState<ViewMode>('table');
  const router = useRouter();

  const loadTemplates = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('isActive', statusFilter);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    api.get<Template[]>(`/templates?${params}`).then(setTemplates);
  };

  useEffect(() => { loadTemplates(); }, [search, statusFilter, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return <span className="text-text-muted ml-1">↕</span>;
    return <span className="text-primary ml-1">{sortOrder === 'ASC' ? '↑' : '↓'}</span>;
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const created = await api.post<Template>('/templates', {
      name: form.name,
      description: form.description || undefined,
      pricePerPage: form.pricePerPage ? parseFloat(form.pricePerPage) : 0,
      discountedPricePerPage: form.discountedPricePerPage ? parseFloat(form.discountedPricePerPage) : undefined,
    });
    setShowForm(false);
    setForm({ name: '', description: '', pricePerPage: '', discountedPricePerPage: '' });
    router.push(`/templates/${created.id}`);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text">Templates</h1>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          + New Template
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface border border-border rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-text mb-4">New Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Description</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Price per Page</label>
              <input type="number" step="0.01" min="0" value={form.pricePerPage} onChange={(e) => setForm({ ...form, pricePerPage: e.target.value })}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Discounted Price</label>
              <input type="number" step="0.01" min="0" value={form.discountedPricePerPage} onChange={(e) => setForm({ ...form, discountedPricePerPage: e.target.value })}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Create & Configure Fields</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters + view toggle */}
      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
          <option value="">All Statuses</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <span className="text-sm text-text-muted ml-auto mr-3">{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
        <div className="flex border border-border rounded-lg overflow-hidden">
          <button onClick={() => setView('table')}
            className={`p-2 transition-colors ${view === 'table' ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:bg-border/50'}`}
            title="Table view">
            <TableIcon className="w-4 h-4" />
          </button>
          <button onClick={() => setView('cards')}
            className={`p-2 transition-colors ${view === 'cards' ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:bg-border/50'}`}
            title="Card view">
            <GridIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table view */}
      {view === 'table' && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('name')}>
                  Name <SortIcon field="name" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Description</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Fields</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('pricePerPage')}>
                  Price/Page <SortIcon field="pricePerPage" />
                </th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Discounted</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary cursor-pointer select-none" onClick={() => handleSort('createdAt')}>
                  Created <SortIcon field="createdAt" />
                </th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-text-muted">No templates found.</td></tr>
              )}
              {templates.map((t) => (
                <tr key={t.id} onClick={() => router.push(`/templates/${t.id}`)}
                  className="border-b border-border last:border-0 hover:bg-bg/50 cursor-pointer">
                  <td className="px-4 py-3 font-medium text-text">{t.name}</td>
                  <td className="px-4 py-3 text-text-secondary max-w-xs truncate">{t.description || '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{t.fields.length}</td>
                  <td className="px-4 py-3 text-text-secondary">${Number(t.pricePerPage).toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {t.discountedPricePerPage ? `$${Number(t.discountedPricePerPage).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      t.isActive ? 'bg-success-light text-success' : 'bg-bg text-text-muted'
                    }`}>
                      {t.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card view */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.length === 0 && (
            <div className="col-span-full bg-surface border border-border rounded-xl p-12 text-center text-text-muted">
              No templates found.
            </div>
          )}
          {templates.map((t) => (
            <div key={t.id} onClick={() => router.push(`/templates/${t.id}`)}
              className="bg-surface border border-border rounded-xl p-5 hover:border-primary/50 cursor-pointer transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-text">{t.name}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  t.isActive ? 'bg-success-light text-success' : 'bg-bg text-text-muted'
                }`}>
                  {t.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {t.description && <p className="text-sm text-text-secondary mb-3 line-clamp-2">{t.description}</p>}
              <div className="flex justify-between text-xs text-text-muted">
                <span>{t.fields.length} field{t.fields.length !== 1 ? 's' : ''}</span>
                <div className="flex gap-2">
                  <span>${Number(t.pricePerPage).toFixed(2)} / page</span>
                  {t.discountedPricePerPage && (
                    <span className="text-success">(${Number(t.discountedPricePerPage).toFixed(2)})</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Icons ──

function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 4a3 3 0 00-3 3v6a3 3 0 003 3h10a3 3 0 003-3V7a3 3 0 00-3-3H5zm-1 9v-1h5v2H5a1 1 0 01-1-1zm7 1h4a1 1 0 001-1v-1h-5v2zm0-4h5V8h-5v2zM9 8H4v2h5V8z" clipRule="evenodd" />
    </svg>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}
