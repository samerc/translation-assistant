'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface JobFile { id: number; category: string; fileName: string; fileSize: number; mimeType: string; linkedFromJobId: number | null; uploadedAt: string; }
interface JobUser { id: number; userId: number; permissionLevel: string; user: { id: number; firstName: string; lastName: string; email: string }; }
interface JobLineItem {
  id: number; description: string; templateId: number | null; freeformJobTypeId: number | null;
  pageCount: number; pricePerPage: number; discountedPricePerPage: number | null;
  useDiscountedPrice: boolean; lineTotal: number;
}
interface Job {
  id: number; jobNumber: string; type: string; title: string; description: string | null; status: string;
  client: { id: number; name: string }; contact: { id: number; firstName: string; lastName: string } | null;
  sourceLanguage: { id: number; code: string; name: string }; targetLanguage: { id: number; code: string; name: string };
  deadline: string | null; calculatedTotal: number; finalPrice: number | null;
  isFreeOfCharge: boolean; freeOfChargeReason: string | null;
  paymentCurrency: string | null; paymentAmount: number | null; notes: string | null;
  lineItems: JobLineItem[]; assignedUsers: JobUser[]; files: JobFile[]; createdAt: string;
}

const STATUSES = [
  { value: 'quote', label: 'Quote' }, { value: 'accepted', label: 'Accepted' },
  { value: 'in_progress', label: 'In Progress' }, { value: 'delivered', label: 'Delivered' },
  { value: 'invoiced', label: 'Invoiced' }, { value: 'paid', label: 'Paid' },
  { value: 'lost', label: 'Lost' }, { value: 'cancelled', label: 'Cancelled' },
];

const statusColor = (s: string) => {
  const map: Record<string, string> = {
    quote: 'bg-bg text-text-secondary', accepted: 'bg-primary-light text-primary',
    in_progress: 'bg-primary-light text-primary', delivered: 'bg-success-light text-success',
    invoiced: 'bg-warning-light text-warning', paid: 'bg-success-light text-success',
    lost: 'bg-bg text-text-muted', cancelled: 'bg-danger-light text-danger',
  };
  return map[s] || 'bg-bg text-text-secondary';
};

type Tab = 'details' | 'documents' | 'source-files' | 'translated-files';

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('details');

  const loadJob = () => { api.get<Job>(`/jobs/${id}`).then(setJob).catch(() => router.push('/jobs')); };
  useEffect(() => { loadJob(); }, [id]);

  if (!job) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  const handleDelete = async () => {
    if (!confirm(`Delete job "${job.title}"?`)) return;
    await api.delete(`/jobs/${id}`);
    router.push('/jobs');
  };

  const handleStatusChange = async (status: string) => {
    await api.patch(`/jobs/${id}/status`, { status });
    loadJob();
  };

  const handleReopen = async () => {
    await api.post(`/jobs/${id}/reopen`);
    loadJob();
  };

  const isLocked = ['delivered', 'invoiced', 'paid'].includes(job.status);
  const sourceFiles = job.files.filter((f) => f.category === 'source');
  const translatedFiles = job.files.filter((f) => f.category === 'translated');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'documents', label: 'Documents' },
    { id: 'source-files', label: `Source Files (${sourceFiles.length})` },
    { id: 'translated-files', label: `Translated Files (${translatedFiles.length})` },
  ];

  const effectivePrice = job.finalPrice ?? job.calculatedTotal;

  return (
    <div>
      {/* Locked banner */}
      {isLocked && (
        <div className="mb-4 p-3 bg-warning-light border border-warning/30 rounded-lg flex justify-between items-center">
          <span className="text-sm text-warning font-medium">
            This job is locked ({STATUSES.find((s) => s.value === job.status)?.label}). Reopen to make changes.
          </span>
          <button onClick={handleReopen} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover">
            Reopen Job
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <button onClick={() => router.push('/jobs')} className="text-sm text-text-secondary hover:text-primary mb-2 inline-block">← Back to Jobs</button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-text-muted">{job.jobNumber}</span>
            <h1 className="text-2xl font-bold text-text">{job.title}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(job.status)}`}>
              {STATUSES.find((s) => s.value === job.status)?.label}
            </span>
            {job.isFreeOfCharge && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-accent">Pro Bono</span>}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {job.client.name} — {job.sourceLanguage.code.toUpperCase()} → {job.targetLanguage.code.toUpperCase()}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={job.status} onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button onClick={handleDelete} className="px-4 py-2 bg-bg border border-danger text-danger rounded-lg text-sm hover:bg-danger-light">Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && <DetailsTab job={job} locked={isLocked} onUpdate={loadJob} />}
      {activeTab === 'documents' && <DocumentsTab job={job} />}
      {activeTab === 'source-files' && <FilesTab job={job} category="source" files={sourceFiles} onUpdate={loadJob} />}
      {activeTab === 'translated-files' && <FilesTab job={job} category="translated" files={translatedFiles} onUpdate={loadJob} />}
    </div>
  );
}

// ── Details Tab ──

function DetailsTab({ job, locked, onUpdate }: { job: Job; locked: boolean; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: job.title, description: job.description || '', notes: job.notes || '',
    finalPrice: job.finalPrice ? String(job.finalPrice) : '',
    deadline: job.deadline || '', isFreeOfCharge: job.isFreeOfCharge, freeOfChargeReason: job.freeOfChargeReason || '',
    paymentCurrency: job.paymentCurrency || '', paymentAmount: job.paymentAmount ? String(job.paymentAmount) : '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const body: Record<string, unknown> = {
      title: form.title, description: form.description || null, notes: form.notes || null,
      isFreeOfCharge: form.isFreeOfCharge, deadline: form.deadline || null,
    };
    if (form.finalPrice) body.finalPrice = parseFloat(form.finalPrice);
    if (form.freeOfChargeReason) body.freeOfChargeReason = form.freeOfChargeReason;
    if (form.paymentCurrency) body.paymentCurrency = form.paymentCurrency;
    if (form.paymentAmount) body.paymentAmount = parseFloat(form.paymentAmount);

    await api.patch(`/jobs/${job.id}`, body);
    setSaving(false);
    setEditing(false);
    onUpdate();
  };

  const effectivePrice = job.finalPrice ?? job.calculatedTotal;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Job Info */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-text">Job Information</h3>
          {!editing && !locked && <button onClick={() => setEditing(true)} className="text-sm text-primary hover:text-primary-hover font-medium">Edit</button>}
        </div>
        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div><label className="block text-xs font-medium text-text mb-1">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
            <div><label className="block text-xs font-medium text-text mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" /></div>
            <div><label className="block text-xs font-medium text-text mb-1">Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" /></div>
            <div><label className="block text-xs font-medium text-text mb-1">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" /></div>
            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="space-y-2.5">
            <InfoRow label="Type" value={job.type === 'template' ? 'Template-based' : 'Free-form'} />
            <InfoRow label="Client" value={job.client.name} />
            {job.contact && <InfoRow label="Contact" value={`${job.contact.firstName} ${job.contact.lastName}`} />}
            <InfoRow label="Languages" value={`${job.sourceLanguage.name} → ${job.targetLanguage.name}`} />
            <InfoRow label="Deadline" value={job.deadline ? new Date(job.deadline).toLocaleDateString() : null} />
            <InfoRow label="Notes" value={job.notes} />
          </div>
        )}
      </div>

      {/* Pricing / Line Items */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-4">Pricing</h3>
        {job.isFreeOfCharge ? (
          <div className="space-y-2.5">
            <InfoRow label="Status" value="Free of Charge (Pro Bono)" />
            {job.freeOfChargeReason && <InfoRow label="Reason" value={job.freeOfChargeReason} />}
          </div>
        ) : (
          <>
            {job.lineItems.length > 0 ? (
              <div className="overflow-hidden rounded-lg border border-border mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-text-secondary">Item</th>
                      <th className="text-center px-3 py-2 font-semibold text-text-secondary">Pages</th>
                      <th className="text-right px-3 py-2 font-semibold text-text-secondary">Price/Page</th>
                      <th className="text-right px-3 py-2 font-semibold text-text-secondary">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.lineItems.map((li) => (
                      <tr key={li.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-text">{li.description}</td>
                        <td className="px-3 py-2 text-text-secondary text-center">{li.pageCount}</td>
                        <td className="px-3 py-2 text-text-secondary text-right">
                          ${Number(li.useDiscountedPrice && li.discountedPricePerPage ? li.discountedPricePerPage : li.pricePerPage).toFixed(2)}
                          {li.useDiscountedPrice && li.discountedPricePerPage && (
                            <span className="text-xs text-success ml-1">(disc.)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text font-medium text-right">${Number(li.lineTotal).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-text-muted mb-4">No line items.</p>
            )}
            <div className="space-y-2">
              <InfoRow label="Calculated Total" value={`$${Number(job.calculatedTotal).toFixed(2)}`} />
              {job.finalPrice && <InfoRow label="Final Price (override)" value={`$${Number(job.finalPrice).toFixed(2)}`} />}
              <div className="border-t border-border pt-2">
                <InfoRow label="Effective Total" value={`$${Number(effectivePrice).toFixed(2)}`} />
              </div>
              {job.paymentCurrency && (
                <InfoRow label="Paid in" value={`${Number(job.paymentAmount).toFixed(2)} ${job.paymentCurrency}`} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Documents Tab (placeholder for Phase 8) ──

function DocumentsTab({ job }: { job: Job }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
      Documents will be available after Phase 8.
    </div>
  );
}

// ── Files Tab ──

function FilesTab({ job, category, files, onUpdate }: { job: Job; category: 'source' | 'translated'; files: JobFile[]; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const formEl = e.target as HTMLFormElement;
    const fileInput = formEl.querySelector('input[type="file"]') as HTMLInputElement;
    if (!fileInput.files?.length) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('category', category);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/jobs/${job.id}/files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Upload failed' }));
        setError(Array.isArray(data.message) ? data.message.join(', ') : data.message);
      } else {
        fileInput.value = '';
        onUpdate();
      }
    } catch { setError('Upload failed'); }
    setUploading(false);
  };

  const handleDelete = async (fileId: number) => {
    if (!confirm('Delete this file?')) return;
    await api.delete(`/jobs/${job.id}/files/${fileId}`);
    onUpdate();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  return (
    <div className="max-w-2xl">
      <form onSubmit={handleUpload} className="bg-surface border border-border rounded-xl p-5 mb-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-text mb-1.5">Upload {category} file</label>
            <input type="file" required
              className="w-full px-3 py-1.5 bg-bg border border-border rounded-lg text-text text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:text-xs file:font-medium" />
          </div>
          <button type="submit" disabled={uploading} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {error && <div className="mt-3 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}
      </form>

      {files.length === 0 && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">No {category} files yet.</div>
      )}
      <div className="space-y-3">
        {files.map((f) => (
          <div key={f.id} className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center">
            <div>
              <div className="font-medium text-text text-sm">{f.fileName}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {formatSize(f.fileSize)} — {new Date(f.uploadedAt).toLocaleDateString()}
                {f.linkedFromJobId && <span className="ml-2 text-primary">(linked from job #{f.linkedFromJobId})</span>}
              </div>
            </div>
            <button onClick={() => handleDelete(f.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Shared ──

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text font-medium text-right">{value || '—'}</span>
    </div>
  );
}
