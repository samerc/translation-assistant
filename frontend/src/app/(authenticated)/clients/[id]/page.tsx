'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface ClientEmail { id: number; email: string; label: string | null; isPrimary: boolean; }
interface ClientPhone { id: number; phone: string; label: string | null; isPrimary: boolean; }
interface ClientAddress { id: number; address: string; label: string | null; isPrimary: boolean; }
interface Contact { id: number; firstName: string; lastName: string; email: string | null; phone: string | null; role: string | null; notes: string | null; }
interface PassportCopy { id: number; label: string; originalName: string; mimeType: string; fileSize: number; uploadedAt: string; }

interface Client {
  id: number;
  type: 'company' | 'person';
  name: string;
  taxId: string | null;
  notes: string | null;
  emails: ClientEmail[];
  phones: ClientPhone[];
  addresses: ClientAddress[];
  contacts: Contact[];
  passportCopies: PassportCopy[];
}

type Tab = 'overview' | 'contacts' | 'passports' | 'jobs';

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const loadClient = () => {
    api.get<Client>(`/clients/${id}`).then(setClient).catch(() => router.push('/clients'));
  };

  useEffect(() => { loadClient(); }, [id]);

  if (!client) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'overview', label: 'Overview', show: true },
    { id: 'contacts', label: `Contacts (${client.contacts.length})`, show: client.type === 'company' },
    { id: 'passports', label: `Passport Copies (${client.passportCopies.length})`, show: true },
    { id: 'jobs', label: 'Jobs', show: true },
  ];

  const handleDelete = async () => {
    if (!confirm(`Delete client "${client.name}"? This cannot be undone.`)) return;
    await api.delete(`/clients/${id}`);
    router.push('/clients');
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <button onClick={() => router.push('/clients')} className="text-sm text-text-secondary hover:text-primary mb-2 inline-block">
            ← Back to Clients
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text">{client.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
              client.type === 'company' ? 'bg-primary-light text-primary' : 'bg-warning-light text-warning'
            }`}>
              {client.type === 'company' ? 'Company' : 'Person'}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push(`/jobs?clientId=${client.id}`)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
            + New Job
          </button>
          <button onClick={handleDelete} className="px-4 py-2 bg-bg border border-danger text-danger rounded-lg text-sm hover:bg-danger-light">
            Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.filter((t) => t.show).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab client={client} onUpdate={loadClient} />}
      {activeTab === 'contacts' && client.type === 'company' && <ContactsTab clientId={client.id} contacts={client.contacts} onUpdate={loadClient} />}
      {activeTab === 'passports' && <PassportsTab clientId={client.id} copies={client.passportCopies} onUpdate={loadClient} />}
      {activeTab === 'jobs' && <JobsTab clientId={client.id} />}
    </div>
  );
}

// ── Overview Tab ──

function OverviewTab({ client, onUpdate }: { client: Client; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: client.name, taxId: client.taxId || '', notes: client.notes || '' });
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<Record<string, string[]>>({ email: [], phone: [], address: [] });

  useEffect(() => {
    api.get<Record<string, string[]>>('/settings/labels').then(setLabels);
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await api.patch(`/clients/${client.id}`, form);
    setSaving(false);
    setEditing(false);
    onUpdate();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Client Info Card */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-text">Client Information</h3>
          {!editing && (
            <button onClick={() => setEditing(true)} className="text-sm text-primary hover:text-primary-hover font-medium">
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Tax ID" value={form.taxId} onChange={(v) => setForm({ ...form, taxId: v })} />
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <InfoRow label="Name" value={client.name} />
            <InfoRow label="Type" value={client.type === 'company' ? 'Company' : 'Person'} />
            <InfoRow label="Tax ID" value={client.taxId} />
            <InfoRow label="Notes" value={client.notes} />
          </div>
        )}
      </div>

      {/* Emails Card */}
      <MultiValueCard
        title="Emails"
        items={client.emails.map((e) => ({ id: e.id, value: e.email, label: e.label }))}
        placeholder="email@example.com"
        inputType="email"
        labelOptions={labels.email}
        onAdd={async (value, label) => {
          await api.post(`/clients/${client.id}/emails`, { email: value, label: label || undefined });
          onUpdate();
        }}
        onEdit={async (itemId, value, label) => {
          await api.patch(`/clients/${client.id}/emails/${itemId}`, { email: value, label: label || undefined });
          onUpdate();
        }}
        onRemove={async (itemId) => {
          await api.delete(`/clients/${client.id}/emails/${itemId}`);
          onUpdate();
        }}
      />

      {/* Phones Card */}
      <MultiValueCard
        title="Phone Numbers"
        items={client.phones.map((p) => ({ id: p.id, value: p.phone, label: p.label }))}
        placeholder="+1 234 567 8900"
        labelOptions={labels.phone}
        onAdd={async (value, label) => {
          await api.post(`/clients/${client.id}/phones`, { phone: value, label: label || undefined });
          onUpdate();
        }}
        onEdit={async (itemId, value, label) => {
          await api.patch(`/clients/${client.id}/phones/${itemId}`, { phone: value, label: label || undefined });
          onUpdate();
        }}
        onRemove={async (itemId) => {
          await api.delete(`/clients/${client.id}/phones/${itemId}`);
          onUpdate();
        }}
      />

      {/* Addresses Card */}
      <MultiValueCard
        title="Addresses"
        items={client.addresses.map((a) => ({ id: a.id, value: a.address, label: a.label }))}
        placeholder="123 Main St, City, Country"
        labelOptions={labels.address}
        onAdd={async (value, label) => {
          await api.post(`/clients/${client.id}/addresses`, { address: value, label: label || undefined });
          onUpdate();
        }}
        onEdit={async (itemId, value, label) => {
          await api.patch(`/clients/${client.id}/addresses/${itemId}`, { address: value, label: label || undefined });
          onUpdate();
        }}
        onRemove={async (itemId) => {
          await api.delete(`/clients/${client.id}/addresses/${itemId}`);
          onUpdate();
        }}
      />
    </div>
  );
}

// ── Multi-Value Card (emails, phones, addresses) ──

function MultiValueCard({ title, items, placeholder, inputType = 'text', labelOptions, onAdd, onEdit, onRemove }: {
  title: string;
  items: { id: number; value: string; label: string | null }[];
  placeholder: string;
  inputType?: string;
  labelOptions: string[];
  onAdd: (value: string, label: string) => Promise<void>;
  onEdit: (id: number, value: string, label: string) => Promise<void>;
  onRemove: (id: number) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onAdd(value, label);
    setValue('');
    setLabel('');
    setAdding(false);
    setSaving(false);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (editingId === null) return;
    setSaving(true);
    await onEdit(editingId, value, label);
    setValue('');
    setLabel('');
    setEditingId(null);
    setSaving(false);
  };

  const startEdit = (item: { id: number; value: string; label: string | null }) => {
    setEditingId(item.id);
    setValue(item.value);
    setLabel(item.label || '');
    setAdding(false);
  };

  const cancelForm = () => {
    setAdding(false);
    setEditingId(null);
    setValue('');
    setLabel('');
  };

  const isFormOpen = adding || editingId !== null;

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-text">{title}</h3>
        {!isFormOpen && (
          <button onClick={() => { setAdding(true); setEditingId(null); setValue(''); setLabel(''); }} className="text-sm text-primary hover:text-primary-hover font-medium">
            + Add
          </button>
        )}
      </div>

      {/* Existing items */}
      {items.length === 0 && !isFormOpen && (
        <p className="text-sm text-text-muted">No {title.toLowerCase()} added yet.</p>
      )}
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex justify-between items-center py-2 px-3 bg-bg rounded-lg group">
            <div className="flex items-center gap-2">
              {item.label && (
                <span className="px-2 py-0.5 bg-primary-light text-primary rounded text-xs font-medium">{item.label}</span>
              )}
              <span className="text-sm text-text">{item.value}</span>
            </div>
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEdit(item)} className="text-xs text-primary hover:text-primary-hover">
                Edit
              </button>
              <button onClick={() => onRemove(item.id)} className="text-xs text-danger hover:text-danger/80">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add/Edit form */}
      {isFormOpen && (
        <form onSubmit={editingId !== null ? handleEdit : handleAdd} className="mt-3 p-3 border border-border rounded-lg bg-bg">
          <div className="flex gap-2">
            <select
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-32 px-3 py-2 bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Label...</option>
              {labelOptions.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <input
              type={inputType}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              required
              autoFocus
              className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex gap-2 mt-2">
            <button type="submit" disabled={saving} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover disabled:opacity-50">
              {saving ? 'Saving...' : editingId !== null ? 'Update' : 'Add'}
            </button>
            <button type="button" onClick={cancelForm} className="px-3 py-1.5 bg-surface border border-border text-text-secondary rounded-lg text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Contacts Tab ──

function ContactsTab({ clientId, contacts, onUpdate }: { clientId: number; contacts: Contact[]; onUpdate: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', role: '', notes: '' });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body: Record<string, string> = { firstName: form.firstName, lastName: form.lastName };
    if (form.email) body.email = form.email;
    if (form.phone) body.phone = form.phone;
    if (form.role) body.role = form.role;
    if (form.notes) body.notes = form.notes;

    if (editingId) {
      await api.patch(`/clients/${clientId}/contacts/${editingId}`, body);
    } else {
      await api.post(`/clients/${clientId}/contacts`, body);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ firstName: '', lastName: '', email: '', phone: '', role: '', notes: '' });
    onUpdate();
  };

  const handleEdit = (c: Contact) => {
    setForm({ firstName: c.firstName, lastName: c.lastName, email: c.email || '', phone: c.phone || '', role: c.role || '', notes: c.notes || '' });
    setEditingId(c.id);
    setShowForm(true);
  };

  const handleDelete = async (contactId: number) => {
    if (!confirm('Delete this contact?')) return;
    await api.delete(`/clients/${clientId}/contacts/${contactId}`);
    onUpdate();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-end mb-4">
        <button onClick={() => { setShowForm(true); setEditingId(null); setForm({ firstName: '', lastName: '', email: '', phone: '', role: '', notes: '' }); }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">+ Add Contact</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name *" value={form.firstName} onChange={(v) => setForm({ ...form, firstName: v })} required />
            <Field label="Last Name *" value={form.lastName} onChange={(v) => setForm({ ...form, lastName: v })} required />
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Role/Title" value={form.role} onChange={(v) => setForm({ ...form, role: v })} />
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">{editingId ? 'Update' : 'Add Contact'}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Contact cards */}
      {contacts.length === 0 && !showForm && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">No contacts yet.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contacts.map((c) => (
          <div key={c.id} className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <div className="font-semibold text-text">{c.firstName} {c.lastName}</div>
                {c.role && <div className="text-xs text-text-muted mt-0.5">{c.role}</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEdit(c)} className="text-xs text-primary hover:text-primary-hover">Edit</button>
                <button onClick={() => handleDelete(c.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
              </div>
            </div>
            {c.email && <div className="text-sm text-text-secondary mb-1">{c.email}</div>}
            {c.phone && <div className="text-sm text-text-secondary">{c.phone}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Passports Tab ──

function PassportsTab({ clientId, copies, onUpdate }: { clientId: number; copies: PassportCopy[]; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState('');
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
    formData.append('label', label || 'Passport');

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/clients/${clientId}/passports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Upload failed' }));
        const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        setError(msg);
        setUploading(false);
        return;
      }

      setLabel('');
      fileInput.value = '';
      onUpdate();
    } catch {
      setError('Upload failed. Please try again.');
    }
    setUploading(false);
  };

  const handleDelete = async (copyId: number) => {
    if (!confirm('Delete this passport copy?')) return;
    await api.delete(`/clients/${clientId}/passports/${copyId}`);
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
            <label className="block text-sm font-medium text-text mb-1.5">Label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Client Passport"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-text mb-1.5">File</label>
            <input type="file" accept="image/*,.pdf" required
              className="w-full px-3 py-1.5 bg-bg border border-border rounded-lg text-text text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:text-xs file:font-medium" />
          </div>
          <button type="submit" disabled={uploading} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {error && (
          <div className="mt-3 p-3 bg-danger-light text-danger rounded-lg text-sm">
            {error}
          </div>
        )}
      </form>

      {copies.length === 0 && (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">No passport copies uploaded yet.</div>
      )}
      <div className="space-y-3">
        {copies.map((pc) => (
          <div key={pc.id} className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center">
            <div>
              <div className="font-medium text-text text-sm">{pc.label}</div>
              <div className="text-xs text-text-muted mt-0.5">{pc.originalName} — {formatSize(pc.fileSize)} — {new Date(pc.uploadedAt).toLocaleDateString()}</div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const token = localStorage.getItem('accessToken');
                  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/clients/${clientId}/passports/${pc.id}/file`;
                  window.open(`${url}?token=${token}`, '_blank');
                }}
                className="text-xs text-primary hover:text-primary-hover font-medium"
              >
                View
              </button>
              <button onClick={() => handleDelete(pc.id)} className="text-xs text-danger hover:text-danger/80">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Jobs Tab (placeholder) ──

function JobsTab({ clientId }: { clientId: number }) {
  const [jobs, setJobs] = useState<{ id: number; title: string; status: string; sourceLanguage: { code: string }; targetLanguage: { code: string }; calculatedTotal: number; createdAt: string }[]>([]);
  const router = useRouter();

  useEffect(() => {
    api.get<{ data: typeof jobs }>(`/jobs?clientId=${clientId}&limit=100`).then((res) => setJobs(res.data));
  }, [clientId]);

  const statusColor: Record<string, string> = {
    quote: 'bg-sky-100 text-sky-700', accepted: 'bg-teal-100 text-teal-700',
    in_progress: 'bg-primary-light text-primary', delivered: 'bg-green-100 text-green-700',
    invoiced: 'bg-warning-light text-warning', paid: 'bg-emerald-100 text-emerald-800',
    lost: 'bg-gray-100 text-gray-500', cancelled: 'bg-danger-light text-danger',
  };

  return (
    <div className="max-w-3xl">
      <div className="flex justify-end mb-4">
        <button onClick={() => router.push(`/jobs/new?clientId=${clientId}`)}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">+ New Job</button>
      </div>
      {jobs.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">No jobs for this client yet.</div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Languages</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-text-secondary">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} onClick={() => router.push(`/jobs/${j.id}`)} className="border-b border-border last:border-0 hover:bg-bg/50 cursor-pointer">
                  <td className="px-4 py-3 font-medium text-text">{j.title}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">{j.sourceLanguage.code.toUpperCase()} → {j.targetLanguage.code.toUpperCase()}</td>
                  <td className="px-4 py-3"><span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor[j.status] || ''}`}>{j.status.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3 text-text-secondary">${Number(j.calculatedTotal).toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-secondary">{new Date(j.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shared ──

function InfoRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className="text-sm text-text font-medium">{value || '—'}</span>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
    </div>
  );
}
