'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTheme, type Palette } from '@/lib/theme-context';

interface AppSettings {
  id: string;
  companyName: string;
  companyAddress: string | null;
  companyLogo: string | null;
  baseCurrency: string;
  invoicePrefix: string | null;
  maxUploadSizeMb: number;
  allowedFileTypes: string[] | null;
}

interface Language {
  id: string;
  code: string;
  name: string;
  direction: 'ltr' | 'rtl';
  isActive: boolean;
}

interface LabelOption {
  id: string;
  category: string;
  value: string;
  sortOrder: number;
}

type Tab = 'general' | 'languages' | 'labels' | 'uploads' | 'appearance' | 'security' | 'email' | 'users';

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role?.name === 'Admin';
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'languages', label: 'Languages' },
    { id: 'labels', label: 'Labels' },
    { id: 'uploads', label: 'File Uploads' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'security', label: 'Security' },
    ...(isAdmin
      ? [
          { id: 'users' as Tab, label: 'Users' },
          { id: 'email' as Tab, label: 'Email' },
        ]
      : []),
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-text mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
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
      {activeTab === 'labels' && <LabelsSettings />}
      {activeTab === 'uploads' && <UploadSettings />}
      {activeTab === 'appearance' && <AppearanceSettings />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'users' && isAdmin && <UsersSettings />}
      {activeTab === 'email' && isAdmin && <EmailSettings />}
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
    <form onSubmit={handleSubmit} className="max-w-4xl">
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
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this language?')) return;
    await api.delete(`/settings/languages/${id}`);
    loadLanguages();
  };

  const handleToggleActive = async (lang: Language) => {
    await api.patch(`/settings/languages/${lang.id}`, { isActive: !lang.isActive });
    loadLanguages();
  };

  return (
    <div className="max-w-4xl">
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
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
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

// ── Labels Settings ──

const CATEGORIES = [
  { id: 'email', label: 'Email Labels' },
  { id: 'phone', label: 'Phone Labels' },
  { id: 'address', label: 'Address Labels' },
];

function LabelsSettings() {
  const [labels, setLabels] = useState<LabelOption[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');

  const loadLabels = () => {
    Promise.all(
      CATEGORIES.map((cat) =>
        api.get<LabelOption[]>(`/settings/labels/${cat.id}`),
      ),
    ).then((results) => {
      setLabels(results.flat());
    });
  };

  useEffect(() => { loadLabels(); }, []);

  const handleAdd = async (category: string) => {
    if (!newValue.trim()) return;
    await api.post('/settings/labels', { category, value: newValue.trim() });
    setNewValue('');
    setAdding(null);
    loadLabels();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/settings/labels/${id}`);
    loadLabels();
  };

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-text-secondary mb-6">
        Configure the label options available when adding emails, phones, and addresses to clients.
      </p>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const catLabels = labels.filter((l) => l.category === cat.id);

          return (
            <div key={cat.id} className="bg-surface border border-border rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-text">{cat.label}</h3>
                {adding !== cat.id && (
                  <button
                    onClick={() => { setAdding(cat.id); setNewValue(''); }}
                    className="text-sm text-primary hover:text-primary-hover font-medium"
                  >
                    + Add
                  </button>
                )}
              </div>

              {catLabels.length === 0 && adding !== cat.id && (
                <p className="text-sm text-text-muted">No labels defined.</p>
              )}

              <div className="space-y-2">
                {catLabels.map((label) => (
                  <div key={label.id} className="flex justify-between items-center py-2 px-3 bg-bg rounded-lg group">
                    <span className="text-sm text-text">{label.value}</span>
                    <button
                      onClick={() => handleDelete(label.id)}
                      className="text-xs text-danger opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              {adding === cat.id && (
                <div className="flex gap-2 mt-3">
                  <input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Label name"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(cat.id); } }}
                    className="flex-1 px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={() => handleAdd(cat.id)}
                    className="px-3 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAdding(null)}
                    className="px-3 py-2 bg-bg border border-border text-text-secondary rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
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

  useEffect(() => {
    api.get<AppSettings>('/settings').then((s) => {
      setSettings(s);
    });
  }, []);

  const handleSaveSize = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    const updated = await api.patch<AppSettings>('/settings', {
      maxUploadSizeMb: settings.maxUploadSizeMb,
    });
    setSettings(updated);
    setSaving(false);
    setMessage('Saved');
    setTimeout(() => setMessage(''), 3000);
  };

  const addFileType = async (list: 'allowedFileTypes', input: string, setInput: (v: string) => void) => {
    if (!settings || !input.trim()) return;
    const value = input.trim().startsWith('.') ? input.trim() : `.${input.trim()}`;
    const current = settings[list] || [];
    if (current.includes(value)) { setInput(''); return; }
    const updated = await api.patch<AppSettings>('/settings', {
      [list]: [...current, value],
    });
    setSettings(updated);
    setInput('');
  };

  const removeFileType = async (list: 'allowedFileTypes', value: string) => {
    if (!settings) return;
    const current = settings[list] || [];
    const filtered = current.filter((t) => t !== value);
    const updated = await api.patch<AppSettings>('/settings', {
      [list]: filtered.length ? filtered : null,
    });
    setSettings(updated);
  };

  if (!settings) return <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Max Upload Size */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-text mb-1.5">
          Max Upload Size (MB)
        </label>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            min={1}
            max={100}
            value={settings.maxUploadSizeMb}
            onChange={(e) => setSettings({ ...settings, maxUploadSizeMb: parseInt(e.target.value) || 5 })}
            className="w-32 px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSaveSize}
            disabled={saving}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
          >
            Save
          </button>
          {message && <span className="text-sm text-success">{message}</span>}
        </div>
      </div>

      {/* Allowed File Types */}
      <FileTypePills
        title="Allowed File Types"
        description="Only these file types can be uploaded. Leave empty to allow all."
        items={settings.allowedFileTypes || []}
        inputValue={allowedInput}
        onInputChange={setAllowedInput}
        onAdd={() => addFileType('allowedFileTypes', allowedInput, setAllowedInput)}
        onRemove={(val) => removeFileType('allowedFileTypes', val)}
        placeholder=".pdf"
        color="primary"
      />

    </div>
  );
}

function FileTypePills({ title, description, items, inputValue, onInputChange, onAdd, onRemove, placeholder, color }: {
  title: string;
  description: string;
  items: string[];
  inputValue: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (val: string) => void;
  placeholder: string;
  color: 'primary' | 'danger';
}) {
  const pillColors = color === 'primary'
    ? 'bg-primary-light text-primary'
    : 'bg-danger-light text-danger';

  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-sm font-medium text-text mb-1">{title}</h3>
      <p className="text-xs text-text-muted mb-4">{description}</p>

      {/* Pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        {items.map((item) => (
          <span key={item} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${pillColors}`}>
            {item}
            <button
              onClick={() => onRemove(item)}
              className="hover:opacity-70 font-bold text-sm leading-none"
            >
              &times;
            </button>
          </span>
        ))}
        {items.length === 0 && (
          <span className="text-xs text-text-muted">None</span>
        )}
      </div>

      {/* Add input */}
      <div className="flex gap-2">
        <input
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          className="flex-1 px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={onAdd}
          className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover"
        >
          Add
        </button>
      </div>
    </div>
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

// ── Appearance Settings ──

function AppearanceSettings() {
  const { palette, setPalette, darkMode, toggleDarkMode } = useTheme();

  const palettes: { id: Palette; name: string; color: string }[] = [
    { id: 'indigo', name: 'Indigo Minimal', color: '#4F46E5' },
    { id: 'ocean', name: 'Ocean Blue', color: '#1E40AF' },
    { id: 'teal', name: 'Teal Focus', color: '#0D9488' },
    { id: 'slate', name: 'Slate & Amber', color: '#334155' },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Color Palette */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-2">Color Palette</h3>
        <p className="text-sm text-text-secondary mb-4">Choose your preferred color theme. This applies to your account only.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {palettes.map((p) => (
            <button
              key={p.id}
              onClick={() => setPalette(p.id)}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
                palette === p.id
                  ? 'border-primary bg-primary-light'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="w-10 h-10 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-sm font-medium text-text">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Dark Mode */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-text">Dark Mode</h3>
            <p className="text-sm text-text-secondary mt-1">Switch between light and dark interface.</p>
          </div>
          <button
            onClick={toggleDarkMode}
            className={`relative w-12 h-7 rounded-full transition-colors ${darkMode ? 'bg-primary' : 'bg-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform shadow ${darkMode ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-4">Color Preview</h3>
        <div className="flex gap-3 flex-wrap">
          <Swatch label="Primary" className="bg-primary" />
          <Swatch label="Accent" className="bg-accent" />
          <Swatch label="Success" className="bg-success" />
          <Swatch label="Warning" className="bg-warning" />
          <Swatch label="Danger" className="bg-danger" />
          <Swatch label="Neutral" className="bg-neutral" />
        </div>
      </div>
    </div>
  );
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="text-center">
      <div className={`w-14 h-14 rounded-xl ${className}`} />
      <span className="text-xs text-text-muted mt-1 block">{label}</span>
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

// ── Security Settings ──

interface SessionInfo {
  id: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
}

function SecuritySettings() {
  const { logoutEverywhere } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.get<SessionInfo[]>('/auth/sessions');
      setSessions(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleLogoutEverywhere = async () => {
    if (!confirm('This will log you out of all devices, including this one. Continue?')) return;
    setRevoking(true);
    await logoutEverywhere();
    window.location.href = '/login';
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await api.delete(`/auth/sessions/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* Log out everywhere */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-2">Log Out Everywhere</h3>
        <p className="text-sm text-text-secondary mb-4">
          This will invalidate all active sessions across all devices. You will need to log in again.
        </p>
        <button
          onClick={handleLogoutEverywhere}
          disabled={revoking}
          className="px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 disabled:opacity-50"
        >
          {revoking ? 'Logging out...' : 'Log Out All Devices'}
        </button>
      </div>

      {/* Active sessions */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-4">Active Sessions</h3>
        {loading ? (
          <p className="text-sm text-text-muted">Loading sessions...</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-text-muted">No active sessions found.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                <div>
                  <div className="text-sm font-medium text-text">{s.ipAddress}</div>
                  <div className="text-xs text-text-muted mt-0.5">{s.userAgent}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Last used: {new Date(s.lastUsedAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeSession(s.id)}
                  className="text-xs text-danger hover:text-danger/80 font-medium"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Users & Invites (admin) ──

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role?: { id: string; name: string };
}
interface RoleOption { id: string; name: string }

function UsersSettings() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoadError(false);
    api.get<AdminUser[]>('/users').then(setUsers).catch(() => setLoadError(true));
    api.get<RoleOption[]>('/roles').then(setRoles).catch(() => {});
  };
  useEffect(load, []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInviteResult(null);
    setInviteBusy(true);
    try {
      const res = await api.post<{ token: string }>('/auth/invite', {
        email: inviteEmail,
        ...(inviteRoleId ? { roleId: inviteRoleId } : {}),
      });
      const link = `${window.location.origin}/register?token=${res.token}`;
      setInviteResult({ link });
      setInviteEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Failed to create invite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await api.patch(`/users/${u.id}/${u.isActive ? 'deactivate' : 'activate'}`);
      load();
    } catch {
      setError('Failed to update user.');
    }
  };

  const remove = async (u: AdminUser) => {
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Failed to delete user.');
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="max-w-4xl space-y-6">
      {/* Invite */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-1">Invite a user</h3>
        <p className="text-sm text-text-secondary mb-4">Generates an invite link (also emailed if SMTP is configured).</p>
        {error && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}
        <form onSubmit={invite} className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label htmlFor="inviteEmail" className="block text-sm font-medium text-text mb-1.5">Email</label>
            <input id="inviteEmail" type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:w-48">
            <label htmlFor="inviteRole" className="block text-sm font-medium text-text mb-1.5">Role</label>
            <select id="inviteRole" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)} className={inputClass}>
              <option value="">Default</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <button type="submit" disabled={inviteBusy} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {inviteBusy ? 'Creating...' : 'Create invite'}
          </button>
        </form>
        {inviteResult && (
          <div className="mt-4 p-3 bg-success-light text-success rounded-lg text-sm break-all">
            Invite link: <a href={inviteResult.link} className="underline font-medium">{inviteResult.link}</a>
          </div>
        )}
      </div>

      {/* User list */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-4">Users</h3>
        {loadError && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">Couldn&apos;t load users.</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 font-semibold">Name</th>
                <th className="py-2 font-semibold">Email</th>
                <th className="py-2 font-semibold">Role</th>
                <th className="py-2 font-semibold">Status</th>
                <th className="py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-text">{u.firstName} {u.lastName}</td>
                  <td className="py-2 text-text-secondary">{u.email}</td>
                  <td className="py-2 text-text-secondary">{u.role?.name || '—'}</td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.isActive ? 'bg-success-light text-success' : 'bg-neutral-light text-neutral'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    <button onClick={() => toggleActive(u)} className="text-xs text-primary hover:underline mr-3">
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button onClick={() => remove(u)} className="text-xs text-danger hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loadError && (
                <tr><td colSpan={5} className="py-6 text-center text-text-muted">No users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Email / SMTP (admin) ──

function EmailSettings() {
  const [form, setForm] = useState({
    smtpHost: '', smtpPort: '', smtpSecure: false, smtpUser: '', smtpPass: '', smtpFrom: '', appBaseUrl: '',
  });
  const [passSet, setPassSet] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get<Record<string, unknown>>('/settings').then((s) => {
      setForm({
        smtpHost: (s.smtpHost as string) || '',
        smtpPort: s.smtpPort != null ? String(s.smtpPort) : '',
        smtpSecure: Boolean(s.smtpSecure),
        smtpUser: (s.smtpUser as string) || '',
        smtpPass: '',
        smtpFrom: (s.smtpFrom as string) || '',
        appBaseUrl: (s.appBaseUrl as string) || '',
      });
      setPassSet(Boolean(s.smtpPassSet));
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        smtpHost: form.smtpHost || null,
        smtpPort: form.smtpPort ? parseInt(form.smtpPort, 10) : null,
        smtpSecure: form.smtpSecure,
        smtpUser: form.smtpUser || null,
        smtpFrom: form.smtpFrom || null,
        appBaseUrl: form.appBaseUrl || null,
      };
      if (form.smtpPass) body.smtpPass = form.smtpPass; // only change when typed
      await api.patch('/settings', body);
      if (form.smtpPass) setPassSet(true);
      setForm((f) => ({ ...f, smtpPass: '' }));
      setMessage({ type: 'ok', text: 'Email settings saved.' });
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof ApiError ? String(err.message) : 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      await api.post('/mail/test', { to: testEmail });
      setMessage({ type: 'ok', text: `Test email sent to ${testEmail}.` });
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof ApiError ? String(err.message) : 'Failed to send test email.' });
    } finally {
      setTesting(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary';
  if (!loaded) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-1">SMTP / Email</h3>
        <p className="text-sm text-text-secondary mb-4">Used to send invite and password-reset links. For local testing, point this at smtp4dev (host <code>localhost</code>, port <code>25</code>).</p>
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'ok' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'}`}>{message.text}</div>
        )}
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="smtpHost" className="block text-sm font-medium text-text mb-1.5">Host</label>
              <input id="smtpHost" value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} placeholder="localhost" className={inputClass} />
            </div>
            <div>
              <label htmlFor="smtpPort" className="block text-sm font-medium text-text mb-1.5">Port</label>
              <input id="smtpPort" type="number" value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })} placeholder="25" className={inputClass} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" checked={form.smtpSecure} onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })} />
            Use TLS/SSL (secure)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="smtpUser" className="block text-sm font-medium text-text mb-1.5">Username</label>
              <input id="smtpUser" value={form.smtpUser} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} autoComplete="off" className={inputClass} />
            </div>
            <div>
              <label htmlFor="smtpPass" className="block text-sm font-medium text-text mb-1.5">Password {passSet && <span className="text-xs text-text-muted">(set — leave blank to keep)</span>}</label>
              <input id="smtpPass" type="password" value={form.smtpPass} onChange={(e) => setForm({ ...form, smtpPass: e.target.value })} autoComplete="new-password" className={inputClass} />
            </div>
          </div>
          <div>
            <label htmlFor="smtpFrom" className="block text-sm font-medium text-text mb-1.5">From address</label>
            <input id="smtpFrom" value={form.smtpFrom} onChange={(e) => setForm({ ...form, smtpFrom: e.target.value })} placeholder="Translation Assistant <no-reply@example.com>" className={inputClass} />
          </div>
          <div>
            <label htmlFor="appBaseUrl" className="block text-sm font-medium text-text mb-1.5">App base URL (for links in emails)</label>
            <input id="appBaseUrl" value={form.appBaseUrl} onChange={(e) => setForm({ ...form, appBaseUrl: e.target.value })} placeholder="https://translate.fancyshark.com" className={inputClass} />
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {saving ? 'Saving...' : 'Save email settings'}
          </button>
        </form>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="font-semibold text-text mb-1">Send a test email</h3>
        <p className="text-sm text-text-secondary mb-4">Verify your SMTP configuration by sending a test message.</p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label htmlFor="testEmail" className="block text-sm font-medium text-text mb-1.5">Recipient</label>
            <input id="testEmail" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className={inputClass} />
          </div>
          <button onClick={sendTest} disabled={testing || !testEmail} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {testing ? 'Sending...' : 'Send test'}
          </button>
        </div>
      </div>
    </div>
  );
}
