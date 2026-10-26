'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useUnsavedChangesGuard, confirmLeave } from '@/lib/unsaved-changes';
import { logger } from '@/lib/logger';
import { useAuth } from '@/lib/auth-context';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { TranslateKeyForm } from '@/components/TranslateKeyForm';

interface Language { id: string; code: string; name: string; direction: string; }
interface FieldLabel { id: string; languageId: string; label: string; language: Language; }
interface TemplateField { id: string; fieldKey: string; fieldType: string; sortOrder: number; required: boolean; groupKey: string | null; labels: FieldLabel[]; }
interface FieldValue { id: string; templateFieldId: string; pageNumber: number; entryIndex: number | null; value: string; }
interface Doc {
  id: string; jobId: string; templateId: string; status: string; clonedFromId: string | null;
  template: { id: string; name: string; type: string; fields: TemplateField[] };
  fieldValues: FieldValue[];
}
interface Job { id: string; title: string; jobNumber: string; status: string; sourceLanguage: Language; targetLanguage: Language | null; }

const LOCKED_JOB_STATUSES = ['delivered', 'invoiced', 'paid'];

export default function DocumentFillPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role?.name === 'Admin';
  const [doc, setDoc] = useState<Doc | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'danger' } | null>(null);
  // null until known; false = no Google Translate key, GT buttons open the set-up prompt
  const [gtConfigured, setGtConfigured] = useState<boolean | null>(null);
  const [gtSetupOpen, setGtSetupOpen] = useState(false);
  const [gtOpen, setGtOpen] = useState<{ fieldKey: string; fieldId: string; page: number; entry?: number } | null>(null);
  const [groupEntries, setGroupEntries] = useState<Record<string, number>>({});
  const [dirty, setDirty] = useState(false);

  // Warn on unsaved changes (browser close, sidebar links, search, notifications)
  useUnsavedChangesGuard(dirty);

  useEffect(() => {
    api.get<{ configured: boolean }>('/translate/status')
      .then((s) => setGtConfigured(s.configured))
      .catch(() => setGtConfigured(null));
  }, []);

  useEffect(() => {
    api.get<Doc>(`/documents/${id}`).then((d) => {
      setDoc(d);
      api.get<Job>(`/jobs/${d.jobId}`).then(setJob).catch((err) => {
        logger.error('Failed to load job for document', err, 'documents');
        router.push('/jobs');
      });
      // Build values map: "fieldId_pageNum_entryIdx" => value
      const map: Record<string, string> = {};
      d.fieldValues.forEach((fv) => {
        const key = `${fv.templateFieldId}_${fv.pageNumber}_${fv.entryIndex ?? ''}`;
        map[key] = fv.value;
      });
      setValues(map);

      // Count existing entries per group
      const groupFields: Record<string, TemplateField[]> = {};
      d.template.fields.filter((f) => f.groupKey).forEach((f) => {
        if (!groupFields[f.groupKey!]) groupFields[f.groupKey!] = [];
        groupFields[f.groupKey!].push(f);
      });
      const counts: Record<string, number> = {};
      Object.keys(groupFields).forEach((gk) => {
        const firstField = groupFields[gk][0];
        let max = 0;
        Object.keys(map).forEach((k) => {
          if (k.startsWith(`${firstField.id}_`)) {
            const parts = k.split('_');
            const entry = parseInt(parts[2]) || 0;
            if (entry > max) max = entry;
          }
        });
        counts[gk] = Math.max(max + 1, 1);
      });
      setGroupEntries(counts);
    }).catch((err) => { logger.error('Failed to load document', err, 'documents'); router.push('/jobs'); });
  }, [id]);

  if (!doc || !job) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const locked = LOCKED_JOB_STATUSES.includes(job.status);
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

  const flash = (text: string, tone: 'success' | 'danger' = 'success') => {
    setMessage({ text, tone });
    if (tone === 'success') setTimeout(() => setMessage(null), 3000);
  };

  const setValue = (fieldId: string, page: number, value: string, entry?: number) => {
    const key = getValueKey(fieldId, page, entry);
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
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

  // Resolves false (with the error shown) if the save failed.
  const handleSave = async (): Promise<boolean> => {
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

    try {
      await api.post(`/documents/${doc.id}/save-values`, { values: fieldValues });
      setDirty(false);
      flash('Saved');
      return true;
    } catch (err) {
      logger.error('Failed to save document', err, 'documents');
      flash(err instanceof ApiError ? `Save failed: ${err.message}` : 'Save failed', 'danger');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!(await handleSave())) return;
    try {
      await api.patch(`/documents/${doc.id}/status`, { status: 'completed' });
      router.push(`/jobs/${doc.jobId}`);
    } catch (err) {
      logger.error('Failed to complete document', err, 'documents');
      flash(err instanceof ApiError ? err.message : 'Could not mark the document complete', 'danger');
    }
  };

  const handleExport = async () => {
    // A locked job's document can't be saved, only exported as it stands.
    if (!locked && dirty && !(await handleSave())) return;
    try {
      await api.download(`/documents/${doc.id}/export`, `${job.jobNumber} ${doc.template.name}.docx`);
      flash('Exported successfully');
    } catch (err) {
      logger.error('Export failed', err, 'documents');
      flash(err instanceof ApiError ? err.message : 'Export failed', 'danger');
    }
  };

  // Repeatable group entries tracking (state initialized in useEffect above)

  const addGroupEntry = (groupKey: string) => {
    setGroupEntries({ ...groupEntries, [groupKey]: (groupEntries[groupKey] || 1) + 1 });
  };

  const renderField = (field: TemplateField, pageNum: number, entryIdx?: number) => {
    const labels = getFieldLabel(field);
    const val = getValue(field.id, pageNum, entryIdx);
    const key = getValueKey(field.id, pageNum, entryIdx);

    const inputId = `f-${key}`;

    return (
      <div key={key} className="mb-4">
        <div className="flex justify-between items-baseline mb-1">
          <label htmlFor={inputId}>
            <span className="text-sm font-medium text-text">{labels.target}</span>
            {labels.source && <span className="text-xs text-text-muted ml-2">{labels.source}</span>}
          </label>
          {!locked && field.fieldType !== 'date' && field.fieldType !== 'number' && (
            <button
              type="button"
              onClick={() => gtConfigured === false
                ? setGtSetupOpen(true)
                : setGtOpen({ fieldKey: field.fieldKey, fieldId: field.id, page: pageNum, entry: entryIdx })}
              title={gtConfigured === false ? 'Google Translate is not set up' : 'Google Translate helper'}
              className={`px-2 py-0.5 tone rounded text-xs font-medium ${gtConfigured === false ? 'tone-neutral opacity-70' : 'tone-primary hover:bg-primary/20'}`}
            >
              GT
            </button>
          )}
        </div>
        {field.fieldType === 'textarea' ? (
          <textarea
            id={inputId}
            value={val}
            disabled={locked}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            rows={3}
            dir={targetLang?.direction === 'rtl' ? 'rtl' : 'ltr'}
            className="input w-full resize-none"
          />
        ) : field.fieldType === 'date' ? (
          <input
            type="date"
            id={inputId}
            value={val}
            disabled={locked}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            className="input w-full"
          />
        ) : field.fieldType === 'number' ? (
          <input
            type="number"
            id={inputId}
            value={val}
            disabled={locked}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            className="input w-full"
          />
        ) : (
          <input
            type="text"
            id={inputId}
            value={val}
            disabled={locked}
            onChange={(e) => setValue(field.id, pageNum, e.target.value, entryIdx)}
            dir={targetLang?.direction === 'rtl' ? 'rtl' : 'ltr'}
            className="input w-full"
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
          <button onClick={async () => { if (await confirmLeave()) router.push(`/jobs/${doc.jobId}`); }} className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text transition-colors mb-3">
            ← Back to {job.jobNumber} — {job.title}
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-text">{doc.template.name}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {sourceLang.name}{targetLang ? ` → ${targetLang.name}` : ''} —
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
              doc.status === 'completed' ? 'tone tone-success' : 'tone tone-warning'
            }`}>{doc.status === 'completed' ? 'Completed' : 'Draft'}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!locked && (
            <>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="primary" onClick={handleMarkComplete} disabled={saving}>
                Save & Complete
              </Button>
            </>
          )}
          {doc.template.type !== 'simple' && (
            <Button variant={locked ? 'primary' : 'secondary'} onClick={handleExport}>
              Export .docx
            </Button>
          )}
        </div>
      </div>

      {locked && (
        <Alert tone="warning" className="mb-4 max-w-2xl">
          This job is {job.status}, so its documents are read-only. Reopen the job to make changes.
        </Alert>
      )}
      {!locked && gtConfigured === false && (
        <Alert tone="info" className="mb-4 max-w-2xl">
          Google Translate isn&apos;t set up, so the GT helper is off.{' '}
          {isAdmin
            ? <button type="button" onClick={() => setGtSetupOpen(true)} className="font-semibold underline">Add an API key</button>
            : 'Ask an admin to add an API key in Settings.'}
        </Alert>
      )}
      {message && <Alert tone={message.tone} className="mb-4 max-w-2xl">{message.text}</Alert>}

      {/* Fields */}
      <div className="max-w-2xl">
        {/* Fixed fields */}
        {fixedFields.length > 0 && (
          <div className="card p-6 mb-6">
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
                  <h3 className="font-semibold text-text text-sm">{humanize(groupKey)}</h3>
                  <span className="px-2 py-0.5 tone tone-accent rounded text-xs font-medium">Repeatable</span>
                </div>
                {!locked && (
                  <Button size="sm" onClick={() => addGroupEntry(groupKey)}>
                    + Add Entry
                  </Button>
                )}
              </div>

              {Array.from({ length: entryCount }, (_, entryIdx) => (
                <div key={entryIdx} className="card p-6 mb-3">
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
            // Write back to the exact field/page/entry the GT popup was opened from.
            setValue(gtOpen.fieldId, gtOpen.page, text, gtOpen.entry);
            setGtOpen(null);
          }}
          onClose={() => setGtOpen(null)}
        />
      )}

      {gtSetupOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setGtSetupOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="gt-setup-title" className="card p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 id="gt-setup-title" className="font-semibold text-text mb-2">Google Translate isn&apos;t set up</h3>
            {isAdmin ? (
              <>
                <p className="text-sm text-text-secondary mb-4">Add a Google Cloud Translation API key to turn on the GT helper for everyone.</p>
                <TranslateKeyForm keySet={false} onSaved={(keySet) => { setGtConfigured(keySet); if (keySet) setGtSetupOpen(false); }} />
              </>
            ) : (
              <p className="text-sm text-text-secondary">The GT helper needs a Google Translate API key. Ask an admin to add one in Settings &gt; General.</p>
            )}
            <div className="flex justify-end mt-5">
              <Button onClick={() => setGtSetupOpen(false)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Google Translate Popup ──

function GTPopup({ sourceLanguage, targetLanguage, onCopy, onClose }: {
  sourceLanguage: { code: string; name: string; direction?: string };
  targetLanguage: { code: string; name: string; direction?: string } | null;
  onCopy: (text: string) => void;
  onClose: () => void;
}) {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.post<{ translatedText: string }>('/translate', {
        text: sourceText,
        from: sourceLanguage.code,
        to: targetLanguage?.code || 'en',
      });
      setTranslatedText(result.translatedText);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Translation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="card p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold text-text">Google Translate Helper</h3>
          <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text text-lg">&times;</button>
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
            className="input w-full resize-none"
            dir={sourceLanguage.direction === 'rtl' ? 'rtl' : 'ltr'}
          />
        </div>

        <div className="text-center mb-4">
          <button onClick={handleTranslate} disabled={loading || !sourceText.trim()}
            className="btn btn-primary">
            {loading ? 'Translating...' : 'Translate ↓'}
          </button>
        </div>
        {error && <div className="mb-4 p-3 tone tone-danger rounded-lg text-sm">{error}</div>}

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
          <Button onClick={onClose}>Close</Button>
          {translatedText && (
            <Button variant="primary" onClick={() => onCopy(translatedText)}>
              Copy to Field
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
