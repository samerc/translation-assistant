'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Client { id: number; name: string; type: string; contacts: { id: number; firstName: string; lastName: string }[]; }
interface Language { id: number; code: string; name: string; isActive: boolean; }

export default function NewJobPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const preselectedClientId = searchParams.get('clientId');

  const [form, setForm] = useState({
    type: 'template' as 'template' | 'freeform',
    title: '',
    description: '',
    clientId: preselectedClientId || '',
    contactId: '',
    sourceLanguageId: '',
    targetLanguageId: '',
    status: 'in_progress',
    deadline: '',
    pageCount: '1',
    pricePerPage: '',
    discountedPricePerPage: '',
    useDiscountedPrice: false,
    isFreeOfCharge: false,
    freeOfChargeReason: '',
    notes: '',
  });

  useEffect(() => {
    api.get<{ data: Client[] }>('/clients?limit=1000').then((res) => setClients(res.data));
    api.get<Language[]>('/settings/languages').then((langs) => setLanguages(langs.filter((l) => l.isActive)));
  }, []);

  const selectedClient = clients.find((c) => c.id === parseInt(form.clientId));
  const contacts = selectedClient?.contacts || [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        type: form.type,
        title: form.title,
        clientId: parseInt(form.clientId),
        sourceLanguageId: parseInt(form.sourceLanguageId),
        targetLanguageId: parseInt(form.targetLanguageId),
        status: form.status,
        pageCount: parseInt(form.pageCount) || 1,
        isFreeOfCharge: form.isFreeOfCharge,
      };

      if (form.description) body.description = form.description;
      if (form.contactId) body.contactId = parseInt(form.contactId);
      if (form.deadline) body.deadline = form.deadline;
      if (form.pricePerPage) body.pricePerPage = parseFloat(form.pricePerPage);
      if (form.discountedPricePerPage) body.discountedPricePerPage = parseFloat(form.discountedPricePerPage);
      if (form.useDiscountedPrice) body.useDiscountedPrice = true;
      if (form.isFreeOfCharge && form.freeOfChargeReason) body.freeOfChargeReason = form.freeOfChargeReason;
      if (form.notes) body.notes = form.notes;

      const job = await api.post<{ id: number }>('/jobs', body);
      router.push(`/jobs/${job.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    }
    setSaving(false);
  };

  const inputClass = "w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div>
      <button onClick={() => router.push('/jobs')} className="text-sm text-text-secondary hover:text-primary mb-4 inline-block">← Back to Jobs</button>
      <h1 className="text-2xl font-bold text-text mb-6">New Job</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}

        {/* Basic info */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-text">Job Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'template' | 'freeform' })} className={inputClass}>
                <option value="template">Template-based</option>
                <option value="freeform">Free-form</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputClass}>
                <option value="quote">Quote</option>
                <option value="accepted">Accepted</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="Birth Certificate Translation" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
          </div>
        </div>

        {/* Client & Language */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-text">Client & Languages</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Client *</label>
              <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value, contactId: '' })} required className={inputClass}>
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {selectedClient?.type === 'company' && contacts.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Contact Person</label>
                <select value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} className={inputClass}>
                  <option value="">None</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Source Language *</label>
              <select value={form.sourceLanguageId} onChange={(e) => setForm({ ...form, sourceLanguageId: e.target.value })} required className={inputClass}>
                <option value="">Select...</option>
                {languages.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Target Language *</label>
              <select value={form.targetLanguageId} onChange={(e) => setForm({ ...form, targetLanguageId: e.target.value })} required className={inputClass}>
                <option value="">Select...</option>
                {languages.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-text">Pricing</h3>
          <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
            <input type="checkbox" checked={form.isFreeOfCharge} onChange={(e) => setForm({ ...form, isFreeOfCharge: e.target.checked })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            Free of charge (pro bono)
          </label>
          {form.isFreeOfCharge && (
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Reason</label>
              <input value={form.freeOfChargeReason} onChange={(e) => setForm({ ...form, freeOfChargeReason: e.target.value })} placeholder="Optional" className={inputClass} />
            </div>
          )}
          {!form.isFreeOfCharge && (
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Pages</label>
                <input type="number" min={1} value={form.pageCount} onChange={(e) => setForm({ ...form, pageCount: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Price/Page</label>
                <input type="number" step="0.01" min={0} value={form.pricePerPage} onChange={(e) => setForm({ ...form, pricePerPage: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Discounted</label>
                <input type="number" step="0.01" min={0} value={form.discountedPricePerPage} onChange={(e) => setForm({ ...form, discountedPricePerPage: e.target.value })} placeholder="Optional" className={inputClass} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer pb-2">
                  <input type="checkbox" checked={form.useDiscountedPrice} onChange={(e) => setForm({ ...form, useDiscountedPrice: e.target.checked })}
                    disabled={!form.discountedPricePerPage}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                  Use discounted
                </label>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Deadline</label>
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputClass} />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <label className="block text-sm font-medium text-text mb-1.5">Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className={`${inputClass} resize-none`} />
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Job'}
          </button>
          <button type="button" onClick={() => router.push('/jobs')} className="px-6 py-2.5 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
        </div>
      </form>
    </div>
  );
}
