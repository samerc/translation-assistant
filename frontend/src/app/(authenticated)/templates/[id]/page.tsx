'use client';

import { useState, useEffect, useMemo, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { api } from '@/lib/api';
import { TEMPLATE_TYPE_BADGE } from '@/lib/status';
import { logger } from '@/lib/logger';

interface Language { id: string; code: string; name: string; direction: string; isActive: boolean; }
interface FieldLabel { id: string; languageId: string; label: string; language: Language; }
interface TemplateField {
  id: string; fieldKey: string; fieldType: string; sortOrder: number;
  required: boolean; groupKey: string | null; labels: FieldLabel[];
}
interface Template {
  id: string; type: 'designer' | 'word' | 'simple'; name: string; description: string | null;
  pricePerPage: number; discountedPricePerPage: number | null; isActive: boolean;
  layoutJson: object | null; wordFilePath: string | null; wordFileName: string | null;
  fields: TemplateField[];
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'image', label: 'Image' },
];

type Tab = 'fields' | 'designer' | 'word' | 'settings';

export default function TemplateDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('fields');

  const loadTemplate = () => { api.get<Template>(`/templates/${id}`).then(setTemplate).catch((err) => { logger.error('Failed to load template', err, 'templates'); router.push('/templates'); }); };
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

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'fields', label: `Fields (${template.fields.length})`, show: template.type !== 'simple' },
    { id: 'designer', label: 'Layout Designer', show: template.type === 'designer' },
    { id: 'word', label: 'Word Template', show: template.type === 'word' },
    { id: 'settings', label: 'Settings', show: true },
  ];

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <button onClick={() => router.push('/templates')} className="text-sm text-text-secondary hover:text-primary mb-2 inline-block">← Back to Templates</button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text">{template.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              template.type === 'word' ? TEMPLATE_TYPE_BADGE.word : template.type === 'simple' ? TEMPLATE_TYPE_BADGE.simple : TEMPLATE_TYPE_BADGE.designer
            }`}>
              {template.type === 'word' ? 'Word' : template.type === 'simple' ? 'Simple' : 'Designer'}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${template.isActive ? 'bg-success-light text-success' : 'bg-bg text-text-muted'}`}>
              {template.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          {template.description && <p className="text-sm text-text-secondary mt-1">{template.description}</p>}
        </div>
        <button onClick={handleDelete} className="px-4 py-2 bg-bg border border-danger text-danger rounded-lg text-sm hover:bg-danger-light">Delete</button>
      </div>

      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.filter((t) => t.show).map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'fields' && <FieldsTab template={template} languages={languages} onUpdate={loadTemplate} />}
      {activeTab === 'designer' && template.type === 'designer' && <DesignerTab template={template} onUpdate={loadTemplate} />}
      {activeTab === 'word' && template.type === 'word' && <WordTemplateTab template={template} onUpdate={loadTemplate} />}
      {activeTab === 'settings' && <SettingsTab template={template} onUpdate={loadTemplate} />}
    </div>
  );
}

// ── Fields Tab ──

function FieldsTab({ template, languages, onUpdate }: { template: Template; languages: Language[]; onUpdate: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkGroup, setBulkGroup] = useState('');
  const [showBulkGroup, setShowBulkGroup] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [newRow, setNewRow] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = [...template.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const existingGroups = [...new Set(template.fields.map((f) => f.groupKey).filter(Boolean))] as string[];

  const toggleSelect = (id: string) => {
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
  const handleDelete = async (fieldId: string) => {
    if (!confirm('Delete this field?')) return;
    try {
      await api.delete(`/templates/${template.id}/fields/${fieldId}`);
      selected.delete(fieldId);
      setSelected(new Set(selected));
      onUpdate();
    } catch (err) {
      logger.error('Failed to delete field', err, 'templates');
      alert('Failed to delete field');
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected field(s)?`)) return;
    try {
      for (const id of selected) {
        await api.delete(`/templates/${template.id}/fields/${id}`);
      }
      setSelected(new Set());
      onUpdate();
    } catch (err) {
      logger.error('Failed to delete selected fields', err, 'templates');
      alert('Failed to delete some fields');
      onUpdate();
    }
  };

  // ── Bulk group assign ──
  const handleBulkGroup = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      for (const id of selected) {
        await api.patch(`/templates/${template.id}/fields/${id}`, {
          groupKey: bulkGroup || null,
        });
      }
      setSelected(new Set());
      setBulkGroup('');
      setShowBulkGroup(false);
    } catch (err) {
      logger.error('Failed to group selected fields', err, 'templates');
      alert('Failed to update some fields. Please try again.');
    } finally {
      setSaving(false);
      onUpdate();
    }
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

// ── Designer Tab (block-based layout builder) ──

interface LayoutBlock {
  id: string;
  type: 'header' | 'text' | 'field' | 'field-row' | 'divider' | 'footer' | 'date';
  content?: string;
  fieldKey?: string;
  fieldKeys?: string[];
  fontSize?: number;
  alignment?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  bgColor?: string;
  // Field display options
  showLabel?: boolean;
  labelText?: string;
  labelBold?: boolean;
  labelPosition?: 'left' | 'top';
  separator?: string;
  valueAlignment?: 'left' | 'center' | 'right';
}

function DesignerTab({ template, onUpdate }: { template: Template; onUpdate: () => void }) {
  const [blocks, setBlocks] = useState<LayoutBlock[]>((template.layoutJson as LayoutBlock[]) || []);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const fieldKeys = template.fields.map((f) => f.fieldKey);

  const addBlock = (type: LayoutBlock['type']) => {
    const id = `block_${Date.now()}`;
    let newBlock: LayoutBlock;
    switch (type) {
      case 'header': newBlock = { id, type, content: 'Header Text', fontSize: 18, alignment: 'center' }; break;
      case 'text': newBlock = { id, type, content: 'Static text content', fontSize: 12, alignment: 'left' }; break;
      case 'field': newBlock = { id, type, fieldKey: fieldKeys[0] || '', fontSize: 12, alignment: 'left', showLabel: true, labelBold: true, labelPosition: 'left', separator: ':' }; break;
      case 'field-row': newBlock = { id, type, fieldKeys: [], fontSize: 12, alignment: 'left', showLabel: true, labelBold: true, labelPosition: 'left', separator: ':' }; break;
      case 'divider': newBlock = { id, type }; break;
      case 'footer': newBlock = { id, type, content: 'Footer text', fontSize: 10, alignment: 'center' }; break;
      case 'date': newBlock = { id, type, content: 'Date: {date}', fontSize: 12, alignment: 'right' }; break;
      default: newBlock = { id, type, content: '' }; break;
    }
    setBlocks([...blocks, newBlock]);
    setSelectedIdx(blocks.length);
  };

  const moveBlock = (from: number, direction: 'up' | 'down') => {
    const to = direction === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= blocks.length) return;
    const updated = [...blocks];
    [updated[from], updated[to]] = [updated[to], updated[from]];
    setBlocks(updated);
    setSelectedIdx(to);
  };

  const removeBlock = (idx: number) => {
    setBlocks(blocks.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const updateBlock = (idx: number, updates: Partial<LayoutBlock>) => {
    const updated = [...blocks];
    updated[idx] = { ...updated[idx], ...updates };
    setBlocks(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    await api.patch(`/templates/${template.id}`, { layoutJson: blocks });
    setSaving(false);
    setMessage('Layout saved');
    setTimeout(() => setMessage(''), 3000);
    onUpdate();
  };

  const selected = selectedIdx !== null ? blocks[selectedIdx] : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Main area */}
      <div className="lg:col-span-3">
        {/* Toolbar */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {([['header', 'Header'], ['text', 'Text'], ['field', 'Field'], ['field-row', 'Field Row'], ['divider', 'Divider'], ['footer', 'Footer'], ['date', 'Date']] as const).map(([type, label]) => (
            <button key={type} onClick={() => addBlock(type)}
              className="px-3 py-1.5 bg-primary-light text-primary rounded-lg text-xs font-medium hover:bg-primary/20">
              + {label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="bg-white border-2 border-border rounded-xl p-8 min-h-[400px]">
          {blocks.length === 0 && (
            <p className="text-center text-text-muted py-12">Add blocks using the toolbar above to build your document layout.</p>
          )}
          {blocks.map((block, idx) => (
            <div
              key={block.id}
              onClick={() => setSelectedIdx(idx)}
              className={`relative group mb-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedIdx === idx ? 'border-primary bg-primary-light/30' : 'border-dashed border-border hover:border-primary/40'
              }`}
            >
              {/* Move/delete controls */}
              <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'up'); }} className="text-text-muted hover:text-primary text-xs">▲</button>
                <button onClick={(e) => { e.stopPropagation(); moveBlock(idx, 'down'); }} className="text-text-muted hover:text-primary text-xs">▼</button>
              </div>

              {/* Block content preview */}
              {(() => {
                const style: React.CSSProperties = {
                  fontSize: block.fontSize,
                  textAlign: block.alignment,
                  fontWeight: block.bold ? 'bold' : undefined,
                  fontStyle: block.italic ? 'italic' : undefined,
                  textDecoration: block.underline ? 'underline' : undefined,
                  color: block.color || undefined,
                  backgroundColor: block.bgColor || undefined,
                  padding: block.bgColor ? '4px 8px' : undefined,
                  borderRadius: block.bgColor ? '4px' : undefined,
                };

                if (block.type === 'divider') return <hr className="border-text-muted" />;

                if (block.type === 'field') {
                  const labelStyle: React.CSSProperties = { fontWeight: block.labelBold ? 'bold' : 'normal' };
                  const valStyle: React.CSSProperties = { ...style, textAlign: block.valueAlignment || block.alignment };
                  const fieldLabel = block.labelText || block.fieldKey || 'field';
                  const sep = block.separator || '';

                  if (block.showLabel && block.labelPosition === 'top') {
                    return (
                      <div>
                        <div style={{ ...style, ...labelStyle }}>{fieldLabel}{sep}</div>
                        <div style={valStyle} className="text-primary">{'{'}{block.fieldKey || 'field_key'}{'}'}</div>
                      </div>
                    );
                  }
                  if (block.showLabel) {
                    return (
                      <div style={{ ...style, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={labelStyle}>{fieldLabel}{sep}</span>
                        <span style={{ textAlign: block.valueAlignment || 'right' }} className="text-primary">{'{'}{block.fieldKey || 'field_key'}{'}'}</span>
                      </div>
                    );
                  }
                  return <div style={valStyle} className="text-primary">{'{'}{block.fieldKey || 'field_key'}{'}'}</div>;
                }

                if (block.type === 'field-row') {
                  const labelStyle: React.CSSProperties = { fontWeight: block.labelBold ? 'bold' : 'normal' };
                  const sep = block.separator || '';

                  if (!block.fieldKeys || block.fieldKeys.length === 0) {
                    return <div className="text-text-muted" style={{ fontSize: block.fontSize }}>Select fields in properties →</div>;
                  }
                  return (
                    <div style={{ fontSize: block.fontSize }} className="flex gap-6">
                      {block.fieldKeys.map((fk) => (
                        <div key={fk} className="flex-1">
                          {block.showLabel && block.labelPosition === 'top' ? (
                            <>
                              <div style={{ ...style, ...labelStyle }}>{fk}{sep}</div>
                              <div className="text-primary">{'{'}{fk}{'}'}</div>
                            </>
                          ) : block.showLabel ? (
                            <div style={{ ...style, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <span style={labelStyle}>{fk}{sep}</span>
                              <span className="text-primary">{'{'}{fk}{'}'}</span>
                            </div>
                          ) : (
                            <div style={style} className="text-primary">{'{'}{fk}{'}'}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                }

                return <div style={style}>{block.content}</div>;
              })()}

              <span className="absolute top-1 right-2 text-[10px] text-text-muted uppercase">{block.type}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Layout'}
          </button>
          {message && <span className="text-sm text-success">{message}</span>}
        </div>
      </div>

      {/* Properties panel */}
      <div className="lg:col-span-1">
        <div className="bg-surface border border-border rounded-xl p-5 sticky top-20">
          <h3 className="font-semibold text-text mb-4">Properties</h3>
          {!selected ? (
            <p className="text-sm text-text-muted">Select a block to edit its properties.</p>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-text-muted uppercase font-medium">{selected.type} block</div>

              {(selected.type === 'header' || selected.type === 'text' || selected.type === 'footer' || selected.type === 'date') && (
                <div>
                  <label className="block text-xs font-medium text-text mb-1">Content</label>
                  <textarea value={selected.content || ''} onChange={(e) => updateBlock(selectedIdx!, { content: e.target.value })} rows={3}
                    className="w-full px-2 py-1.5 bg-bg border border-border rounded text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                </div>
              )}

              {selected.type === 'field' && (
                <div>
                  <label className="block text-xs font-medium text-text mb-1">Field</label>
                  <select value={selected.fieldKey || ''} onChange={(e) => updateBlock(selectedIdx!, { fieldKey: e.target.value })}
                    className="w-full px-2 py-1.5 bg-bg border border-border rounded text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">Select field...</option>
                    {fieldKeys.map((fk) => <option key={fk} value={fk}>{fk}</option>)}
                  </select>
                </div>
              )}

              {selected.type === 'field-row' && (
                <div>
                  <label className="block text-xs font-medium text-text mb-1">Fields (select multiple)</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {fieldKeys.map((fk) => (
                      <label key={fk} className="flex items-center gap-2 text-xs text-text cursor-pointer">
                        <input type="checkbox" checked={(selected.fieldKeys || []).includes(fk)}
                          onChange={(e) => {
                            const current = selected.fieldKeys || [];
                            const updated = e.target.checked ? [...current, fk] : current.filter((k) => k !== fk);
                            updateBlock(selectedIdx!, { fieldKeys: updated });
                          }}
                          className="w-3 h-3 rounded border-border text-primary focus:ring-primary" />
                        {fk}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Field display options */}
              {(selected.type === 'field' || selected.type === 'field-row') && (
                <>
                  <div className="border-t border-border pt-3">
                    <label className="block text-xs font-medium text-text mb-2">Label Display</label>
                    <label className="flex items-center gap-2 text-xs text-text cursor-pointer mb-2">
                      <input type="checkbox" checked={selected.showLabel !== false}
                        onChange={(e) => updateBlock(selectedIdx!, { showLabel: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary" />
                      Show label
                    </label>
                    {selected.showLabel !== false && (
                      <div className="space-y-2 ml-5">
                        {selected.type === 'field' && (
                          <div>
                            <label className="block text-xs text-text-muted mb-1">Custom label text</label>
                            <input value={selected.labelText || ''} onChange={(e) => updateBlock(selectedIdx!, { labelText: e.target.value })}
                              placeholder={selected.fieldKey || 'Field name'}
                              className="w-full px-2 py-1.5 bg-bg border border-border rounded text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Position</label>
                          <div className="flex gap-1">
                            <button onClick={() => updateBlock(selectedIdx!, { labelPosition: 'left' })}
                              className={`flex-1 px-2 py-1 rounded text-xs font-medium ${selected.labelPosition === 'left' || !selected.labelPosition ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                              Left
                            </button>
                            <button onClick={() => updateBlock(selectedIdx!, { labelPosition: 'top' })}
                              className={`flex-1 px-2 py-1 rounded text-xs font-medium ${selected.labelPosition === 'top' ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                              Top
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-text-muted mb-1">Separator</label>
                          <div className="flex gap-1">
                            {[':', ' -', ' |', ''].map((s) => (
                              <button key={s} onClick={() => updateBlock(selectedIdx!, { separator: s })}
                                className={`flex-1 px-2 py-1 rounded text-xs font-medium ${selected.separator === s ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                                {s || 'None'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-text cursor-pointer">
                          <input type="checkbox" checked={selected.labelBold !== false}
                            onChange={(e) => updateBlock(selectedIdx!, { labelBold: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary" />
                          Bold label
                        </label>
                      </div>
                    )}
                  </div>
                  {selected.showLabel !== false && selected.labelPosition !== 'top' && (
                    <div>
                      <label className="block text-xs font-medium text-text mb-1">Value Alignment</label>
                      <div className="flex gap-1">
                        {(['left', 'center', 'right'] as const).map((a) => (
                          <button key={a} onClick={() => updateBlock(selectedIdx!, { valueAlignment: a })}
                            className={`flex-1 px-2 py-1 rounded text-xs font-medium ${(selected.valueAlignment || 'right') === a ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                            {a.charAt(0).toUpperCase() + a.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {selected.type !== 'divider' && (
                <>
                  {/* Font style toggles */}
                  <div>
                    <label className="block text-xs font-medium text-text mb-1">Style</label>
                    <div className="flex gap-1">
                      <button onClick={() => updateBlock(selectedIdx!, { bold: !selected.bold })}
                        className={`flex-1 px-2 py-1.5 rounded text-xs font-bold ${selected.bold ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                        B
                      </button>
                      <button onClick={() => updateBlock(selectedIdx!, { italic: !selected.italic })}
                        className={`flex-1 px-2 py-1.5 rounded text-xs italic ${selected.italic ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                        I
                      </button>
                      <button onClick={() => updateBlock(selectedIdx!, { underline: !selected.underline })}
                        className={`flex-1 px-2 py-1.5 rounded text-xs underline ${selected.underline ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                        U
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text mb-1">Font Size</label>
                    <input type="number" min={8} max={48} value={selected.fontSize || 12}
                      onChange={(e) => updateBlock(selectedIdx!, { fontSize: parseInt(e.target.value) || 12 })}
                      className="w-full px-2 py-1.5 bg-bg border border-border rounded text-text text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text mb-1">Alignment</label>
                    <div className="flex gap-1">
                      {(['left', 'center', 'right'] as const).map((a) => (
                        <button key={a} onClick={() => updateBlock(selectedIdx!, { alignment: a })}
                          className={`flex-1 px-2 py-1 rounded text-xs font-medium ${selected.alignment === a ? 'bg-primary text-white' : 'bg-bg text-text-secondary border border-border'}`}>
                          {a.charAt(0).toUpperCase() + a.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Colors */}
                  <div>
                    <label className="block text-xs font-medium text-text mb-1">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selected.color || '#000000'}
                        onChange={(e) => updateBlock(selectedIdx!, { color: e.target.value })}
                        className="w-8 h-8 rounded border border-border cursor-pointer" />
                      <span className="text-xs text-text-muted flex-1">{selected.color || 'Default'}</span>
                      {selected.color && (
                        <button onClick={() => updateBlock(selectedIdx!, { color: undefined })}
                          className="text-xs text-text-muted hover:text-danger">Clear</button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-text mb-1">Background Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={selected.bgColor || '#ffffff'}
                        onChange={(e) => updateBlock(selectedIdx!, { bgColor: e.target.value })}
                        className="w-8 h-8 rounded border border-border cursor-pointer" />
                      <span className="text-xs text-text-muted flex-1">{selected.bgColor || 'None'}</span>
                      {selected.bgColor && (
                        <button onClick={() => updateBlock(selectedIdx!, { bgColor: undefined })}
                          className="text-xs text-text-muted hover:text-danger">Clear</button>
                      )}
                    </div>
                  </div>
                </>
              )}

              <button onClick={() => removeBlock(selectedIdx!)} className="w-full px-3 py-1.5 bg-danger-light text-danger rounded-lg text-xs font-medium hover:bg-danger/20">
                Remove Block
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Word Template Tab ──

interface WordPreview {
  html: string;
  valid: string[];
  unlinked: string[];
  malformed: { text: string; reason: string }[];
}

function WordTemplateTab({ template, onUpdate }: { template: Template; onUpdate: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<WordPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState('');

  const loadPreview = async () => {
    if (!template.wordFilePath) return;
    setLoadingPreview(true);
    try {
      const data = await api.get<WordPreview>(`/templates/${template.id}/word-preview`);
      setPreview(data);
    } catch (err) {
      logger.error('Failed to load preview', err, 'templates');
      setError('Failed to load preview');
    }
    setLoadingPreview(false);
  };

  useEffect(() => { loadPreview(); }, [template.wordFilePath]);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const formEl = e.target as HTMLFormElement;
    const fileInput = formEl.querySelector('input[type="file"]') as HTMLInputElement;
    if (!fileInput.files?.length) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/templates/${template.id}/upload-word`, {
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
    } catch (err) {
      logger.error('Word template upload failed', err, 'templates');
      setError('Upload failed');
    }
    setUploading(false);
  };

  const handleSyncPlaceholders = async () => {
    if (!preview) return;
    await api.post(`/templates/${template.id}/word-placeholders`, {
      placeholders: preview.unlinked.map((p) => ({ find: p, fieldKey: p })),
    });
    onUpdate();
  };

  const totalPlaceholders = preview ? preview.valid.length + preview.unlinked.length : 0;
  const hasMalformed = preview && preview.malformed.length > 0;
  const hasUnlinked = preview && preview.unlinked.length > 0;

  return (
    <div>
      {/* Upload */}
      <form onSubmit={handleUpload} className="bg-surface border border-border rounded-xl p-5 mb-6">
        <h3 className="font-semibold text-text mb-3">
          {template.wordFileName ? 'Replace Word File' : 'Upload Word Template'}
        </h3>
        {template.wordFileName && (
          <p className="text-sm text-text-secondary mb-3">
            Current file: <span className="font-medium text-text">{template.wordFileName}</span>
          </p>
        )}
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <input type="file" accept=".docx" required
              className="w-full px-3 py-1.5 bg-bg border border-border rounded-lg text-text text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:text-xs file:font-medium" />
          </div>
          <button type="submit" disabled={uploading} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>
        {error && <div className="mt-3 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}
        <p className="text-xs text-text-muted mt-3">
          Use placeholders like <code className="bg-bg px-1 py-0.5 rounded text-primary">{'{field_name}'}</code> in your Word document.
          Use only letters, numbers, and underscores. No spaces.
        </p>
      </form>

      {/* Loading */}
      {loadingPreview && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {preview && (
        <>
          {/* Validation summary */}
          {hasMalformed && (
            <div className="bg-danger-light border border-danger/30 rounded-xl p-5 mb-6">
              <h3 className="font-semibold text-danger mb-3">Errors Found — Fix in Word and Re-upload</h3>
              <div className="space-y-2">
                {preview.malformed.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 px-3 bg-white/60 rounded-lg">
                    <code className="text-xs text-danger font-medium flex-shrink-0 mt-0.5">{m.text}</code>
                    <span className="text-xs text-text">{m.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Document preview */}
            <div className="lg:col-span-2">
              <h3 className="font-semibold text-text mb-3">Document Preview</h3>
              <div className="bg-white border border-border rounded-xl p-8 shadow-sm prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.html) }} />
            </div>

            {/* Placeholder validation */}
            <div>
              <h3 className="font-semibold text-text mb-3">
                Placeholders
                {totalPlaceholders > 0 && <span className="text-text-muted font-normal ml-1">({totalPlaceholders})</span>}
              </h3>

              <div className="space-y-4">
                {/* Valid / linked */}
                {preview.valid.length > 0 && (
                  <div className="bg-surface border border-border rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-success uppercase tracking-wide mb-2">Linked ({preview.valid.length})</h4>
                    <div className="space-y-1.5">
                      {preview.valid.map((p) => (
                        <div key={p} className="flex items-center justify-between py-1.5 px-3 bg-success-light/50 rounded-lg">
                          <code className="text-xs text-text font-medium">{'{' + p + '}'}</code>
                          <span className="text-xs text-success font-medium">OK</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unlinked — valid format but no matching field */}
                {hasUnlinked && (
                  <div className="bg-surface border border-warning/30 rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-warning uppercase tracking-wide mb-2">Not Linked ({preview.unlinked.length})</h4>
                    <p className="text-xs text-text-muted mb-3">These placeholders are valid but don&apos;t have matching fields yet.</p>
                    <div className="space-y-1.5 mb-3">
                      {preview.unlinked.map((p) => (
                        <div key={p} className="flex items-center justify-between py-1.5 px-3 bg-warning-light/50 rounded-lg">
                          <code className="text-xs text-text font-medium">{'{' + p + '}'}</code>
                          <span className="text-xs text-warning font-medium">No field</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleSyncPlaceholders}
                      className="w-full px-3 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover">
                      Create Fields for All ({preview.unlinked.length})
                    </button>
                  </div>
                )}

                {/* No placeholders at all */}
                {totalPlaceholders === 0 && !hasMalformed && (
                  <div className="bg-surface border border-border rounded-xl p-5 text-center">
                    <p className="text-sm text-text-muted">
                      No placeholders found in the document.
                    </p>
                    <p className="text-xs text-text-muted mt-2">
                      Add <code className="bg-bg px-1 py-0.5 rounded text-primary">{'{field_name}'}</code> in your Word file where values should go.
                    </p>
                  </div>
                )}

                {/* All good */}
                {preview.valid.length > 0 && !hasUnlinked && !hasMalformed && (
                  <div className="p-3 bg-success-light text-success rounded-lg text-sm text-center font-medium">
                    All placeholders are valid and linked!
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
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
