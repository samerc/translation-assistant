'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';

interface InvoiceItem {
  id: string;
  description: string;
  jobId: string | null;
  job: { id: string; jobNumber: string; title: string } | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  client: { id: string; name: string; taxId: string | null };
  status: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  notes: string | null;
  paidAt: string | null;
  paidAmount: number | null;
  items: InvoiceItem[];
  createdAt: string;
}

const STATUSES = [
  { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-600' },
  { value: 'sent', label: 'Sent', color: 'bg-sky-100 text-sky-700' },
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'overdue', label: 'Overdue', color: 'bg-danger-light text-danger' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-gray-100 text-gray-500' },
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: ['draft'],
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ issueDate: '', dueDate: '', taxRate: 0, currency: '', notes: '' });

  const loadInvoice = () => {
    api.get<Invoice>(`/invoices/${id}`).then((inv) => {
      setInvoice(inv);
      setLoading(false);
    }).catch((err) => {
      logger.error('Failed to load invoice', err, 'invoices');
      setError('Failed to load invoice');
      setLoading(false);
    });
  };

  useEffect(() => { loadInvoice(); }, [id]);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === 'paid') {
      setPaymentAmount(String(invoice?.total || 0));
      setShowPaymentModal(true);
      return;
    }
    try {
      await api.patch(`/invoices/${id}/status`, { status: newStatus });
      loadInvoice();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setError(msg);
      logger.error('Failed to update status', err, 'invoices');
    }
  };

  const handleRecordPayment = async () => {
    setSaving(true);
    try {
      await api.post(`/invoices/${id}/record-payment`, {
        paidAmount: Number(paymentAmount),
        paidAt: paymentDate,
      });
      setShowPaymentModal(false);
      loadInvoice();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment';
      setError(msg);
      logger.error('Failed to record payment', err, 'invoices');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this draft invoice?')) return;
    try {
      await api.delete(`/invoices/${id}`);
      router.push('/invoices');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete invoice';
      setError(msg);
      logger.error('Failed to delete invoice', err, 'invoices');
    }
  };

  const handleExport = async (format: 'pdf' | 'word') => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/invoices/${id}/export-${format}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoice?.invoiceNumber || 'invoice'}.${format === 'pdf' ? 'pdf' : 'docx'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setError(msg);
      logger.error(`Failed to export invoice as ${format}`, err, 'invoices');
    }
  };

  const startEditing = () => {
    if (!invoice) return;
    setEditForm({
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      taxRate: Number(invoice.taxRate),
      currency: invoice.currency,
      notes: invoice.notes || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await api.patch(`/invoices/${id}`, {
        issueDate: editForm.issueDate,
        dueDate: editForm.dueDate,
        taxRate: editForm.taxRate,
        currency: editForm.currency,
        notes: editForm.notes || undefined,
      });
      setEditing(false);
      loadInvoice();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes';
      setError(msg);
      logger.error('Failed to save invoice', err, 'invoices');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!invoice) {
    return <div className="text-center py-12 text-text-muted">Invoice not found</div>;
  }

  const isOverdue = invoice.status === 'sent' && new Date(invoice.dueDate) < new Date();
  const effectiveStatus = isOverdue ? 'overdue' : invoice.status;
  const badge = STATUSES.find((s) => s.value === effectiveStatus) || { label: invoice.status, color: 'bg-bg text-text-secondary' };
  const nextStatuses = VALID_TRANSITIONS[invoice.status] || [];

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.push('/invoices')} className="text-sm text-text-muted hover:text-text mb-4 inline-block">
        &larr; Back to Invoices
      </button>

      {error && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">{invoice.invoiceNumber}</h1>
          <p className="text-text-secondary mt-1">{invoice.client.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>{badge.label}</span>
          <button onClick={() => handleExport('pdf')}
            className="px-3 py-1.5 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50 flex items-center gap-1.5">
            <ExportIcon className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => handleExport('word')}
            className="px-3 py-1.5 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50 flex items-center gap-1.5">
            <ExportIcon className="w-4 h-4" /> Word
          </button>
          {invoice.status === 'draft' && !editing && (
            <button onClick={startEditing}
              className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
              Edit
            </button>
          )}
          {nextStatuses.length > 0 && (
            <select value="" onChange={(e) => e.target.value && handleStatusChange(e.target.value)}
              className="px-3 py-1.5 bg-bg border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Change status...</option>
              {nextStatuses.map((s) => {
                const st = STATUSES.find((x) => x.value === s);
                return <option key={s} value={s}>{st?.label || s}</option>;
              })}
            </select>
          )}
          {invoice.status === 'draft' && (
            <button onClick={handleDelete}
              className="px-3 py-1.5 bg-danger-light text-danger rounded-lg text-sm hover:bg-danger hover:text-white">
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Invoice details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Invoice Details</h3>
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Issue Date</label>
                <input type="date" value={editForm.issueDate} onChange={(e) => setEditForm({ ...editForm, issueDate: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Due Date</label>
                <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Tax Rate (%)</label>
                <input type="number" step="0.01" min="0" value={editForm.taxRate} onChange={(e) => setEditForm({ ...editForm, taxRate: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Currency</label>
                <input value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Issue Date</span><span className="text-text">{new Date(invoice.issueDate).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Due Date</span><span className="text-text">{new Date(invoice.dueDate).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Currency</span><span className="text-text">{invoice.currency}</span></div>
              {invoice.client.taxId && (
                <div className="flex justify-between"><span className="text-text-muted">Client Tax ID</span><span className="text-text">{invoice.client.taxId}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="bg-surface border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Payment Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-text-muted">Subtotal</span><span className="text-text">{invoice.currency} {Number(invoice.subtotal).toFixed(2)}</span></div>
            {Number(invoice.taxRate) > 0 && (
              <div className="flex justify-between"><span className="text-text-muted">Tax ({invoice.taxRate}%)</span><span className="text-text">{invoice.currency} {Number(invoice.taxAmount).toFixed(2)}</span></div>
            )}
            <div className="flex justify-between font-bold border-t border-border pt-2"><span className="text-text">Total</span><span className="text-text">{invoice.currency} {Number(invoice.total).toFixed(2)}</span></div>
            {invoice.paidAmount !== null && (
              <>
                <div className="flex justify-between text-success"><span>Paid</span><span>{invoice.currency} {Number(invoice.paidAmount).toFixed(2)}</span></div>
                {invoice.paidAt && (
                  <div className="flex justify-between"><span className="text-text-muted">Paid on</span><span className="text-text">{new Date(invoice.paidAt).toLocaleDateString()}</span></div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-2">Notes</h3>
          <p className="text-sm text-text whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Line items */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-secondary">Line Items</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Description</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Linked Job</th>
              <th className="text-right px-4 py-3 font-semibold text-text-secondary">Qty</th>
              <th className="text-right px-4 py-3 font-semibold text-text-secondary">Unit Price</th>
              <th className="text-right px-4 py-3 font-semibold text-text-secondary">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-text">{item.description}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {item.job ? (
                    <button onClick={() => router.push(`/jobs/${item.job!.id}`)}
                      className="text-primary hover:underline text-xs font-mono">
                      {item.job.jobNumber}
                    </button>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-text text-right">{Number(item.quantity)}</td>
                <td className="px-4 py-3 text-text text-right">{invoice.currency} {Number(item.unitPrice).toFixed(2)}</td>
                <td className="px-4 py-3 text-text font-medium text-right">{invoice.currency} {Number(item.lineTotal).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-text mb-4">Record Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Amount</label>
                <input type="number" step="0.01" min="0" value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Payment Date</label>
                <input type="date" value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleRecordPayment} disabled={saving}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
                {saving ? 'Saving...' : 'Record Payment'}
              </button>
              <button onClick={() => setShowPaymentModal(false)}
                className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}
