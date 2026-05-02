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

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', pricePerPage: '' });
  const router = useRouter();

  const loadTemplates = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    api.get<Template[]>(`/templates?${params}`).then(setTemplates);
  };

  useEffect(() => { loadTemplates(); }, [search]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const created = await api.post<Template>('/templates', {
      name: form.name,
      description: form.description || undefined,
      pricePerPage: form.pricePerPage ? parseFloat(form.pricePerPage) : 0,
    });
    setShowForm(false);
    setForm({ name: '', description: '', pricePerPage: '' });
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">Create & Configure Fields</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="flex gap-3 mb-4">
        <input placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary" />
        <span className="text-sm text-text-muted self-center ml-auto">{templates.length} template{templates.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.length === 0 && (
          <div className="col-span-full bg-surface border border-border rounded-xl p-12 text-center text-text-muted">
            No templates yet. Create your first template above.
          </div>
        )}
        {templates.map((t) => (
          <div
            key={t.id}
            onClick={() => router.push(`/templates/${t.id}`)}
            className="bg-surface border border-border rounded-xl p-5 hover:border-primary/50 cursor-pointer transition-colors"
          >
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
              <span>${Number(t.pricePerPage).toFixed(2)} / page</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
