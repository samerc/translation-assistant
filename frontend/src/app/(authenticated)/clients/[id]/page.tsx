'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Client {
  id: number;
  type: 'company' | 'person';
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  contacts: Contact[];
  passportCopies: PassportCopy[];
}

interface Contact {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  notes: string | null;
}

interface PassportCopy {
  id: number;
  label: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

type Tab = 'info' | 'contacts' | 'passports' | 'jobs';

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadClient = () => {
    api.get<Client>(`/clients/${id}`).then(setClient).catch(() => router.push('/clients'));
  };

  useEffect(() => { loadClient(); }, [id]);

  if (!client) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'info', label: 'Info', show: true },
    { id: 'contacts', label: 'Contacts', show: client.type === 'company' },
    { id: 'passports', label: 'Passport Copies', show: true },
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
          <h1 className="text-2xl font-bold text-text">{client.name}</h1>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold mt-1 inline-block ${
            client.type === 'company' ? 'bg-primary-light text-primary' : 'bg-warning-light text-warning'
          }`}>
            {client.type === 'company' ? 'Company' : 'Person'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push(`/jobs?clientId=${client.id}`)}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover"
          >
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
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'info' && <InfoTab client={client} onUpdate={loadClient} />}
      {activeTab === 'contacts' && client.type === 'company' && <ContactsTab clientId={client.id} contacts={client.contacts} onUpdate={loadClient} />}
      {activeTab === 'passports' && <PassportsTab clientId={client.id} copies={client.passportCopies} onUpdate={loadClient} />}
      {activeTab === 'jobs' && <JobsTab clientId={client.id} />}
    </div>
  );
}

// ── Info Tab ──

function InfoTab({ client, onUpdate }: { client: Client; onUpdate: () => void }) {
  const [form, setForm] = useState({
    name: client.name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    taxId: client.taxId || '',
    notes: client.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.patch(`/clients/${client.id}`, form);
      onUpdate();
      setMessage('Saved');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
        <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <Field label="Tax ID" value={form.taxId} onChange={(v) => setForm({ ...form, taxId: v })} />
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </form>
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
    <div className="max-w-2xl">
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ firstName: '', lastName: '', email: '', phone: '', role: '', notes: '' }); }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover"
        >
          + Add Contact
        </button>
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
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
              {editingId ? 'Update' : 'Add Contact'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Role</th>
              <th className="text-right px-4 py-3 font-semibold text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No contacts yet.</td></tr>
            )}
            {contacts.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg/50">
                <td className="px-4 py-3 font-medium text-text">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-text-secondary">{c.email || '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{c.phone || '—'}</td>
                <td className="px-4 py-3 text-text-secondary">{c.role || '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleEdit(c)} className="text-primary hover:text-primary-hover text-sm mr-3">Edit</button>
                  <button onClick={() => handleDelete(c.id)} className="text-danger hover:text-danger/80 text-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Passports Tab ──

function PassportsTab({ clientId, copies, onUpdate }: { clientId: number; copies: PassportCopy[]; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [label, setLabel] = useState('');

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    const formEl = e.target as HTMLFormElement;
    const fileInput = formEl.querySelector('input[type="file"]') as HTMLInputElement;
    if (!fileInput.files?.length) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('label', label || 'Passport');

    const token = localStorage.getItem('accessToken');
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/clients/${clientId}/passports`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    setUploading(false);
    setLabel('');
    fileInput.value = '';
    onUpdate();
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
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Client Passport"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-text mb-1.5">File</label>
            <input
              type="file"
              accept="image/*,.pdf"
              required
              className="w-full px-3 py-1.5 bg-bg border border-border rounded-lg text-text text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:text-xs file:font-medium"
            />
          </div>
          <button type="submit" disabled={uploading} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </form>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Label</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">File</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Size</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Uploaded</th>
              <th className="text-right px-4 py-3 font-semibold text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {copies.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No passport copies uploaded yet.</td></tr>
            )}
            {copies.map((pc) => (
              <tr key={pc.id} className="border-b border-border last:border-0 hover:bg-bg/50">
                <td className="px-4 py-3 font-medium text-text">{pc.label}</td>
                <td className="px-4 py-3 text-text-secondary">{pc.originalName}</td>
                <td className="px-4 py-3 text-text-secondary">{formatSize(pc.fileSize)}</td>
                <td className="px-4 py-3 text-text-secondary">{new Date(pc.uploadedAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleDelete(pc.id)} className="text-danger hover:text-danger/80 text-sm">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Jobs Tab (placeholder for Phase 7) ──

function JobsTab({ clientId }: { clientId: number }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-8 text-center text-text-muted">
      Jobs for this client will appear here after Phase 7.
    </div>
  );
}

// ── Shared ──

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
