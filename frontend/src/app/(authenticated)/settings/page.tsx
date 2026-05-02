'use client';

import { useState, useEffect, FormEvent } from 'react';
import { api } from '@/lib/api';

interface AppSettings {
  id: number;
  companyName: string;
  companyAddress: string | null;
  companyLogo: string | null;
  baseCurrency: string;
  invoicePrefix: string | null;
  maxUploadSizeMb: number;
  allowedFileTypes: string[] | null;
  forbiddenFileTypes: string[] | null;
}

interface Language {
  id: number;
  code: string;
  name: string;
  direction: 'ltr' | 'rtl';
  isActive: boolean;
}

type Tab = 'general' | 'languages' | 'uploads';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'languages', label: 'Languages' },
    { id: 'uploads', label: 'File Uploads' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
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

      {activeTab === 'general' && <GeneralSettings />}
      {activeTab === 'languages' && <LanguagesSettings />}
      {activeTab === 'uploads' && <UploadSettings />}
    </div>
  );
}

// ── General Settings ──

function GeneralSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<AppSettings>('/settings').then(setSettings);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.patch<AppSettings>('/settings', {
        companyName: settings.companyName,
        companyAddress: settings.companyAddress,
        baseCurrency: settings.baseCurrency,
        invoicePrefix: settings.invoicePrefix,
      });
      setSettings(updated);
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <LoadingSpinner />;

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
      <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
        <InputField
          label="Company Name"
          value={settings.companyName}
          onChange={(v) => setSettings({ ...settings, companyName: v })}
        />
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Company Address</label>
          <textarea
            value={settings.companyAddress || ''}
            onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
        </div>
        <InputField
          label="Base Currency"
          value={settings.baseCurrency}
          onChange={(v) => setSettings({ ...settings, baseCurrency: v })}
          placeholder="USD"
        />
        <InputField
          label="Invoice Prefix"
          value={settings.invoicePrefix || ''}
          onChange={(v) => setSettings({ ...settings, invoicePrefix: v })}
          placeholder="INV-"
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </form>
  );
}

// ── Languages ──

function LanguagesSettings() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ code: '', name: '', direction: 'ltr' as 'ltr' | 'rtl' });

  const loadLanguages = () => {
    api.get<Language[]>('/settings/languages').then(setLanguages);
  };

  useEffect(() => { loadLanguages(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (editingId) {
      await api.patch(`/settings/languages/${editingId}`, { name: form.name, direction: form.direction });
    } else {
      await api.post('/settings/languages', form);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ code: '', name: '', direction: 'ltr' });
    loadLanguages();
  };

  const handleEdit = (lang: Language) => {
    setForm({ code: lang.code, name: lang.name, direction: lang.direction });
    setEditingId(lang.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this language?')) return;
    await api.delete(`/settings/languages/${id}`);
    loadLanguages();
  };

  const handleToggleActive = async (lang: Language) => {
    await api.patch(`/settings/languages/${lang.id}`, { isActive: !lang.isActive });
    loadLanguages();
  };

  return (
    <div className="max-w-2xl">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-text-secondary">
          Define the languages available for templates and translation jobs.
        </p>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ code: '', name: '', direction: 'ltr' }); }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
        >
          + Add Language
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Code</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                disabled={!!editingId}
                placeholder="ar"
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Arabic"
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Direction</label>
              <select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as 'ltr' | 'rtl' })}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="ltr">Left to Right (LTR)</option>
                <option value="rtl">Right to Left (RTL)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors">
              {editingId ? 'Update' : 'Add Language'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50 transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Languages table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Code</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Direction</th>
              <th className="text-left px-4 py-3 font-semibold text-text-secondary">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-text-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {languages.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-muted">
                  No languages defined yet. Add your first language above.
                </td>
              </tr>
            )}
            {languages.map((lang) => (
              <tr key={lang.id} className="border-b border-border last:border-0 hover:bg-bg/50">
                <td className="px-4 py-3 font-mono text-text">{lang.code}</td>
                <td className="px-4 py-3 text-text">{lang.name}</td>
                <td className="px-4 py-3 text-text-secondary uppercase">{lang.direction}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(lang)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      lang.isActive
                        ? 'bg-success-light text-success'
                        : 'bg-bg text-text-muted'
                    }`}
                  >
                    {lang.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => handleEdit(lang)} className="text-primary hover:text-primary-hover text-sm mr-3">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(lang.id)} className="text-danger hover:text-danger/80 text-sm">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Upload Settings ──

function UploadSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [allowedInput, setAllowedInput] = useState('');
  const [forbiddenInput, setForbiddenInput] = useState('');

  useEffect(() => {
    api.get<AppSettings>('/settings').then((s) => {
      setSettings(s);
      setAllowedInput(s.allowedFileTypes?.join(', ') || '');
      setForbiddenInput(s.forbiddenFileTypes?.join(', ') || '');
    });
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const allowedFileTypes = allowedInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const forbiddenFileTypes = forbiddenInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const updated = await api.patch<AppSettings>('/settings', {
        maxUploadSizeMb: settings.maxUploadSizeMb,
        allowedFileTypes: allowedFileTypes.length ? allowedFileTypes : null,
        forbiddenFileTypes: forbiddenFileTypes.length ? forbiddenFileTypes : null,
      });
      setSettings(updated);
      setMessage('Upload settings saved');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return <LoadingSpinner />;

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
      <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            Max Upload Size (MB)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={settings.maxUploadSizeMb}
            onChange={(e) => setSettings({ ...settings, maxUploadSizeMb: parseInt(e.target.value) || 5 })}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            Allowed File Types
          </label>
          <input
            value={allowedInput}
            onChange={(e) => setAllowedInput(e.target.value)}
            placeholder=".pdf, .jpg, .png, .docx"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <p className="text-xs text-text-muted mt-1">Comma-separated. Leave empty to allow all types.</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">
            Forbidden File Types
          </label>
          <input
            value={forbiddenInput}
            onChange={(e) => setForbiddenInput(e.target.value)}
            placeholder=".exe, .bat, .sh"
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <p className="text-xs text-text-muted mt-1">Comma-separated. These types will always be rejected.</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </form>
  );
}

// ── Shared Components ──

function InputField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-text mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
