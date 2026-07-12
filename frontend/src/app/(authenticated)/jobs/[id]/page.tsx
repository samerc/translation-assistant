'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useAuth } from '@/lib/auth-context';
import { JOB_STATUS_BADGE, badgeClass } from '@/lib/status';
import { useSettings } from '@/lib/settings-context';
import { formatCurrency } from '@/lib/format';

interface JobFile { id: string; category: string; fileName: string; fileSize: number; mimeType: string; linkedFromJobId: string | null; uploadedAt: string; }
interface JobUser { id: string; userId: string; permissionLevel: string; user: { id: string; firstName: string; lastName: string; email: string }; }
interface JobLineItem {
  id: string; description: string; templateId: string | null; freeformJobTypeId: string | null;
  pageCount: number; pricePerPage: number; discountedPricePerPage: number | null;
  useDiscountedPrice: boolean; lineTotal: number;
}
interface Job {
  id: string; jobNumber: string; type: string; title: string; description: string | null; status: string;
  client: { id: string; name: string }; contact: { id: string; firstName: string; lastName: string } | null;
  sourceLanguage: { id: string; code: string; name: string }; targetLanguage: { id: string; code: string; name: string } | null;
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

// Valid next statuses from each state
const VALID_TRANSITIONS: Record<string, string[]> = {
  quote: ['accepted', 'in_progress', 'lost', 'cancelled'],
  accepted: ['in_progress', 'lost', 'cancelled'],
  in_progress: ['delivered', 'cancelled'],
  delivered: ['invoiced', 'paid'],
  invoiced: ['paid'],
  paid: [],
  lost: ['quote', 'in_progress'],
  cancelled: ['quote', 'in_progress'],
};

const statusColor = (s: string) => {
  return badgeClass(JOB_STATUS_BADGE, s);
};

type Tab = 'details' | 'documents' | 'source-files' | 'translated-files';

interface LinkedInvoice { id: string; invoiceNumber: string; status: string; total: number; currency: string; }

export default function JobDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [linkedInvoices, setLinkedInvoices] = useState<LinkedInvoice[]>([]);

  const loadJob = () => { api.get<Job>(`/jobs/${id}`).then(setJob).catch((err) => { logger.error('Failed to load job', err, 'jobs'); router.push('/jobs'); }); };
  useEffect(() => { loadJob(); }, [id]);

  useEffect(() => {
    api.get<LinkedInvoice[]>(`/invoices/by-job/${id}`)
      .then(setLinkedInvoices)
      .catch(() => setLinkedInvoices([]));
  }, [id]);

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
      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
        <div className="min-w-0">
          <button onClick={() => router.push('/jobs')} className="text-sm text-text-secondary hover:text-primary mb-2 inline-block">← Back to Jobs</button>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono text-text-muted">{job.jobNumber}</span>
            <h1 className="text-xl md:text-2xl font-bold text-text">{job.title}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor(job.status)}`}>
              {STATUSES.find((s) => s.value === job.status)?.label}
            </span>
            {job.isFreeOfCharge && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-accent/20 text-accent">Pro Bono</span>}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            {job.client.name} — {job.sourceLanguage.code.toUpperCase()}{job.targetLanguage ? ` → ${job.targetLanguage.code.toUpperCase()}` : ''}
            {linkedInvoices.length > 0 && (
              <span className="ml-3">
                {linkedInvoices.map((inv) => (
                  <button key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)}
                    className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline">
                    {inv.invoiceNumber} [{inv.status}]
                  </button>
                ))}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {job.status === 'delivered' && (
            <button onClick={() => router.push(`/invoices/new?jobId=${job.id}`)}
              className="px-4 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success/90">
              Create Invoice
            </button>
          )}
          <select value={job.status} onChange={(e) => handleStatusChange(e.target.value)}
            className="px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            {STATUSES.map((s) => {
              const allowed = s.value === job.status || (VALID_TRANSITIONS[job.status] || []).includes(s.value);
              return <option key={s.value} value={s.value} disabled={!allowed}>{s.label}{!allowed ? ' (N/A)' : ''}</option>;
            })}
          </select>
          <button onClick={handleDelete} className="px-4 py-2 bg-bg border border-danger text-danger rounded-lg text-sm hover:bg-danger-light">Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'}`}>
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
  const { baseCurrency } = useSettings();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: job.title, description: job.description || '', notes: job.notes || '',
    finalPrice: job.finalPrice ? String(job.finalPrice) : '',
    deadline: job.deadline || '', isFreeOfCharge: job.isFreeOfCharge, freeOfChargeReason: job.freeOfChargeReason || '',
    paymentCurrency: job.paymentCurrency || '', paymentAmount: job.paymentAmount ? String(job.paymentAmount) : '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const body: Record<string, unknown> = {
      title: form.title, description: form.description || null, notes: form.notes || null,
      isFreeOfCharge: form.isFreeOfCharge, deadline: form.deadline || null,
    };
    if (form.finalPrice) body.finalPrice = parseFloat(form.finalPrice);
    if (form.freeOfChargeReason) body.freeOfChargeReason = form.freeOfChargeReason;
    if (form.paymentCurrency) body.paymentCurrency = form.paymentCurrency;
    if (form.paymentAmount) body.paymentAmount = parseFloat(form.paymentAmount);

    try {
      await api.patch(`/jobs/${job.id}`, body);
      setEditing(false);
      onUpdate();
    } catch (err) {
      const raw = err instanceof ApiError ? err.message : 'Failed to save. Please try again.';
      setSaveError(Array.isArray(raw) ? raw.join(' ') : String(raw));
    } finally {
      setSaving(false);
    }
  };

  const effectivePrice = job.finalPrice ?? job.calculatedTotal;

  return (
    <div className="space-y-6">
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
            {saveError && <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">{saveError}</div>}
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
            <InfoRow label="Languages" value={job.targetLanguage ? `${job.sourceLanguage.name} → ${job.targetLanguage.name}` : job.sourceLanguage.name} />
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
                          {formatCurrency(li.useDiscountedPrice && li.discountedPricePerPage ? li.discountedPricePerPage : li.pricePerPage, baseCurrency)}
                          {li.useDiscountedPrice && li.discountedPricePerPage && (
                            <span className="text-xs text-success ml-1">(disc.)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-text font-medium text-right">{formatCurrency(li.lineTotal, baseCurrency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-text-muted mb-4">No line items.</p>
            )}
            <div className="space-y-2">
              <InfoRow label="Calculated Total" value={formatCurrency(job.calculatedTotal, baseCurrency)} />
              {job.finalPrice && <InfoRow label="Final Price (override)" value={formatCurrency(job.finalPrice, baseCurrency)} />}
              <div className="border-t border-border pt-2">
                <InfoRow label="Effective Total" value={formatCurrency(effectivePrice, baseCurrency)} />
              </div>
              {job.paymentCurrency && (
                <InfoRow label="Paid in" value={job.paymentAmount != null ? formatCurrency(job.paymentAmount, job.paymentCurrency) : '—'} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
    <AssignedUsersCard job={job} onUpdate={onUpdate} />
    </div>
  );
}

// ── Assigned Users ──

function AssignedUsersCard({ job, onUpdate }: { job: Job; onUpdate: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role?.name === 'Admin';
  const [allUsers, setAllUsers] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  const [pickUser, setPickUser] = useState('');
  const [pickLevel, setPickLevel] = useState<'view' | 'edit'>('edit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) api.get<{ id: string; firstName: string; lastName: string; email: string }[]>('/users').then(setAllUsers).catch(() => {});
  }, [isAdmin]);

  const assigned = job.assignedUsers || [];
  const assignedIds = new Set(assigned.map((a) => a.userId));
  const available = allUsers.filter((u) => !assignedIds.has(u.id));

  const add = async () => {
    if (!pickUser) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/jobs/${job.id}/users`, { userId: pickUser, permissionLevel: pickLevel });
      setPickUser('');
      onUpdate();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Failed to assign user.');
    } finally { setBusy(false); }
  };

  const remove = async (userId: string) => {
    setBusy(true); setError(null);
    try {
      await api.delete(`/jobs/${job.id}/users/${userId}`);
      onUpdate();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Failed to remove user.');
    } finally { setBusy(false); }
  };

  const inputClass = 'px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="font-semibold text-text mb-4">Assigned Users</h3>
      {error && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}
      {assigned.length === 0 ? (
        <p className="text-sm text-text-muted mb-4">No users assigned{isAdmin ? ' — add someone below.' : '.'}</p>
      ) : (
        <ul className="mb-4 divide-y divide-border">
          {assigned.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm text-text">{a.user.firstName} {a.user.lastName}</span>
                <span className="text-xs text-text-muted ml-2">{a.user.email}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-light text-neutral ml-2">{a.permissionLevel}</span>
              </div>
              {isAdmin && (
                <button onClick={() => remove(a.userId)} disabled={busy} className="text-xs text-danger hover:underline">Remove</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isAdmin && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select value={pickUser} onChange={(e) => setPickUser(e.target.value)} className={`${inputClass} flex-1`} aria-label="Select user to assign">
            <option value="">Select a user…</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
          </select>
          <select value={pickLevel} onChange={(e) => setPickLevel(e.target.value as 'view' | 'edit')} className={inputClass} aria-label="Permission level">
            <option value="edit">Edit</option>
            <option value="view">View</option>
          </select>
          <button onClick={add} disabled={busy || !pickUser} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">Assign</button>
        </div>
      )}
    </div>
  );
}

// ── Documents Tab ──

interface DocSummary {
  id: string;
  status: string;
  template: { id: string; name: string; type: string };
  fieldValueCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CloneResult {
  id: string;
  status: string;
  updatedAt: string;
  template: { name: string };
  job: { jobNumber: string; title: string; client?: { name: string } };
}

function DocumentsTab({ job }: { job: Job }) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showClone, setShowClone] = useState(false);
  const [cloneSearch, setCloneSearch] = useState('');
  const [cloneResults, setCloneResults] = useState<CloneResult[]>([]);
  const [cloning, setCloning] = useState(false);
  const router = useRouter();

  const loadDocs = () => { api.get<DocSummary[]>(`/documents/by-job/${job.id}`).then(setDocs); };

  useEffect(() => {
    loadDocs();
    api.get<{ id: string; name: string }[]>('/templates?isActive=true').then(setTemplates);
  }, [job.id]);

  useEffect(() => {
    if (!showClone) return;
    const t = setTimeout(() => {
      const q = cloneSearch ? `?search=${encodeURIComponent(cloneSearch)}` : '';
      api.get<CloneResult[]>(`/documents/search-clone${q}`).then(setCloneResults).catch(() => setCloneResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [showClone, cloneSearch]);

  const handleClone = async (sourceId: string) => {
    setCloning(true);
    try {
      const doc = await api.post<{ id: string }>(`/documents/${sourceId}/clone`, { jobId: job.id });
      setShowClone(false);
      router.push(`/documents/${doc.id}`);
    } catch {
      setCloning(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedTemplateId) return;
    const doc = await api.post<{ id: string }>('/documents', {
      jobId: job.id,
      templateId: selectedTemplateId,
    });
    setShowAdd(false);
    setSelectedTemplateId('');
    router.push(`/documents/${doc.id}`);
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Delete this document?')) return;
    await api.delete(`/documents/${docId}`);
    loadDocs();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-end gap-2 mb-4">
        <button onClick={() => { setShowClone(true); setShowAdd(false); }}
          className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm font-medium hover:bg-border/40">Clone existing</button>
        <button onClick={() => { setShowAdd(true); setShowClone(false); }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">+ Add Document</button>
      </div>

      {showClone && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-4">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-semibold text-text">Clone from an existing document</h4>
            <button onClick={() => setShowClone(false)} className="text-xs text-text-secondary">Cancel</button>
          </div>
          <input value={cloneSearch} onChange={(e) => setCloneSearch(e.target.value)} placeholder="Search by template or client…" aria-label="Search documents to clone"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary mb-3" />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {cloneResults.length === 0 ? (
              <p className="text-sm text-text-muted py-2">No completed documents found to clone.</p>
            ) : cloneResults.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-bg rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm text-text truncate">{r.template.name}</div>
                  <div className="text-xs text-text-muted truncate">{r.job.jobNumber} · {r.job.client?.name || r.job.title}</div>
                </div>
                <button onClick={() => handleClone(r.id)} disabled={cloning}
                  className="text-xs text-primary hover:underline flex-shrink-0 disabled:opacity-50">Clone</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-surface border border-border rounded-xl p-5 mb-4">
          <h4 className="font-semibold text-text mb-3">Create Document from Template</h4>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text mb-1.5">Template</label>
              <select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select template...</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button onClick={handleCreate} disabled={!selectedTemplateId}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">Create</button>
            <button onClick={() => setShowAdd(false)}
              className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
          </div>
        </div>
      )}

      {docs.length === 0 && !showAdd && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">No documents yet. Add one above.</div>
      )}

      <div className="space-y-3">
        {docs.map((doc) => (
          <div key={doc.id} className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center hover:border-primary/40 transition-colors">
            <div className="cursor-pointer flex-1" onClick={() => router.push(`/documents/${doc.id}`)}>
              <div className="flex items-center gap-3">
                <span className="font-medium text-text">{doc.template.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                  doc.status === 'completed' ? 'bg-success-light text-success' : 'bg-warning-light text-warning'
                }`}>{doc.status === 'completed' ? 'Completed' : 'Draft'}</span>
              </div>
              <div className="text-xs text-text-muted mt-1">
                {doc.fieldValueCount || 0} field(s) filled — Last updated {new Date(doc.updatedAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => router.push(`/documents/${doc.id}`)} className="text-xs text-primary hover:text-primary-hover font-medium">Edit</button>
              <button onClick={() => handleDelete(doc.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
            </div>
          </div>
        ))}
      </div>
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
    } catch (err) { logger.error('Upload failed', err, 'jobs'); setError('Upload failed'); }
    setUploading(false);
  };

  const handleDelete = async (fileId: string) => {
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
