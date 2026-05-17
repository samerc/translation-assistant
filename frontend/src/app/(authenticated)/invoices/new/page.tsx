'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';

interface ClientOption { id: string; name: string; }
interface JobOption { id: string; jobNumber: string; title: string; calculatedTotal: number; finalPrice: number | null; status: string; clientId: string; client: { id: string; name: string }; }
interface LineItem { description: string; jobId: string; quantity: number; unitPrice: number; }

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillJobId = searchParams.get('jobId');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const prefilled = useRef(false);

  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ description: '', jobId: '', quantity: 1, unitPrice: 0 }]);

  useEffect(() => {
    api.get<{ data: ClientOption[] }>('/clients?limit=100').then((res) => setClients(res.data));
    // Set default due date to 30 days from now
    const due = new Date();
    due.setDate(due.getDate() + 30);
    setDueDate(due.toISOString().split('T')[0]);

    // Pre-fill from job if jobId is in URL
    if (prefillJobId && !prefilled.current) {
      prefilled.current = true;
      api.get<JobOption>(`/jobs/${prefillJobId}`).then((job) => {
        setClientId(job.client.id);
        const price = Number(job.finalPrice ?? job.calculatedTotal);
        setItems([{
          description: `${job.jobNumber} — ${job.title}`,
          jobId: job.id,
          quantity: 1,
          unitPrice: price,
        }]);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (clientId) {
      api.get<{ data: JobOption[] }>(`/jobs?clientId=${clientId}&limit=100`).then((res) => {
        setJobs(res.data.filter((j) => ['delivered', 'in_progress', 'accepted'].includes(j.status)));
      });
    } else {
      setJobs([]);
    }
  }, [clientId]);

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const selectJob = (index: number, jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      const updated = [...items];
      updated[index] = {
        description: `${job.jobNumber} — ${job.title}`,
        jobId: job.id,
        quantity: 1,
        unitPrice: Number(job.finalPrice ?? job.calculatedTotal),
      };
      setItems(updated);
    } else {
      updateItem(index, 'jobId', '');
    }
  };

  const addItem = () => {
    setItems([...items, { description: '', jobId: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const taxAmount = Math.round(subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) { setError('Please select a client'); return; }
    if (items.some((i) => !i.description)) { setError('All items need a description'); return; }
    setError('');
    setSaving(true);
    try {
      const invoice = await api.post<{ id: string }>('/invoices', {
        clientId,
        issueDate,
        dueDate,
        taxRate,
        currency,
        notes,
        items: items.map((i) => ({
          description: i.description,
          jobId: i.jobId || undefined,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      });
      router.push(`/invoices/${invoice.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create invoice';
      setError(msg);
      logger.error('Failed to create invoice', err, 'invoices');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.push('/invoices')} className="text-sm text-text-muted hover:text-text mb-4 inline-block">
        &larr; Back to Invoices
      </button>
      <h1 className="text-2xl font-bold text-text mb-6">New Invoice</h1>

      {error && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Invoice details */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-text mb-4">Invoice Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Client *</label>
              <select value={clientId} onChange={(e) => setClientId(e.target.value)} required
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select client...</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Currency</label>
              <input value={currency} onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Issue Date *</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Due Date *</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Tax Rate (%)</label>
              <input type="number" step="0.01" min="0" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-text-secondary mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
          </div>
        </div>

        {/* Line items */}
        <div className="bg-surface border border-border rounded-xl p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-text">Line Items</h2>
            <button type="button" onClick={addItem}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-hover">
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-2 md:grid-cols-12 gap-3 items-start">
                <div className="col-span-2 md:col-span-5">
                  {i === 0 && <label className="block text-xs font-medium text-text-muted mb-1">Description</label>}
                  <input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)}
                    placeholder="Description..."
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="col-span-2 md:col-span-3">
                  {i === 0 && <label className="block text-xs font-medium text-text-muted mb-1">Link Job</label>}
                  <select value={item.jobId} onChange={(e) => selectJob(i, e.target.value)}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">No linked job</option>
                    {jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNumber} — {j.title}</option>)}
                  </select>
                </div>
                <div className="col-span-1 md:col-span-1">
                  {i === 0 && <label className="block text-xs font-medium text-text-muted mb-1">Qty</label>}
                  <input type="number" min="0" step="0.01" value={item.quantity}
                    onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="col-span-1 md:col-span-2">
                  {i === 0 && <label className="block text-xs font-medium text-text-muted mb-1">Unit Price</label>}
                  <input type="number" min="0" step="0.01" value={item.unitPrice}
                    onChange={(e) => updateItem(i, 'unitPrice', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="col-span-2 md:col-span-1 flex items-end">
                  {i === 0 && <label className="block text-xs font-medium text-text-muted mb-1">&nbsp;</label>}
                  <button type="button" onClick={() => removeItem(i)} disabled={items.length <= 1}
                    className="p-2 text-text-muted hover:text-danger disabled:opacity-30">
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="mt-6 border-t border-border pt-4">
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="text-text font-medium">{currency} {subtotal.toFixed(2)}</span>
                </div>
                {taxRate > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-secondary">Tax ({taxRate}%)</span>
                    <span className="text-text font-medium">{currency} {taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                  <span className="text-text">Total</span>
                  <span className="text-text">{currency} {total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving}
            className="px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Invoice'}
          </button>
          <button type="button" onClick={() => router.push('/invoices')}
            className="px-6 py-2.5 bg-bg border border-border text-text-secondary rounded-lg text-sm font-medium hover:bg-border/50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
