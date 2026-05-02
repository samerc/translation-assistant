'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Language { id: number; code: string; name: string; direction: string; isActive: boolean; }
interface FieldLabel { id: number; languageId: number; label: string; language: Language; }
interface TemplateField {
  id: number; fieldKey: string; fieldType: string; sortOrder: number;
  required: boolean; isRepeatable: boolean; labels: FieldLabel[];
}
interface Template {
  id: number; name: string; description: string | null; pricePerPage: number;
  discountedPricePerPage: number | null; isActive: boolean; layoutJson: object | null;
  fields: TemplateField[];
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'image', label: 'Image' },
];

type Tab = 'fields' | 'settings';

export default function TemplateDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('fields');

  const loadTemplate = () => { api.get<Template>(`/templates/${id}`).then(setTemplate).catch(() => router.push('/templates')); };
  const loadLanguages = () => { api.get<Language[]>('/settings/languages').then((langs) => setLanguages(langs.filter((l) => l.isActive))); };

  useEffect(() => { loadTemplate(); loadLanguages(); }, [id]);

  if (!template) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const handleDelete = async () => {
    if (!confirm(`Delete template "${template.name}"?`)) return;
    await api.delete(`/templates/${id}`);
    router.push('/templates');
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'fields', label: `Fields (${template.fields.length})` },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <button onClick={() => router.push('/templates')} className="text-sm text-text-secondary hover:text-primary mb-2 inline-block">← Back to Templates</button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text">{template.name}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${template.isActive ? 'bg-success-light text-success' : 'bg-bg text-text-muted'}`}>
              {template.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {template.description && <p className="text-sm text-text-secondary mt-1">{template.description}</p>}
        </div>
        <button onClick={handleDelete} className="px-4 py-2 bg-bg border border-danger text-danger rounded-lg text-sm hover:bg-danger-light">Delete</button>
      </div>

      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fields' && <FieldsTab template={template} languages={languages} onUpdate={loadTemplate} />}
      {activeTab === 'settings' && <SettingsTab template={template} onUpdate={loadTemplate} />}
    </div>
  );
}

// ── Fields Tab ──

function FieldsTab({ template, languages, onUpdate }: { template: Template; languages: Language[]; onUpdate: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ fieldKey: '', fieldType: 'text', required: false, isRepeatable: false, labels: {} as Record<number, string> });

  const resetForm = () => {
    setForm({ fieldKey: '', fieldType: 'text', required: false, isRepeatable: false, labels: {} });
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (field: TemplateField) => {
    const labelMap: Record<number, string> = {};
    field.labels.forEach((l) => { labelMap[l.languageId] = l.label; });
    setForm({ fieldKey: field.fieldKey, fieldType: field.fieldType, required: field.required, isRepeatable: field.isRepeatable, labels: labelMap });
    setEditingId(field.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const labels = Object.entries(form.labels)
      .filter(([, label]) => label.trim())
      .map(([langId, label]) => ({ languageId: parseInt(langId), label: label.trim() }));

    const body = {
      fieldKey: form.fieldKey,
      fieldType: form.fieldType,
      required: form.required,
      isRepeatable: form.isRepeatable,
      labels,
    };

    if (editingId) {
      await api.patch(`/templates/${template.id}/fields/${editingId}`, body);
    } else {
      await api.post(`/templates/${template.id}/fields`, body);
    }
    resetForm();
    onUpdate();
  };

  const handleDelete = async (fieldId: number) => {
    if (!confirm('Delete this field?')) return;
    await api.delete(`/templates/${template.id}/fields/${fieldId}`);
    onUpdate();
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">+ Add Field</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-xl p-5 mb-6">
          <h3 className="font-semibold text-text mb-4">{editingId ? 'Edit Field' : 'New Field'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Field Key *</label>
              <input value={form.fieldKey} onChange={(e) => setForm({ ...form, fieldKey: e.target.value })} required placeholder="full_name"
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Type</label>
              <select value={form.fieldType} onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
                className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                Required
              </label>
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" checked={form.isRepeatable} onChange={(e) => setForm({ ...form, isRepeatable: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                Repeatable
              </label>
            </div>
          </div>

          {/* Labels per language */}
          {languages.length > 0 && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-text mb-2">Labels per Language</label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {languages.map((lang) => (
                  <div key={lang.id} className="flex items-center gap-2">
                    <span className="text-xs text-text-muted w-16 flex-shrink-0 uppercase">{lang.code}</span>
                    <input
                      value={form.labels[lang.id] || ''}
                      onChange={(e) => setForm({ ...form, labels: { ...form.labels, [lang.id]: e.target.value } })}
                      placeholder={`Label in ${lang.name}`}
                      className="flex-1 px-3 py-1.5 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                ))}
              </div>
              {languages.length === 0 && (
                <p className="text-sm text-text-muted">No languages defined. Add languages in Settings first.</p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
              {editingId ? 'Update Field' : 'Add Field'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Fields list */}
      {template.fields.length === 0 && !showForm && (
        <div className="bg-surface border border-border rounded-xl p-12 text-center text-text-muted">
          No fields defined yet. Add your first field above.
        </div>
      )}
      <div className="space-y-3">
        {template.fields
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((field, index) => (
          <div key={field.id} className="bg-surface border border-border rounded-xl p-5">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-text-muted bg-bg px-2 py-0.5 rounded font-mono">#{index + 1}</span>
                  <span className="font-semibold text-text">{field.fieldKey}</span>
                  <span className="px-2 py-0.5 bg-primary-light text-primary rounded text-xs font-medium">
                    {FIELD_TYPES.find((ft) => ft.value === field.fieldType)?.label || field.fieldType}
                  </span>
                  {field.required && <span className="px-2 py-0.5 bg-warning-light text-warning rounded text-xs font-medium">Required</span>}
                  {field.isRepeatable && <span className="px-2 py-0.5 bg-accent/20 text-accent rounded text-xs font-medium">Repeatable</span>}
                </div>
                {field.labels.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {field.labels.map((l) => (
                      <span key={l.id} className="text-xs text-text-secondary">
                        <span className="font-medium text-text-muted uppercase">{l.language.code}:</span> {l.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => startEdit(field)} className="text-xs text-primary hover:text-primary-hover font-medium">Edit</button>
                <button onClick={() => handleDelete(field.id)} className="text-xs text-danger hover:text-danger/80 font-medium">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab({ template, onUpdate }: { template: Template; onUpdate: () => void }) {
  const [form, setForm] = useState({
    name: template.name,
    description: template.description || '',
    pricePerPage: String(template.pricePerPage),
    discountedPricePerPage: template.discountedPricePerPage ? String(template.discountedPricePerPage) : '',
    isActive: template.isActive,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await api.patch(`/templates/${template.id}`, {
      name: form.name,
      description: form.description || undefined,
      pricePerPage: parseFloat(form.pricePerPage) || 0,
      discountedPricePerPage: form.discountedPricePerPage ? parseFloat(form.discountedPricePerPage) : null,
      isActive: form.isActive,
    });
    setSaving(false);
    setMessage('Saved');
    setTimeout(() => setMessage(''), 3000);
    onUpdate();
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
      <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Name</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-1.5">Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Price per Page</label>
            <input type="number" step="0.01" min="0" value={form.pricePerPage} onChange={(e) => setForm({ ...form, pricePerPage: e.target.value })}
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Discounted Price</label>
            <input type="number" step="0.01" min="0" value={form.discountedPricePerPage} onChange={(e) => setForm({ ...form, discountedPricePerPage: e.target.value })}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
          <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
          Template is active
        </label>
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
