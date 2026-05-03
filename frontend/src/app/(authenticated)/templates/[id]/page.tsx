'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Language { id: number; code: string; name: string; direction: string; isActive: boolean; }
interface FieldLabel { id: number; languageId: number; label: string; language: Language; }
interface TemplateField {
  id: number; fieldKey: string; fieldType: string; sortOrder: number;
  required: boolean; groupKey: string | null; labels: FieldLabel[];
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkGroup, setBulkGroup] = useState('');
  const [showBulkGroup, setShowBulkGroup] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [newRow, setNewRow] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = [...template.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const existingGroups = [...new Set(template.fields.map((f) => f.groupKey).filter(Boolean))] as string[];

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((f) => f.id)));
    }
  };

  // ── Add new row ──
  const startNewRow = () => {
    const row: Record<string, string> = { fieldKey: '', fieldType: 'text', required: 'false', groupKey: '' };
    languages.forEach((l) => { row[`label_${l.id}`] = ''; });
    setNewRow(row);
    setEditingId(null);
  };

  const saveNewRow = async () => {
    if (!newRow || !newRow.fieldKey.trim()) return;
    setSaving(true);
    const labels = languages
      .map((l) => ({ languageId: l.id, label: (newRow[`label_${l.id}`] || '').trim() }))
      .filter((l) => l.label);

    await api.post(`/templates/${template.id}/fields`, {
      fieldKey: newRow.fieldKey.trim(),
      fieldType: newRow.fieldType,
      required: newRow.required === 'true',
      groupKey: newRow.groupKey || null,
      labels,
    });
    setNewRow(null);
    setSaving(false);
    onUpdate();
  };

  // ── Inline edit ──
  const startEdit = (field: TemplateField) => {
    const form: Record<string, string> = {
      fieldKey: field.fieldKey,
      fieldType: field.fieldType,
      required: String(field.required),
      groupKey: field.groupKey || '',
    };
    languages.forEach((l) => {
      const lbl = field.labels.find((fl) => fl.languageId === l.id);
      form[`label_${l.id}`] = lbl?.label || '';
    });
    setEditForm(form);
    setEditingId(field.id);
    setNewRow(null);
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    setSaving(true);
    const labels = languages
      .map((l) => ({ languageId: l.id, label: (editForm[`label_${l.id}`] || '').trim() }))
      .filter((l) => l.label);

    await api.patch(`/templates/${template.id}/fields/${editingId}`, {
      fieldKey: editForm.fieldKey.trim(),
      fieldType: editForm.fieldType,
      required: editForm.required === 'true',
      groupKey: editForm.groupKey || null,
      labels,
    });
    setEditingId(null);
    setSaving(false);
    onUpdate();
  };

  const cancelEdit = () => { setEditingId(null); setNewRow(null); };

  // ── Delete ──
  const handleDelete = async (fieldId: number) => {
    if (!confirm('Delete this field?')) return;
    await api.delete(`/templates/${template.id}/fields/${fieldId}`);
    selected.delete(fieldId);
    setSelected(new Set(selected));
    onUpdate();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected field(s)?`)) return;
    for (const id of selected) {
      await api.delete(`/templates/${template.id}/fields/${id}`);
    }
    setSelected(new Set());
    onUpdate();
  };

  // ── Bulk group assign ──
  const handleBulkGroup = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    for (const id of selected) {
      await api.patch(`/templates/${template.id}/fields/${id}`, {
        groupKey: bulkGroup || null,
      });
    }
    setSelected(new Set());
    setBulkGroup('');
    setShowBulkGroup(false);
    setSaving(false);
    onUpdate();
  };

  // ── Warn about missing labels ──
  const getMissingLabels = (field: TemplateField) => {
    return languages.filter((l) => !field.labels.some((fl) => fl.languageId === l.id));
  };

  const cellClass = "px-3 py-2 text-sm";
  const inputClass = "w-full px-2 py-1.5 bg-bg border border-border rounded text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex gap-2 items-center">
          {selected.size > 0 && (
            <>
              <span className="text-sm text-text-secondary">{selected.size} selected</span>
              <button onClick={() => { setShowBulkGroup(!showBulkGroup); }} className="px-3 py-1.5 bg-accent/20 text-accent rounded-lg text-xs font-medium hover:bg-accent/30">
                Set Group
              </button>
              <button onClick={handleDeleteSelected} className="px-3 py-1.5 bg-danger-light text-danger rounded-lg text-xs font-medium hover:bg-danger/20">
                Delete Selected
              </button>
            </>
          )}
        </div>
        <button onClick={startNewRow} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
          + Add Field
        </button>
      </div>

      {/* Bulk group assignment */}
      {showBulkGroup && selected.size > 0 && (
        <div className="bg-surface border border-accent/30 rounded-xl p-4 mb-4 flex items-center gap-3">
          <span className="text-sm text-text">Set group for {selected.size} field(s):</span>
          <input
            value={bulkGroup}
            onChange={(e) => setBulkGroup(e.target.value)}
            placeholder="Group name (empty = fixed)"
            list="bulk-group-options"
            className="px-3 py-1.5 bg-bg border border-border rounded-lg text-text text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <datalist id="bulk-group-options">
            {existingGroups.map((g) => <option key={g} value={g} />)}
          </datalist>
          <button onClick={handleBulkGroup} disabled={saving} className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover disabled:opacity-50">
            Apply
          </button>
          <button onClick={() => setShowBulkGroup(false)} className="px-3 py-1.5 bg-bg border border-border text-text-secondary rounded-lg text-xs">
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg border-b border-border">
              <th className="px-3 py-2.5 w-10">
                <input type="checkbox" checked={sorted.length > 0 && selected.size === sorted.length} onChange={toggleAll}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
              </th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-secondary">Field Key</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-secondary w-24">Type</th>
              <th className="px-3 py-2.5 text-center text-xs font-semibold text-text-secondary w-16">Req.</th>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-text-secondary w-32">Group</th>
              {languages.map((l) => (
                <th key={l.id} className="px-3 py-2.5 text-left text-xs font-semibold text-text-secondary">
                  {l.name} <span className="text-text-muted uppercase">({l.code})</span>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-text-secondary w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && !newRow && (
              <tr><td colSpan={5 + languages.length + 1} className="px-4 py-12 text-center text-text-muted">No fields yet. Click &quot;+ Add Field&quot; to start.</td></tr>
            )}

            {sorted.map((field) => {
              const isEditing = editingId === field.id;
              const missing = getMissingLabels(field);
              const data = isEditing ? editForm : null;

              return (
                <tr key={field.id} className={`border-b border-border last:border-0 ${isEditing ? 'bg-primary-light/30' : 'hover:bg-bg/50'}`}>
                  <td className={cellClass}>
                    <input type="checkbox" checked={selected.has(field.id)} onChange={() => toggleSelect(field.id)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                  </td>
                  <td className={cellClass}>
                    {isEditing ? (
                      <input value={data!.fieldKey} onChange={(e) => setEditForm({ ...editForm, fieldKey: e.target.value })} className={inputClass} />
                    ) : (
                      <span className="font-medium text-text">{field.fieldKey}</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {isEditing ? (
                      <select value={data!.fieldType} onChange={(e) => setEditForm({ ...editForm, fieldType: e.target.value })} className={inputClass}>
                        {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                      </select>
                    ) : (
                      <span className="px-2 py-0.5 bg-primary-light text-primary rounded text-xs font-medium">
                        {FIELD_TYPES.find((ft) => ft.value === field.fieldType)?.label}
                      </span>
                    )}
                  </td>
                  <td className={`${cellClass} text-center`}>
                    {isEditing ? (
                      <input type="checkbox" checked={data!.required === 'true'} onChange={(e) => setEditForm({ ...editForm, required: String(e.target.checked) })}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                    ) : (
                      field.required && <span className="px-2 py-0.5 bg-warning-light text-warning rounded text-xs font-medium">Yes</span>
                    )}
                  </td>
                  <td className={cellClass}>
                    {isEditing ? (
                      <input value={data!.groupKey} onChange={(e) => setEditForm({ ...editForm, groupKey: e.target.value })}
                        list="edit-group-options" placeholder="None" className={inputClass} />
                    ) : (
                      field.groupKey && <span className="px-2 py-0.5 bg-accent/20 text-accent rounded text-xs font-medium">{field.groupKey}</span>
                    )}
                  </td>
                  {languages.map((l) => {
                    const lbl = field.labels.find((fl) => fl.languageId === l.id);
                    return (
                      <td key={l.id} className={cellClass}>
                        {isEditing ? (
                          <input value={data![`label_${l.id}`] || ''} onChange={(e) => setEditForm({ ...editForm, [`label_${l.id}`]: e.target.value })}
                            placeholder={`${l.name}...`} className={inputClass} />
                        ) : (
                          lbl ? (
                            <span className="text-text-secondary text-xs">{lbl.label}</span>
                          ) : (
                            <span className="text-warning text-xs" title={`Missing ${l.name} label`}>--</span>
                          )
                        )}
                      </td>
                    );
                  })}
                  <td className={`${cellClass} text-right`}>
                    {isEditing ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={saveEdit} disabled={saving} className="text-xs text-success hover:text-success/80 font-medium">Save</button>
                        <button onClick={cancelEdit} className="text-xs text-text-secondary hover:text-text">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => startEdit(field)} className="text-xs text-primary hover:text-primary-hover font-medium">Edit</button>
                        <button onClick={() => handleDelete(field.id)} className="text-xs text-danger hover:text-danger/80 font-medium">Del</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* New row */}
            {newRow && (
              <tr className="bg-success-light/30 border-b border-border">
                <td className={cellClass}></td>
                <td className={cellClass}>
                  <input value={newRow.fieldKey} onChange={(e) => setNewRow({ ...newRow, fieldKey: e.target.value })}
                    placeholder="field_key" autoFocus className={inputClass}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveNewRow(); } }} />
                </td>
                <td className={cellClass}>
                  <select value={newRow.fieldType} onChange={(e) => setNewRow({ ...newRow, fieldType: e.target.value })} className={inputClass}>
                    {FIELD_TYPES.map((ft) => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
                  </select>
                </td>
                <td className={`${cellClass} text-center`}>
                  <input type="checkbox" checked={newRow.required === 'true'} onChange={(e) => setNewRow({ ...newRow, required: String(e.target.checked) })}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary" />
                </td>
                <td className={cellClass}>
                  <input value={newRow.groupKey} onChange={(e) => setNewRow({ ...newRow, groupKey: e.target.value })}
                    list="new-group-options" placeholder="None" className={inputClass} />
                </td>
                {languages.map((l) => (
                  <td key={l.id} className={cellClass}>
                    <input value={newRow[`label_${l.id}`] || ''} onChange={(e) => setNewRow({ ...newRow, [`label_${l.id}`]: e.target.value })}
                      placeholder={`${l.name}...`} className={inputClass}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveNewRow(); } }} />
                  </td>
                ))}
                <td className={`${cellClass} text-right`}>
                  <div className="flex gap-1 justify-end">
                    <button onClick={saveNewRow} disabled={saving} className="text-xs text-success hover:text-success/80 font-medium">Save</button>
                    <button onClick={cancelEdit} className="text-xs text-text-secondary hover:text-text">Cancel</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <datalist id="edit-group-options">
          {existingGroups.map((g) => <option key={g} value={g} />)}
        </datalist>
        <datalist id="new-group-options">
          {existingGroups.map((g) => <option key={g} value={g} />)}
        </datalist>
      </div>

      {/* Missing labels warning */}
      {(() => {
        const fieldsWithMissing = sorted.filter((f) => getMissingLabels(f).length > 0);
        if (fieldsWithMissing.length === 0) return null;
        return (
          <div className="mt-4 p-3 bg-warning-light text-warning rounded-lg text-sm">
            {fieldsWithMissing.length} field(s) have missing language labels: {fieldsWithMissing.map((f) => f.fieldKey).join(', ')}
          </div>
        );
      })()}
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
