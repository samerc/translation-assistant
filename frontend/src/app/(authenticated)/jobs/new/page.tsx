'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency } from '@/lib/format';

interface Client { id: string; name: string; type: string; contacts: { id: string; firstName: string; lastName: string }[]; }
interface Language { id: string; code: string; name: string; isActive: boolean; }
interface Template { id: string; type: string; name: string; pricePerPage: number; discountedPricePerPage: number | null; }

interface LineItem {
  key: string;
  description: string;
  templateId?: string;
  pageCount: number;
  pricePerPage: number;
  discountedPricePerPage: number;
  useDiscountedPrice: boolean;
}

export default function NewJobPage() {
  const { baseCurrency } = useSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const preselectedClientId = searchParams.get('clientId');

  const [form, setForm] = useState({
    type: 'template' as 'template' | 'freeform',
    title: '',
    description: '',
    clientId: preselectedClientId || '',
    contactId: '',
    isTranslation: true,
    sourceLanguageId: '',
    targetLanguageId: '',
    status: 'in_progress',
    deadline: '',
    isFreeOfCharge: false,
    freeOfChargeReason: '',
    notes: '',
  });

  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  useEffect(() => {
    api.get<{ data: Client[] }>('/clients?limit=1000').then((res) => setClients(res.data));
    api.get<Language[]>('/settings/languages').then((langs) => setLanguages(langs.filter((l) => l.isActive)));
    api.get<Template[]>('/templates?isActive=true').then(setTemplates);
  }, []);

  const selectedClient = clients.find((c) => c.id === form.clientId);
  const contacts = selectedClient?.contacts || [];

  const addLineItem = () => {
    setLineItems([...lineItems, {
      key: `li_${Date.now()}`, description: '', templateId: undefined,
      pageCount: 1, pricePerPage: 0, discountedPricePerPage: 0, useDiscountedPrice: false,
    }]);
  };

  const updateLineItem = (key: string, updates: Partial<LineItem>) => {
    setLineItems(lineItems.map((li) => li.key === key ? { ...li, ...updates } : li));
  };

  const removeLineItem = (key: string) => {
    setLineItems(lineItems.filter((li) => li.key !== key));
  };

  // Filter templates based on job type
  const availableTemplates = form.type === 'freeform'
    ? templates.filter((t) => t.type === 'simple')
    : templates.filter((t) => t.type !== 'simple');

  const handleTemplateSelect = (key: string, templateId: string) => {
    const tmpl = templates.find((t) => t.id === templateId);
    if (tmpl) {
      updateLineItem(key, {
        templateId,
        description: tmpl.name,
        pricePerPage: tmpl.pricePerPage,
        discountedPricePerPage: tmpl.discountedPricePerPage || 0,
      });
    }
  };

  const getLineTotal = (li: LineItem) => {
    const price = li.useDiscountedPrice && li.discountedPricePerPage ? li.discountedPricePerPage : li.pricePerPage;
    return li.pageCount * price;
  };

  const grandTotal = lineItems.reduce((sum, li) => sum + getLineTotal(li), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const body: Record<string, unknown> = {
        type: form.type,
        title: form.title,
        clientId: form.clientId,
        sourceLanguageId: form.sourceLanguageId,
        status: form.status,
        isFreeOfCharge: form.isFreeOfCharge,
        lineItems: lineItems.map((li) => ({
          description: li.description || 'Untitled',
          templateId: li.templateId || undefined,
          pageCount: Number(li.pageCount) || 1,
          pricePerPage: Number(li.pricePerPage) || 0,
          useDiscountedPrice: li.useDiscountedPrice,
          discountedPricePerPage: li.discountedPricePerPage ? Number(li.discountedPricePerPage) : undefined,
        })),
      };

      if (form.isTranslation && form.targetLanguageId) body.targetLanguageId = form.targetLanguageId;
      if (form.description) body.description = form.description;
      if (form.contactId) body.contactId = form.contactId;
      if (form.deadline) body.deadline = form.deadline;
      if (form.isFreeOfCharge && form.freeOfChargeReason) body.freeOfChargeReason = form.freeOfChargeReason;
      if (form.notes) body.notes = form.notes;

      const job = await api.post<{ id: string }>('/jobs', body);
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

      <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
        {error && <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}

        {/* Basic info */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-text">Job Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Type</label>
              <select value={form.type} onChange={(e) => { setForm({ ...form, type: e.target.value as 'template' | 'freeform' }); setLineItems([]); }} className={inputClass}>
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
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className={`${inputClass} resize-none`} />
          </div>
        </div>

        {/* Client & Language */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-semibold text-text">Client & Languages</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <label className="flex items-center gap-2 text-sm text-text cursor-pointer mb-2">
            <input type="checkbox" checked={form.isTranslation}
              onChange={(e) => setForm({ ...form, isTranslation: e.target.checked, targetLanguageId: '' })}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
            Translation job (has a target language)
          </label>
          <div className={`grid gap-4 ${form.isTranslation ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                {form.isTranslation ? 'Source Language *' : 'Language *'}
              </label>
              <select value={form.sourceLanguageId} onChange={(e) => setForm({ ...form, sourceLanguageId: e.target.value })} required className={inputClass}>
                <option value="">Select...</option>
                {languages.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
              </select>
            </div>
            {form.isTranslation && (
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Target Language *</label>
                <select value={form.targetLanguageId} onChange={(e) => setForm({ ...form, targetLanguageId: e.target.value })} required className={inputClass}>
                  <option value="">Select...</option>
                  {languages.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
                </select>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Deadline</label>
            <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className={inputClass} />
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-text">
              {form.type === 'template' ? 'Templates' : 'Documents'}
            </h3>
            <button type="button" onClick={addLineItem}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover">
              + Add {form.type === 'template' ? 'Template' : 'Document'}
            </button>
          </div>

          {lineItems.length === 0 && (
            <p className="text-sm text-text-muted py-4 text-center">
              No {form.type === 'template' ? 'templates' : 'documents'} added yet.
            </p>
          )}

          <div className="space-y-3">
            {lineItems.map((li) => (
              <div key={li.key} className="border border-border rounded-lg p-4 bg-bg">
                <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                  {/* Template selector */}
                  <div className="col-span-2 md:col-span-4">
                    <label className="block text-xs font-medium text-text mb-1">
                      {form.type === 'template' ? 'Template' : 'Document Type'}
                    </label>
                    <select value={li.templateId || ''} onChange={(e) => handleTemplateSelect(li.key, e.target.value)}
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">Select...</option>
                      {availableTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({formatCurrency(t.pricePerPage, baseCurrency)}/p)</option>)}
                    </select>
                  </div>

                  {/* Pages */}
                  <div className="col-span-1 md:col-span-1">
                    <label className="block text-xs font-medium text-text mb-1">Pages</label>
                    <input type="number" min={1} value={li.pageCount}
                      onChange={(e) => updateLineItem(li.key, { pageCount: parseInt(e.target.value) || 1 })}
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Price */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-text mb-1">Price/Page</label>
                    <input type="number" step="0.01" min={0} value={li.pricePerPage}
                      onChange={(e) => updateLineItem(li.key, { pricePerPage: parseFloat(e.target.value) || 0 })}
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Discounted */}
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-text mb-1">Discounted</label>
                    <input type="number" step="0.01" min={0} value={li.discountedPricePerPage || ''}
                      onChange={(e) => updateLineItem(li.key, { discountedPricePerPage: parseFloat(e.target.value) || 0 })}
                      placeholder="—"
                      className="w-full px-2 py-1.5 bg-surface border border-border rounded text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  {/* Use discount checkbox */}
                  <div className="col-span-1 flex items-center justify-center pb-1">
                    <label className="flex items-center gap-1 text-xs text-text cursor-pointer" title="Use discounted price">
                      <input type="checkbox" checked={li.useDiscountedPrice}
                        onChange={(e) => updateLineItem(li.key, { useDiscountedPrice: e.target.checked })}
                        disabled={!li.discountedPricePerPage}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary" />
                      Disc.
                    </label>
                  </div>

                  {/* Line total + delete */}
                  <div className="col-span-2 flex items-center justify-between pb-1">
                    <span className="text-sm font-semibold text-text">{formatCurrency(getLineTotal(li), baseCurrency)}</span>
                    <button type="button" onClick={() => removeLineItem(li.key)} className="text-xs text-danger hover:text-danger/80">Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Total */}
          {lineItems.length > 0 && (
            <div className="flex justify-end mt-4 pt-4 border-t border-border">
              <div className="text-right">
                <span className="text-sm text-text-secondary mr-4">Total:</span>
                <span className="text-lg font-bold text-text">{formatCurrency(grandTotal, baseCurrency)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Pro bono */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
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
