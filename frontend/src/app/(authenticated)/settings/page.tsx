'use client';

import { useState, useEffect, Suspense, FormEvent, ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useSettings } from '@/lib/settings-context';
import { useTheme, PALETTE_OPTIONS } from '@/lib/theme-context';
import { JOB_STATUS_BADGE } from '@/lib/status';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { CurrencySelect } from '@/components/ui/CurrencySelect';
import { Badge } from '@/components/ui/Badge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CheckIcon, MoonIcon, SunIcon } from '@/components/ui/icons';
import { confirmDialog } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { NO_AUTOFILL } from '@/lib/no-autofill';
import { formatDate, formatDateTime, describeUserAgent } from '@/lib/format';
import { TranslateKeyForm } from '@/components/TranslateKeyForm';

interface AppSettings {
  id: string;
  companyName: string;
  companyAddress: string | null;
  companyLogo: string | null;
  companyTaxId: string | null;
  bankDetails: string | null;
  invoiceFooter: string | null;
  dateFormat: string;
  baseCurrency: string;
  invoicePrefix: string | null;
  maxUploadSizeMb: number;
  allowedFileTypes: string[] | null;
  googleTranslateKeySet?: boolean;
  translatorsSeePrices: boolean;
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

type Tab = 'general' | 'languages' | 'labels' | 'uploads' | 'appearance' | 'security' | 'email' | 'freeform';

export default function SettingsPage() {
  // useSearchParams needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={null}>
      <SettingsTabs />
    </Suspense>
  );
}

function SettingsTabs() {
  const { user } = useAuth();
  const requestedTab = useSearchParams().get('tab') as Tab | 'users' | 'roles' | null;
  const router = useRouter();
  // Users and roles moved to their own page (Team).
  useEffect(() => {
    if (requestedTab === 'users' || requestedTab === 'roles') router.replace('/team');
  }, [requestedTab, router]);
  // The platform admin manages the platform (email, sign-ups, global lists);
  // an organization's Admin manages that organization.
  const isPlatformAdmin = Boolean(user?.isPlatformAdmin);
  const isAdmin = !isPlatformAdmin && user?.role?.name === 'Admin';
  const [selectedTab, setActiveTab] = useState<Tab | null>(requestedTab === 'users' || requestedTab === 'roles' ? null : requestedTab);

  // Administration tabs (their writes are admin-only server-side) are shown to
  // the matching admin; everyone keeps the personal tabs.
  const tabs: { id: Tab; label: string }[] = isPlatformAdmin
    ? [
        { id: 'email', label: 'Email & Sign-ups' },
        { id: 'languages', label: 'Languages' },
        { id: 'labels', label: 'Labels' },
        { id: 'appearance', label: 'Appearance' },
        { id: 'security', label: 'Security' },
      ]
    : [
        ...(isAdmin
          ? [
              { id: 'general' as Tab, label: 'General' },
              { id: 'uploads' as Tab, label: 'File Uploads' },
            ]
          : []),
        { id: 'appearance', label: 'Appearance' },
        { id: 'security', label: 'Security' },
        ...(isAdmin
          ? [
              { id: 'freeform' as Tab, label: 'Freeform Types' },
            ]
          : []),
      ];
  // Derived so the active tab is always one this user can see (first tab by default).
  const activeTab = tabs.some((t) => t.id === selectedTab) ? selectedTab : tabs[0].id;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-0.5 py-3 mr-6 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-text font-semibold'
                : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && isAdmin && <GeneralSettings />}
      {activeTab === 'languages' && isPlatformAdmin && <LanguagesSettings />}
      {activeTab === 'labels' && isPlatformAdmin && <LabelsSettings />}
      {activeTab === 'uploads' && isAdmin && <UploadSettings />}
      {activeTab === 'appearance' && <AppearanceSettings />}
      {activeTab === 'security' && <SecuritySettings />}
      {activeTab === 'freeform' && isAdmin && <FreeformTypesSettings />}
      {activeTab === 'email' && isPlatformAdmin && <EmailSettings />}
    </div>
  );
}

// ── General Settings ──

function GeneralSettings() {
  const { refreshUser } = useAuth();
  const { reload: reloadAppSettings } = useSettings();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.get<AppSettings>('/settings').then(setSettings)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load settings.'));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.patch<AppSettings>('/settings', {
        companyName: settings.companyName,
        companyAddress: settings.companyAddress ?? '',
        companyTaxId: settings.companyTaxId ?? '',
        bankDetails: settings.bankDetails ?? '',
        invoiceFooter: settings.invoiceFooter ?? '',
        baseCurrency: settings.baseCurrency,
        invoicePrefix: settings.invoicePrefix ?? '',
        dateFormat: settings.dateFormat,
        translatorsSeePrices: settings.translatorsSeePrices,
      });
      setSettings(updated);
      // Dates, currency and invoice defaults across the app follow right away.
      reloadAppSettings();
      await refreshUser();
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return loadError ? <div className="max-w-4xl p-3 tone tone-danger rounded-lg text-sm">{loadError}</div> : <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-6">
      <OrganizationLogo logo={settings.companyLogo} onChange={(companyLogo) => setSettings({ ...settings, companyLogo })} />
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card p-6 space-y-5">
          <div>
            <h3 className="font-semibold text-text">Your business on invoices</h3>
            <p className="text-sm text-text-secondary mt-1">Every invoice of the organization shows these details. Leave anything blank to omit it.</p>
          </div>
          <Field label="Company name" htmlFor="org-name">
            <Input id="org-name" value={settings.companyName} onChange={(e) => setSettings({ ...settings, companyName: e.target.value })} maxLength={255} />
          </Field>
          <Field label="Address" htmlFor="org-address">
            <Textarea id="org-address" value={settings.companyAddress || ''} rows={3} className="resize-none" placeholder="Street, city, country"
              onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })} maxLength={1000} />
          </Field>
          <Field label="Tax / VAT number" htmlFor="org-tax" hint="optional">
            <Input id="org-tax" value={settings.companyTaxId || ''} onChange={(e) => setSettings({ ...settings, companyTaxId: e.target.value })} maxLength={100} />
          </Field>
          <Field label="Payment details" htmlFor="org-bank" hint="printed at the end of invoices">
            <Textarea id="org-bank" value={settings.bankDetails || ''} rows={3} className="resize-none" maxLength={2000}
              placeholder={'Bank, IBAN, transfer services…\ne.g. IBAN LB00 0000 0000 0000 — Bank of Beirut'}
              onChange={(e) => setSettings({ ...settings, bankDetails: e.target.value })} />
          </Field>
          <Field label="Default invoice notes" htmlFor="org-footer" hint="pre-filled on each new invoice, editable there">
            <Textarea id="org-footer" value={settings.invoiceFooter || ''} rows={2} className="resize-none" maxLength={2000}
              placeholder="e.g. Payment due within 30 days. Thank you for your business."
              onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })} />
          </Field>
        </div>
        <div className="card p-6 grid gap-5 sm:grid-cols-3">
          <Field label="Currency" htmlFor="org-currency">
            <CurrencySelect id="org-currency" value={settings.baseCurrency} onChange={(e) => setSettings({ ...settings, baseCurrency: e.target.value })} />
          </Field>
          <Field label="Invoice number prefix" htmlFor="org-prefix">
            <Input id="org-prefix" value={settings.invoicePrefix || ''} placeholder="INV-" maxLength={15}
              onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value })} />
          </Field>
          <Field label="Date format" htmlFor="org-date-format">
            <Select id="org-date-format" value={settings.dateFormat} onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}>
              <option value="DD/MM/YYYY">DD/MM/YYYY (15/11/2026)</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY (11/15/2026)</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD (2026-11-15)</option>
            </Select>
          </Field>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold text-text mb-3">Team</h3>
          <label className="flex items-start gap-3 text-sm text-text cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4" checked={settings.translatorsSeePrices}
              onChange={(e) => setSettings({ ...settings, translatorsSeePrices: e.target.checked })} />
            <span>
              <span className="font-medium">Translators see prices</span>
              <span className="block text-text-secondary mt-0.5">
                Job totals, line-item prices and template prices. When off, jobs a translator creates are priced from your templates and freeform types, and only admins change prices.
              </span>
            </span>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {message && <span className="text-sm text-success" role="status">{message}</span>}
        </div>
      </form>
      <div className="card p-6">
        <h3 className="font-semibold text-text mb-1">Google Translate</h3>
        <p className="text-sm text-text-secondary mb-4">
          Powers the GT helper on document pages. {settings.googleTranslateKeySet ? 'A key is saved.' : 'No key is set, so the GT helper is off.'}
        </p>
        <TranslateKeyForm
          keySet={Boolean(settings.googleTranslateKeySet)}
          onSaved={(keySet) => setSettings({ ...settings, googleTranslateKeySet: keySet })}
        />
      </div>
      <DeleteOrganizationCard />
    </div>
  );
}

interface DeletionRequest {
  requested: boolean;
  requestedAt?: string;
  requestedBy?: string | null;
  reason?: string | null;
}

/** Organization admin: ask the platform admin to delete the organization. */
function DeleteOrganizationCard() {
  const { user } = useAuth();
  const orgName = user?.tenant?.name ?? '';
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ confirmName: '', password: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DeletionRequest>('/organization/deletion-request').then(setRequest).catch(() => setRequest({ requested: false }));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post<DeletionRequest>('/organization/deletion-request', {
        confirmName: form.confirmName,
        password: form.password,
        ...(form.reason.trim() ? { reason: form.reason.trim() } : {}),
      });
      setRequest(res);
      setOpen(false);
      setForm({ confirmName: '', password: '', reason: '' });
      toast.success('Request sent. You will get an email when it is handled.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to send the request.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!(await confirmDialog({ title: 'Withdraw the deletion request?', message: 'Your organization stays as it is.', confirmText: 'Withdraw' }))) return;
    setBusy(true);
    try {
      setRequest(await api.delete<DeletionRequest>('/organization/deletion-request'));
      toast.success('Deletion request withdrawn.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to withdraw the request.');
    } finally {
      setBusy(false);
    }
  };

  if (!request) return null;

  return (
    <div className="card p-6 mt-6">
      <h3 className="font-semibold text-text mb-1">Delete organization</h3>
      {request.requested ? (
        <>
          <div className="tone tone-warning rounded-lg p-3 text-sm mt-2">
            Deletion requested{request.requestedBy ? ` by ${request.requestedBy}` : ''}
            {request.requestedAt ? ` on ${formatDate(request.requestedAt)}` : ''}. It is waiting for approval;
            nothing has been deleted yet. You&apos;ll get an email when it is handled.
          </div>
          <button type="button" onClick={withdraw} disabled={busy} className="btn btn-secondary mt-4">Withdraw request</button>
        </>
      ) : !open ? (
        <>
          <p className="text-sm text-text-secondary mb-4">
            Ask for {orgName ? <strong>{orgName}</strong> : 'your organization'} and everything in it to be deleted: clients, jobs, documents,
            invoices, templates, files and every user account. Once approved, nobody can sign in, and the data is permanently
            deleted after a grace period. Download anything you must keep (for example invoices) first.
          </p>
          <button type="button" onClick={() => setOpen(true)} className="btn btn-danger">Request deletion…</button>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-4 mt-3">
          {error && <div className="p-3 tone tone-danger rounded-lg text-sm" role="alert">{error}</div>}
          <div>
            <label htmlFor="del-reason" className="block text-sm font-medium text-text mb-1.5">Reason <span className="text-text-muted font-normal">(optional)</span></label>
            <textarea id="del-reason" rows={2} maxLength={500} className="input w-full resize-none" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div>
            <label htmlFor="del-name" className="block text-sm font-medium text-text mb-1.5">
              Type <strong>{orgName}</strong> to confirm
            </label>
            <input id="del-name" {...NO_AUTOFILL} className="input" required value={form.confirmName} onChange={(e) => setForm({ ...form, confirmName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="del-password" className="block text-sm font-medium text-text mb-1.5">Your password</label>
            <input id="del-password" type="password" autoComplete="current-password" className="input" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy || form.confirmName.trim() !== orgName.trim()} className="btn btn-danger">
              {busy ? 'Sending…' : 'Send deletion request'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(''); }} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Languages ──

function LanguagesSettings() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ code: '', name: '', direction: 'ltr' as 'ltr' | 'rtl' });

  const loadLanguages = () => {
    api.get<Language[]>('/platform/languages').then(setLanguages)
      .catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load languages.'));
  };

  useEffect(() => { loadLanguages(); }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.patch(`/platform/languages/${editingId}`, { name: form.name, direction: form.direction });
      } else {
        await api.post('/platform/languages', form);
      }
      setShowForm(false);
      setEditingId(null);
      setForm({ code: '', name: '', direction: 'ltr' });
      loadLanguages();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save language.');
    }
  };

  const handleEdit = (lang: Language) => {
    setForm({ code: lang.code, name: lang.name, direction: lang.direction });
    setEditingId(lang.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('Delete this language?'))) return;
    try {
      await api.delete(`/platform/languages/${id}`);
      loadLanguages();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete language.');
    }
  };

  const handleToggleActive = async (lang: Language) => {
    try {
      await api.patch(`/platform/languages/${lang.id}`, { isActive: !lang.isActive });
      loadLanguages();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update language.');
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-text-secondary">
          The languages every organization can use for templates and translation jobs.
        </p>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm({ code: '', name: '', direction: 'ltr' }); }}
          className="btn btn-primary"
        >
          + Add Language
        </button>
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card p-5 mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="lang-code" className="block text-sm font-medium text-text mb-1.5">Code</label>
              <input
                id="lang-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
                disabled={!!editingId}
                placeholder="ar"
                className="input w-full disabled:opacity-50"
              />
            </div>
            <div>
              <label htmlFor="lang-name" className="block text-sm font-medium text-text mb-1.5">Name</label>
              <input
                id="lang-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Arabic"
                className="input w-full"
              />
            </div>
            <div>
              <label htmlFor="lang-dir" className="block text-sm font-medium text-text mb-1.5">Direction</label>
              <select
                id="lang-dir"
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as 'ltr' | 'rtl' })}
                className="input w-full"
              >
                <option value="ltr">Left to Right (LTR)</option>
                <option value="rtl">Right to Left (RTL)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Add Language'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Languages table */}
      <div className="card overflow-x-auto">
        <table className="data-table min-w-[560px]">
          <thead>
            <tr>
              <th className="text-left">Code</th>
              <th className="text-left">Name</th>
              <th className="text-left">Direction</th>
              <th className="text-left">Status</th>
              <th className="text-right">Actions</th>
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
                        ? 'tone tone-success'
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const loadLabels = () => {
    api.get<LabelOption[]>('/platform/labels').then(setLabels).catch((err) => toast.error(err instanceof ApiError ? err.message : 'Failed to load labels.'));
  };

  useEffect(() => { loadLabels(); }, []);

  const handleAdd = async (category: string) => {
    if (!newValue.trim()) return;
    try {
      await api.post('/platform/labels', { category, value: newValue.trim() });
      setNewValue('');
      setAdding(null);
      loadLabels();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add label.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/platform/labels/${id}`);
      loadLabels();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete label.');
    }
  };

  const handleEditSave = async (id: string) => {
    if (!editValue.trim()) return;
    try {
      await api.patch(`/platform/labels/${id}`, { value: editValue.trim() });
      setEditingId(null);
      loadLabels();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update label.');
    }
  };

  return (
    <div className="max-w-4xl">
      <p className="text-sm text-text-secondary mb-6">
        The label options every organization sees when adding emails, phones, and addresses to clients.
      </p>

      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const catLabels = labels.filter((l) => l.category === cat.id);

          return (
            <div key={cat.id} className="card p-6">
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
                  <div key={label.id} className="flex justify-between items-center gap-2 py-2 px-3 bg-bg rounded-lg group">
                    {editingId === label.id ? (
                      <>
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEditSave(label.id); } if (e.key === 'Escape') setEditingId(null); }}
                          className="input h-8 px-2 flex-1"
                        />
                        <button onClick={() => handleEditSave(label.id)} className="text-xs text-primary font-medium">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-text-secondary">Cancel</button>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-text">{label.value}</span>
                        <div className="flex gap-3 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                          <button onClick={() => { setEditingId(label.id); setEditValue(label.value); }} className="text-xs text-primary">Edit</button>
                          <button onClick={() => handleDelete(label.id)} className="text-xs text-danger">Remove</button>
                        </div>
                      </>
                    )}
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
                    className="input flex-1"
                  />
                  <button
                    onClick={() => handleAdd(cat.id)}
                    className="btn btn-primary btn-sm"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setAdding(null)}
                    className="btn btn-secondary btn-sm"
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
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.get<AppSettings>('/settings').then((s) => {
      setSettings(s);
    }).catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load settings.'));
  }, []);

  const handleSaveSize = async () => {
    if (!settings) return;
    setSaving(true);
    setMessage('');
    try {
      const updated = await api.patch<AppSettings>('/settings', {
        maxUploadSizeMb: settings.maxUploadSizeMb,
      });
      setSettings(updated);
      setMessage('Saved');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save upload size.');
    } finally {
      setSaving(false);
    }
  };

  const addFileType = async (list: 'allowedFileTypes', input: string, setInput: (v: string) => void) => {
    if (!settings || !input.trim()) return;
    const value = input.trim().startsWith('.') ? input.trim() : `.${input.trim()}`;
    const current = settings[list] || [];
    if (current.includes(value)) { setInput(''); return; }
    try {
      const updated = await api.patch<AppSettings>('/settings', {
        [list]: [...current, value],
      });
      setSettings(updated);
      setInput('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add file type.');
    }
  };

  const removeFileType = async (list: 'allowedFileTypes', value: string) => {
    if (!settings) return;
    const current = settings[list] || [];
    const filtered = current.filter((t) => t !== value);
    try {
      const updated = await api.patch<AppSettings>('/settings', {
        [list]: filtered.length ? filtered : null,
      });
      setSettings(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to remove file type.');
    }
  };

  if (!settings) return loadError ? <div className="max-w-4xl p-3 tone tone-danger rounded-lg text-sm">{loadError}</div> : <LoadingSpinner />;

  return (
    <div className="max-w-4xl space-y-6">
      {/* Max Upload Size */}
      <div className="card p-6">
        <label htmlFor="max-upload" className="block text-sm font-medium text-text mb-1.5">
          Max Upload Size (MB)
        </label>
        <div className="flex gap-3 items-center">
          <input
            id="max-upload"
            type="number"
            min={1}
            max={100}
            value={settings.maxUploadSizeMb}
            onChange={(e) => setSettings({ ...settings, maxUploadSizeMb: parseInt(e.target.value) || 5 })}
            className="input w-32"
          />
          <button
            onClick={handleSaveSize}
            disabled={saving}
            className="btn btn-primary"
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
    ? 'tone tone-primary'
    : 'tone tone-danger';

  return (
    <div className="card p-6">
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
          className="input flex-1"
        />
        <button
          onClick={onAdd}
          className="btn btn-primary btn-sm"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Appearance Settings ──

function AppearanceSettings() {
  const { palette, setPalette, darkMode, setDarkMode } = useTheme();

  return (
    <div className="max-w-4xl space-y-6">
      {/* Color Palette */}
      <div className="card p-6">
        <h3 className="font-semibold text-text">Color palette</h3>
        <p className="text-sm text-text-secondary mt-1 mb-5">Used for buttons, links and highlights. This applies to your account only.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" role="radiogroup" aria-label="Color palette">
          {PALETTE_OPTIONS.map((p) => {
            const selected = palette === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPalette(p.id)}
                className={`group text-left rounded-xl border p-2.5 transition-[border-color,box-shadow] ${
                  selected ? 'border-primary ring-2 ring-primary/25' : 'border-border hover:border-border-strong'
                }`}
              >
                {/* Mini app preview: sidebar with an active item, a title bar and a button */}
                <div className="h-16 rounded-lg bg-bg border border-border flex overflow-hidden" aria-hidden="true">
                  <div className="w-1/3 bg-surface border-r border-border p-1.5 flex flex-col gap-1">
                    <div className="h-1.5 rounded-full" style={{ background: `color-mix(in srgb, ${p.color} 18%, transparent)` }} />
                    <div className="h-1.5 rounded-full bg-border" />
                    <div className="h-1.5 rounded-full bg-border" />
                  </div>
                  <div className="flex-1 p-2 flex flex-col justify-between">
                    <div className="h-1.5 w-2/3 rounded-full bg-border-strong" />
                    <div className="flex gap-1 items-center">
                      <div className="h-3.5 w-9 rounded" style={{ background: p.color }} />
                      <div className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2.5 px-0.5">
                  <span className="text-sm font-medium text-text">{p.name}</span>
                  {selected && <CheckIcon className="w-4 h-4 text-primary-text" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme */}
      <div className="card p-6 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h3 className="font-semibold text-text">Theme</h3>
          <p className="text-sm text-text-secondary mt-1">Light or dark interface. You can also switch from the top bar.</p>
        </div>
        <SegmentedControl
          label="Theme"
          value={darkMode ? 'dark' : 'light'}
          onChange={(v) => setDarkMode(v === 'dark')}
          options={[
            { value: 'light', label: <><SunIcon />Light</> },
            { value: 'dark', label: <><MoonIcon />Dark</> },
          ]}
        />
      </div>

      {/* Preview */}
      <div className="card p-6">
        <h3 className="font-semibold text-text mb-4">Preview</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries({ Quote: 'quote', Accepted: 'accepted', 'In progress': 'in_progress', Delivered: 'delivered', Invoiced: 'invoiced', Paid: 'paid', Cancelled: 'cancelled' })
            .map(([label, key]) => <Badge key={key} dot tone={JOB_STATUS_BADGE[key]}>{label}</Badge>)}
        </div>
      </div>
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
  current: boolean;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastUsedAt: string;
}

function SecuritySettings() {
  const { logout, logoutEverywhere } = useAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    api.get<SessionInfo[]>('/auth/sessions')
      .then(setSessions)
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, []);

  const handleLogoutEverywhere = async () => {
    if (!(await confirmDialog('This will log you out of all devices, including this one. Continue?'))) return;
    setRevoking(true);
    await logoutEverywhere();
    window.location.href = '/login';
  };

  const handleRevokeSession = async (session: SessionInfo) => {
    if (session.current) {
      if (!(await confirmDialog('This is the session you are using now. Revoking it logs you out. Continue?'))) return;
      await logout(); // AuthGuard redirects to /login
      return;
    }
    try {
      await api.delete(`/auth/sessions/${session.id}`);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to revoke session');
    }
  };

  return (
    <div className="space-y-6">
      {/* Log out everywhere */}
      <div className="card p-6">
        <h3 className="font-semibold text-text mb-2">Log Out Everywhere</h3>
        <p className="text-sm text-text-secondary mb-4">
          This will invalidate all active sessions across all devices. You will need to log in again.
        </p>
        <button
          onClick={handleLogoutEverywhere}
          disabled={revoking}
          className="btn btn-danger"
        >
          {revoking ? 'Logging out...' : 'Log Out All Devices'}
        </button>
      </div>

      {/* Active sessions */}
      <div className="card p-6">
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
                  <div className="text-sm font-medium text-text">
                    {s.ipAddress}
                    {s.current && <span className="ml-2 text-xs font-medium text-primary">This device</span>}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5" title={s.userAgent}>{describeUserAgent(s.userAgent)}</div>
                  <div className="text-xs text-text-muted mt-0.5">
                    Last used: {formatDateTime(s.lastUsedAt)}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeSession(s)}
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

// ── Email / SMTP (admin) ──

function EmailSettings() {
  const [form, setForm] = useState({
    smtpHost: '', smtpPort: '', smtpSecure: false, smtpUser: '', smtpPass: '', smtpFrom: '', appBaseUrl: '',
  });
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [signupBusy, setSignupBusy] = useState(false);
  const [graceDays, setGraceDays] = useState('30');
  const [graceBusy, setGraceBusy] = useState(false);
  const [passSet, setPassSet] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    api.get<Record<string, unknown>>('/platform/settings').then((s) => {
      setSignupsEnabled(s.signupsEnabled !== false);
      setGraceDays(String(s.deletionGraceDays ?? 30));
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
      await api.patch('/platform/settings', body);
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

  const toggleSignups = async () => {
    setSignupBusy(true);
    try {
      await api.patch('/platform/settings', { signupsEnabled: !signupsEnabled });
      setSignupsEnabled(!signupsEnabled);
      toast.success(signupsEnabled ? 'Sign-ups closed.' : 'Sign-ups open.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update sign-ups.');
    } finally {
      setSignupBusy(false);
    }
  };

  const saveGrace = async (e: FormEvent) => {
    e.preventDefault();
    setGraceBusy(true);
    try {
      await api.patch('/platform/settings', { deletionGraceDays: parseInt(graceDays, 10) });
      toast.success('Grace period saved.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setGraceBusy(false);
    }
  };

  const inputClass = 'input';
  if (!loaded) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-text mb-1">Public sign-up</h3>
            <p className="text-sm text-text-secondary">
              {signupsEnabled
                ? 'Anyone can create an organization from the sign-up page. New organizations wait for your approval under Organizations.'
                : 'The sign-up page is closed. You can still create organizations yourself under Organizations.'}
            </p>
          </div>
          <button onClick={toggleSignups} disabled={signupBusy} className={signupsEnabled ? 'btn btn-secondary' : 'btn btn-primary'}>
            {signupsEnabled ? 'Close sign-ups' : 'Open sign-ups'}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-text mb-1">Organization deletion</h3>
        <p className="text-sm text-text-secondary mb-4">
          When you approve deleting an organization that holds data, it is closed at once and permanently deleted after this many days.
          Until then you can restore it. Empty organizations are deleted right away.
        </p>
        <form onSubmit={saveGrace} className="flex items-end gap-3">
          <div>
            <label htmlFor="graceDays" className="block text-sm font-medium text-text mb-1.5">Grace period (days)</label>
            <input id="graceDays" type="number" min={1} max={365} required className="input w-32" value={graceDays} onChange={(e) => setGraceDays(e.target.value)} />
          </div>
          <button type="submit" disabled={graceBusy} className="btn btn-primary">{graceBusy ? 'Saving…' : 'Save'}</button>
        </form>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-text mb-1">SMTP / Email</h3>
        <p className="text-sm text-text-secondary mb-4">Used for every organization: invites, password resets, sign-up confirmations and invoice emails. For local testing, point this at smtp4dev (host <code>localhost</code>, port <code>25</code>).</p>
        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${message.type === 'ok' ? 'tone tone-success' : 'tone tone-danger'}`}>{message.text}</div>
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
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? 'Saving...' : 'Save email settings'}
          </button>
        </form>
      </div>

      <div className="card p-6">
        <h3 className="font-semibold text-text mb-1">Send a test email</h3>
        <p className="text-sm text-text-secondary mb-4">Verify your SMTP configuration by sending a test message.</p>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label htmlFor="testEmail" className="block text-sm font-medium text-text mb-1.5">Recipient</label>
            <input id="testEmail" type="email" {...NO_AUTOFILL} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className={inputClass} />
          </div>
          <button onClick={sendTest} disabled={testing || !testEmail} className="btn btn-primary">
            {testing ? 'Sending...' : 'Send test'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Organization logo (on invoices) ──

function OrganizationLogo({ logo, onChange }: { logo: string | null; onChange: (logo: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setError('Logo must be a PNG or JPEG image'); return; }
    if (file.size > 1024 * 1024) { setError('Logo must be under 1MB'); return; }
    setUploading(true); setError('');
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const updated = await api.upload<AppSettings>('/settings/logo', fd, 'PATCH');
      onChange(updated.companyLogo || null);
      toast.success('Logo updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload logo');
    } finally { setUploading(false); }
  };

  const removeLogo = async () => {
    setUploading(true); setError('');
    try {
      const updated = await api.delete<AppSettings>('/settings/logo');
      onChange(updated.companyLogo || null);
      toast.success('Logo removed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove logo');
    } finally { setUploading(false); }
  };

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-text mb-1">Logo</h3>
      <p className="text-sm text-text-secondary mb-4">PNG or JPEG, up to 1MB. Shown beside your company name on invoices.</p>
      <div className="flex items-center gap-5">
        <div className="w-40 h-20 rounded-lg border border-border bg-bg flex items-center justify-center overflow-hidden">
          {logo
            ? <img src={logo} alt="Company logo" className="max-w-full max-h-full object-contain" />
            : <span className="text-xs text-text-muted">No logo</span>}
        </div>
        <div className="flex flex-col gap-2">
          <label className={`btn btn-secondary cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploading ? 'Working…' : logo ? 'Replace logo' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg" onChange={handleLogoChange} disabled={uploading} className="sr-only" />
          </label>
          {logo && <Button variant="danger" onClick={removeLogo} disabled={uploading}>Remove</Button>}
        </div>
      </div>
      {error && <p className="text-sm text-danger mt-3" role="alert">{error}</p>}
    </div>
  );
}

// ── Freeform Job Types (admin) ──

interface FreeformJobType {
  id: string;
  name: string;
  description: string | null;
  pricePerPage: number;
  discountedPricePerPage: number | null;
  isActive: boolean;
}

function FreeformTypesSettings() {
  const [types, setTypes] = useState<FreeformJobType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', pricePerPage: '', discountedPricePerPage: '' });
  const [error, setError] = useState('');

  const load = () => { api.get<FreeformJobType[]>('/settings/freeform-job-types').then(setTypes).catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load freeform job types.')); };
  useEffect(() => { load(); }, []);

  const reset = () => {
    setForm({ name: '', description: '', pricePerPage: '', discountedPricePerPage: '' });
    setEditingId(null); setShowForm(false); setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(), // "" clears it
      pricePerPage: form.pricePerPage ? Number(form.pricePerPage) : 0,
      discountedPricePerPage: form.discountedPricePerPage ? Number(form.discountedPricePerPage) : undefined,
    };
    try {
      if (editingId) await api.patch(`/settings/freeform-job-types/${editingId}`, payload);
      else await api.post('/settings/freeform-job-types', payload);
      reset(); load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save');
    }
  };

  const edit = (t: FreeformJobType) => {
    setForm({
      name: t.name,
      description: t.description || '',
      pricePerPage: t.pricePerPage != null ? String(t.pricePerPage) : '',
      discountedPricePerPage: t.discountedPricePerPage != null ? String(t.discountedPricePerPage) : '',
    });
    setEditingId(t.id); setShowForm(true);
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog('Delete this freeform job type?'))) return;
    setError('');
    try {
      await api.delete(`/settings/freeform-job-types/${id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete');
    }
  };

  const toggle = async (t: FreeformJobType) => {
    setError('');
    try {
      await api.patch(`/settings/freeform-job-types/${t.id}`, { isActive: !t.isActive });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update');
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-text-secondary">
          Reusable job types with a default price. Selecting one on a freeform job pre-fills a line item (still editable).
        </p>
        <button
          onClick={() => { reset(); setShowForm(true); }}
          className="btn btn-primary flex-shrink-0"
        >
          + Add Type
        </button>
      </div>

      {error && <div className="p-3 tone tone-danger rounded-lg text-sm mb-4">{error}</div>}

      {showForm && (
        <form onSubmit={submit} className="card p-5 mb-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <label htmlFor="ff-name" className="block text-sm font-medium text-text mb-1.5">Name</label>
              <input id="ff-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Certified Translation"
                className="input w-full" />
            </div>
            <div>
              <label htmlFor="ff-price" className="block text-sm font-medium text-text mb-1.5">Price / Page</label>
              <input id="ff-price" type="number" step="0.01" min="0" value={form.pricePerPage} onChange={(e) => setForm({ ...form, pricePerPage: e.target.value })} placeholder="0.00"
                className="input w-full" />
            </div>
            <div>
              <label htmlFor="ff-disc" className="block text-sm font-medium text-text mb-1.5">Discounted / Page (optional)</label>
              <input id="ff-disc" type="number" step="0.01" min="0" value={form.discountedPricePerPage} onChange={(e) => setForm({ ...form, discountedPricePerPage: e.target.value })} placeholder="—"
                className="input w-full" />
            </div>
          </div>
          <div>
            <label htmlFor="ff-desc" className="block text-sm font-medium text-text mb-1.5">Description (optional)</label>
            <input id="ff-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short note used as the default line-item description"
              className="input w-full" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update' : 'Add Type'}
            </button>
            <button type="button" onClick={reset} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="data-table min-w-[560px]">
          <thead>
            <tr>
              <th className="text-left">Name</th>
              <th className="text-right">Price / Page</th>
              <th className="text-right">Discounted</th>
              <th className="text-left">Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {types.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-text-muted">No freeform job types yet.</td></tr>
            )}
            {types.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-text">{t.name}</div>
                  {t.description && <div className="text-xs text-text-secondary mt-0.5">{t.description}</div>}
                </td>
                <td className="px-4 py-3 text-right text-text">{Number(t.pricePerPage).toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-text-secondary">{t.discountedPricePerPage != null ? Number(t.discountedPricePerPage).toFixed(2) : '—'}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggle(t)} className={`text-xs px-2 py-1 rounded-full ${t.isActive ? 'tone tone-success' : 'bg-neutral-light text-text-secondary'}`}>
                    {t.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => edit(t)} className="text-xs text-primary hover:underline mr-3">Edit</button>
                  <button onClick={() => remove(t.id)} className="text-xs text-danger hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
