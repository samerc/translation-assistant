'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';

interface Language { id: string; code: string; name: string; direction: string; }
interface FieldLabel { id: string; languageId: string; label: string; language: Language; }
interface TemplateField { id: string; fieldKey: string; fieldType: string; sortOrder: number; required: boolean; groupKey: string | null; labels: FieldLabel[]; }
interface FieldValue { id: string; templateFieldId: string; pageNumber: number; entryIndex: number | null; value: string; }
interface Doc {
  id: string; jobId: string; templateId: string; status: string; clonedFromId: string | null;
  template: { id: string; name: string; type: string; fields: TemplateField[] };
  fieldValues: FieldValue[];
}
interface Job { id: string; title: string; jobNumber: string; sourceLanguage: Language; targetLanguage: Language | null; }

export default function DocumentFillPage() {
  const { id } = useParams();
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [gtOpen, setGtOpen] = useState<{ fieldKey: string; fieldId: string } | null>(null);

  useEffect(() => {
    api.get<Doc>(`/documents/${id}`).then((d) => {
      setDoc(d);
      api.get<Job>(`/jobs/${d.jobId}`).then(setJob);
      // Build values map: "fieldId_pageNum_entryIdx" => value
      const map: Record<string, string> = {};
      d.fieldValues.forEach((fv) => {
        const key = `${fv.templateFieldId}_${fv.pageNumber}_${fv.entryIndex ?? ''}`;
        map[key] = fv.value;
      });
      setValues(map);
    }).catch((err) => { logger.error('Failed to load document', err, 'documents'); router.push('/jobs'); });
  }, [id]);

  if (!doc || !job) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const targetLang = job.targetLanguage;
  const sourceLang = job.sourceLanguage;
  const fields = [...doc.template.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const fixedFields = fields.filter((f) => !f.groupKey);
  const groups: Record<string, TemplateField[]> = {};
  fields.filter((f) => f.groupKey).forEach((f) => {
    if (!groups[f.groupKey!]) groups[f.groupKey!] = [];
    groups[f.groupKey!].push(f);
  });

  const getValueKey = (fieldId: string, page: number, entry?: number) =>
    `${fieldId}_${page}_${entry ?? ''}`;

  const getValue = (fieldId: string, page: number, entry?: number) =>
    values[getValueKey(fieldId, page, entry)] || '';

  const setValue = (fieldId: string, page: number, value: string, entry?: number) => {
    setValues({ ...values, [getValueKey(fieldId, page, entry)]: value });
  };

  const getFieldLabel = (field: TemplateField): { target: string; source: string } => {
    const targetLabel = targetLang
      ? field.labels.find((l) => l.languageId === targetLang.id)?.label
      : field.labels[0]?.label;
    const sourceLabel = field.labels.find((l) => l.languageId === sourceLang.id)?.label;
    return {
      target: targetLabel || field.fieldKey,
      source: sourceLabel || '',
    };
  };

  const handleSave = async () => {
    setSaving(true);
    const fieldValues = Object.entries(values)
      .filter(([, v]) => v.trim())
      .map(([key, value]) => {
        const [fieldId, page, entry] = key.split('_');
        return {
          templateFieldId: fieldId,
          pageNumber: parseInt(page) || 1,
          entryIndex: entry ? parseInt(entry) : undefined,
          value,
        };
      });

    await api.post(`/documents/${doc.id}/save-values`, { values: fieldValues });
    setMessage('Saved');
    setSaving(false);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleMarkComplete = async () => {
    await handleSave();
    await api.patch(`/documents/${doc.id}/status`, { status: 'completed' });
    router.push(`/jobs/${doc.jobId}`);
  };

  const handleExport = async () => {
    await handleSave();
    const token = localStorage.getItem('accessToken');
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api'}/documents/${doc.id}/export`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: 'Export failed' }));
        setMessage(data.message || 'Export failed');
        return;
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'export.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      setMessage('Exported successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      logger.error('Export failed', err, 'documents');
      setMessage('Export failed');
    }
  };

  // Repeatable group entries tracking
  const [groupEntries, setGroupEntries] = useState<Record<string, number>>(() => {
    // Count existing entries per group from loaded values
    const counts: Record<string, number> = {};
    Object.keys(groups).forEach((gk) => {
      const firstField = groups[gk][0];
      let max = 0;
      Object.keys(values).forEach((k) => {
        if (k.startsWith(`${firstField.id}_`)) {
          const parts = k.split('_');
          const entry = parseInt(parts[2]) || 0;
          if (entry > max) max = entry;
        }
      });
      counts[gk] = Math.max(max + 1, 1);
    });
    return counts;
  });

  const addGroupEntry = (groupKey: string) => {
    setGroupEntries({ ...groupEntries, [groupKey]: (groupEntries[groupKey] || 1) + 1 });
  };

  const renderField = (field: TemplateField, pageNum: number, entryIdx?: number) => {
    const labels = getFieldLabel(field);
    const val = getValue(field.id, pageNum, entryIdx);
    const key = getValueKey(field.id, pageNum, entryIdx);

    return (
      <div key={key} className="mb-4">
        <div className="flex justify-between items-baseline mb-1">
          <div>
            <span className="text-sm font-medium text-text">{labels.target}</span>
            {labels.source && <span className="text-xs text-text-muted ml-2">{labels.source}</span>}
          </div>
          <button
            type="button"
            onClick={() => setGtOpen({ fieldKey: field.fieldKey, fieldId: field.id })}
            className="px-2 py-0.5 bg-primary-light text-primary rounded text-xs font-medium hover:bg-primary/20"
          >
            GT
          </button>
        </div>
        {field.fieldType === 'textarea' ? (
          <textarea
            value={val}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            rows={3}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        ) : field.fieldType === 'date' ? (
          <input
            type="date"
            value={val}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : field.fieldType === 'number' ? (
          <input
            type="number"
            value={val}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <input
            type="text"
            value={val}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <button onClick={() => router.push(`/jobs/${doc.jobId}`)} className="text-sm text-text-secondary hover:text-primary mb-2 inline-block">
            ← Back to {job.jobNumber} — {job.title}
          </button>
          <h1 className="text-2xl font-bold text-text">{doc.template.name}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {sourceLang.name}{targetLang ? ` → ${targetLang.name}` : ''} —
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
              doc.status === 'completed' ? 'bg-success-light text-success' : 'bg-warning-light text-warning'
            }`}>{doc.status === 'completed' ? 'Completed' : 'Draft'}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success/80 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={handleMarkComplete}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover">
            Save & Complete
          </button>
          {doc.template.type !== 'simple' && (
            <button onClick={handleExport}
              className="px-4 py-2 bg-bg border border-border text-text rounded-lg text-sm font-medium hover:bg-border/50">
              Export .docx
            </button>
          )}
        </div>
      </div>

      {message && <div className="mb-4 p-3 bg-success-light text-success rounded-lg text-sm">{message}</div>}

      {/* Fields */}
      <div className="max-w-2xl">
        {/* Fixed fields */}
        {fixedFields.length > 0 && (
          <div className="bg-surface border border-border rounded-xl p-6 mb-6">
            {fixedFields.map((field) => renderField(field, 1))}
          </div>
        )}

        {/* Grouped fields */}
        {Object.entries(groups).map(([groupKey, groupFields]) => {
          const entryCount = groupEntries[groupKey] || 1;
          return (
            <div key={groupKey} className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text text-sm">{groupKey}</h3>
                  <span className="px-2 py-0.5 bg-accent/20 text-accent rounded text-xs font-medium">Repeatable</span>
                </div>
                <button type="button" onClick={() => addGroupEntry(groupKey)}
                  className="px-3 py-1 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-hover">
                  + Add Entry
                </button>
              </div>

              {Array.from({ length: entryCount }, (_, entryIdx) => (
                <div key={entryIdx} className="bg-surface border border-border rounded-xl p-6 mb-3">
                  <div className="text-xs text-text-muted mb-3 font-medium">Entry {entryIdx + 1}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                    {groupFields.map((field) => renderField(field, 1, entryIdx))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Google Translate Popup */}
      {gtOpen && (
        <GTPopup
          sourceLanguage={sourceLang}
          targetLanguage={targetLang}
          onCopy={(text) => {
            // Find the field and set its value
            const field = fields.find((f) => f.id === gtOpen.fieldId);
            if (field) {
              setValue(gtOpen.fieldId, 1, text);
            }
            setGtOpen(null);
          }}
          onClose={() => setGtOpen(null)}
        />
      )}
    </div>
  );
}

// ── Google Translate Popup ──

function GTPopup({ sourceLanguage, targetLanguage, onCopy, onClose }: {
  sourceLanguage: { code: string; name: string };
  targetLanguage: { code: string; name: string } | null;
  onCopy: (text: string) => void;
  onClose: () => void;
}) {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setLoading(true);
    const result = await api.post<{ translatedText: string }>('/translate', {
      text: sourceText,
      from: sourceLanguage.code,
      to: targetLanguage?.code || 'en',
    });
    setTranslatedText(result.translatedText);
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold text-text">Google Translate Helper</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg">&times;</button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-text mb-1.5">
            Source ({sourceLanguage.name})
          </label>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            rows={3}
            autoFocus
            placeholder={`Type in ${sourceLanguage.name}...`}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            dir={sourceLanguage.code === 'ar' || sourceLanguage.code === 'he' ? 'rtl' : 'ltr'}
          />
        </div>

        <div className="text-center mb-4">
          <button onClick={handleTranslate} disabled={loading || !sourceText.trim()}
            className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50">
            {loading ? 'Translating...' : 'Translate ↓'}
          </button>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-text mb-1.5">
            Translation ({targetLanguage?.name || 'English'})
          </label>
          <div className={`px-3 py-2 rounded-lg text-sm min-h-[60px] ${
            translatedText
              ? 'bg-success-light/50 border-2 border-success/30 text-text'
              : 'bg-bg border border-border text-text-muted'
          }`}>
            {translatedText || 'Translation will appear here...'}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm">
            Close
          </button>
          {translatedText && (
            <button onClick={() => onCopy(translatedText)}
              className="px-4 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success/80">
              Copy to Field
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
