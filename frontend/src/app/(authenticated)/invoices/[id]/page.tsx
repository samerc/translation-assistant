'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { INVOICE_STATUS_BADGE } from '@/lib/status';
import { logger } from '@/lib/logger';
import { confirmDialog } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { formatDate, todayLocal } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { RequirePermission } from '@/components/RequirePermission';

interface InvoiceItem {
  id: string;
  description: string;
  jobId: string | null;
  job: { id: string; jobNumber: string; title: string } | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Payment {
  id: string;
  amount: number;
  paidAt: string;
  method: string | null;
  note: string | null;
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
  payments: Payment[];
  createdAt: string;
}

const STATUSES = [
  { value: 'draft', label: 'Draft', color: INVOICE_STATUS_BADGE.draft },
  { value: 'sent', label: 'Sent', color: INVOICE_STATUS_BADGE.sent },
  { value: 'paid', label: 'Paid', color: INVOICE_STATUS_BADGE.paid },
  { value: 'overdue', label: 'Overdue', color: INVOICE_STATUS_BADGE.overdue },
  { value: 'cancelled', label: 'Cancelled', color: INVOICE_STATUS_BADGE.cancelled },
];

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  // 'paid' is reached by recording payments, not picked here
  sent: ['overdue', 'cancelled'],
  overdue: ['cancelled'],
  paid: [],
  cancelled: ['draft'],
};

/** Still owed after payments so far. */
function balanceDue(invoice: Invoice): number {
  const owed = Number(invoice.total) - Number(invoice.paidAmount ?? 0);
  return Math.max(0, Math.round(owed * 100) / 100);
}

function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => todayLocal());
  const now = useNow();
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ issueDate: '', dueDate: '', taxRate: 0, currency: '', notes: '' });
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

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

  const openPaymentModal = () => {
    if (!invoice) return;
    setPaymentAmount(balanceDue(invoice).toFixed(2));
    setPaymentMethod('');
    setPaymentNote('');
    setPaymentDate(todayLocal());
    setShowPaymentModal(true);
  };

  const handleDeletePayment = async (payment: Payment) => {
    if (!invoice) return;
    const ok = await confirmDialog(`Delete the payment of ${invoice.currency} ${Number(payment.amount).toFixed(2)} from ${formatDate(payment.paidAt)}?`);
    if (!ok) return;
    try {
      await api.delete(`/invoices/${id}/payments/${payment.id}`);
      toast.success('Payment deleted');
      loadInvoice();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete payment');
      logger.error('Failed to delete payment', err, 'invoices');
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.patch(`/invoices/${id}/status`, { status: newStatus });
      toast.success(`Invoice marked ${newStatus}`);
      loadInvoice();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      toast.error(msg);
      logger.error('Failed to update status', err, 'invoices');
    }
  };

  const handleRecordPayment = async () => {
    const amount = Number(paymentAmount);
    if (paymentAmount.trim() === '' || !Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a payment amount greater than zero.');
      return;
    }
    setSaving(true);
    try {
      await api.post(`/invoices/${id}/record-payment`, {
        paidAmount: amount,
        paidAt: paymentDate,
        method: paymentMethod.trim() || undefined,
        note: paymentNote.trim() || undefined,
      });
      setShowPaymentModal(false);
      toast.success('Payment recorded');
      loadInvoice();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record payment';
      toast.error(msg);
      logger.error('Failed to record payment', err, 'invoices');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!(await confirmDialog('Delete this draft invoice?'))) return;
    try {
      await api.delete(`/invoices/${id}`);
      toast.success('Invoice deleted');
      router.push('/invoices');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete invoice';
      toast.error(msg);
      logger.error('Failed to delete invoice', err, 'invoices');
    }
  };

  const handleExport = async (format: 'pdf' | 'word') => {
    try {
      await api.download(
        `/invoices/${id}/export-${format}`,
        `${invoice?.invoiceNumber || 'invoice'}.${format === 'pdf' ? 'pdf' : 'docx'}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      toast.error(msg);
      logger.error(`Failed to export invoice as ${format}`, err, 'invoices');
    }
  };

  const handleEmailInvoice = async () => {
    setSendingEmail(true);
    try {
      const res = await api.post<{ sent: boolean; to: string }>(`/invoices/${id}/email`, {
        email: emailTo.trim() || undefined,
        message: emailMessage.trim() || undefined,
      });
      setShowEmailModal(false);
      setEmailTo('');
      setEmailMessage('');
      toast.success(`Invoice emailed to ${res.to}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send email';
      toast.error(msg);
      logger.error('Failed to email invoice', err, 'invoices');
    } finally {
      setSendingEmail(false);
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
        notes: editForm.notes,
      });
      setEditing(false);
      toast.success('Changes saved');
      loadInvoice();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save changes';
      toast.error(msg);
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

  // Overdue only once the local date is past the due date (due dates are YYYY-MM-DD).
  const isOverdue = invoice.status === 'sent' && invoice.dueDate.slice(0, 10) < todayLocal(now);
  const effectiveStatus = isOverdue ? 'overdue' : invoice.status;
  const found = STATUSES.find((s) => s.value === effectiveStatus) || { label: invoice.status, color: 'bg-bg text-text-secondary' };
  const balance = balanceDue(invoice);
  const canPay = ['sent', 'overdue'].includes(invoice.status);
  const partlyPaid = canPay && Number(invoice.paidAmount) > 0;
  const badge = partlyPaid ? { ...found, label: `${found.label} · partially paid` } : found;
  const nextStatuses = VALID_TRANSITIONS[invoice.status] || [];

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.push('/invoices')} className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text transition-colors mb-3">
        &larr; Back to Invoices
      </button>

      {error && <div className="mb-4 p-3 tone tone-danger rounded-lg text-sm">{error}</div>}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-text">{invoice.invoiceNumber}</h1>
          <p className="text-text-secondary mt-1">{invoice.client.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${badge.color}`}>{badge.label}</span>
          <button onClick={() => handleExport('pdf')}
            className="btn btn-secondary btn-sm">
            <ExportIcon className="w-4 h-4" /> PDF
          </button>
          <button onClick={() => handleExport('word')}
            className="btn btn-secondary btn-sm">
            <ExportIcon className="w-4 h-4" /> Word
          </button>
          <button onClick={() => { setEmailTo(''); setEmailMessage(''); setShowEmailModal(true); }}
            className="btn btn-secondary btn-sm">
            <EmailIcon className="w-4 h-4" /> Email
          </button>
          {invoice.status === 'draft' && !editing && (
            <button onClick={startEditing}
              className="btn btn-primary btn-sm">
              Edit
            </button>
          )}
          {canPay && (
            <button onClick={openPaymentModal}
              className="btn btn-primary btn-sm">
              Record Payment
            </button>
          )}
          {nextStatuses.length > 0 && (
            <select value="" onChange={(e) => e.target.value && handleStatusChange(e.target.value)}
              aria-label="Change invoice status" className="input h-8 px-2 w-auto">
              <option value="">Change status...</option>
              {nextStatuses.map((s) => {
                const st = STATUSES.find((x) => x.value === s);
                return <option key={s} value={s}>{st?.label || s}</option>;
              })}
            </select>
          )}
          {invoice.status === 'draft' && (
            <button onClick={handleDelete}
              className="btn btn-danger btn-sm">
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Invoice details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-text-secondary mb-3">Invoice Details</h3>
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Issue Date</label>
                <input type="date" value={editForm.issueDate} onChange={(e) => setEditForm({ ...editForm, issueDate: e.target.value })}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Due Date</label>
                <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Tax Rate (%)</label>
                <input type="number" step="0.01" min="0" value={editForm.taxRate} onChange={(e) => setEditForm({ ...editForm, taxRate: Number(e.target.value) })}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Currency</label>
                <input value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Notes</label>
                <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={3}
                  className="input w-full resize-y" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={saveEdit} disabled={saving}
                  className="btn btn-primary">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="btn btn-secondary">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-text-muted">Issue Date</span><span className="text-text">{formatDate(invoice.issueDate)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Due Date</span><span className="text-text">{formatDate(invoice.dueDate)}</span></div>
              <div className="flex justify-between"><span className="text-text-muted">Currency</span><span className="text-text">{invoice.currency}</span></div>
              {invoice.client.taxId && (
                <div className="flex justify-between"><span className="text-text-muted">Client Tax ID</span><span className="text-text">{invoice.client.taxId}</span></div>
              )}
            </div>
          )}
        </div>

        <div className="card p-5">
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
                {balance > 0 && (
                  <div className="flex justify-between font-semibold text-danger"><span>Balance due</span><span>{invoice.currency} {balance.toFixed(2)}</span></div>
                )}
                {invoice.paidAt && (
                  <div className="flex justify-between"><span className="text-text-muted">Paid in full on</span><span className="text-text">{formatDate(invoice.paidAt)}</span></div>
                )}
              </>
            )}
          </div>
          {invoice.payments?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Payments</h4>
              <ul className="space-y-2 text-sm">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex justify-between items-start gap-3">
                    <div>
                      <div className="text-text">{formatDate(p.paidAt)}{p.method && <span className="text-text-muted"> · {p.method}</span>}</div>
                      {p.note && <div className="text-xs text-text-muted">{p.note}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-text">{invoice.currency} {Number(p.amount).toFixed(2)}</span>
                      {invoice.status !== 'cancelled' && (
                        <button onClick={() => handleDeletePayment(p)} className="text-xs text-danger hover:underline">Delete</button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-2">Notes</h3>
          <p className="text-sm text-text whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Line items */}
      <div className="card overflow-x-auto mb-6">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-secondary">Line Items</h3>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th className="text-left">Description</th>
              <th className="text-left">Linked Job</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit Price</th>
              <th className="text-right">Total</th>
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
          <div className="card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-text mb-1">Record Payment</h3>
            <p className="text-sm text-text-muted mb-4">Balance due: {invoice.currency} {balance.toFixed(2)} — record the full amount or part of it.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Amount</label>
                <input type="number" step="0.01" min="0.01" max={balance} value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Payment Date</label>
                <input type="date" value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Method <span className="text-text-muted font-normal">(optional)</span></label>
                <input type="text" maxLength={50} value={paymentMethod} placeholder="Bank transfer, cash, card…"
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Note <span className="text-text-muted font-normal">(optional)</span></label>
                <input type="text" maxLength={255} value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="input w-full" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleRecordPayment} disabled={saving}
                className="btn btn-primary">
                {saving ? 'Saving...' : 'Record Payment'}
              </button>
              <button onClick={() => setShowPaymentModal(false)}
                className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email invoice modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-text mb-1">Email invoice {invoice.invoiceNumber}</h3>
            <p className="text-sm text-text-secondary mb-4">The invoice PDF is attached automatically.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Recipient</label>
                <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="Leave blank to use the client's email on file"
                  className="input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Message (optional)</label>
                <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={3}
                  placeholder="A short note to include in the email body"
                  className="input w-full resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleEmailInvoice} disabled={sendingEmail}
                className="btn btn-primary">
                {sendingEmail ? 'Sending...' : 'Send'}
              </button>
              <button onClick={() => setShowEmailModal(false)} disabled={sendingEmail}
                className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  );
}

function ExportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

export default function InvoiceDetailPageGate() {
  return <RequirePermission permission="invoices:read"><InvoiceDetailPage /></RequirePermission>;
}
