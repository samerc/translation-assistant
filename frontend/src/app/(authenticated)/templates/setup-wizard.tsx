'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Alert';
import { CheckIcon } from '@/components/ui/icons';

// ── Types ──

interface Language { id: string; code: string; name: string; direction: string; isActive: boolean }
interface FieldLabel { languageId: string; label: string }
interface TField {
  id: string; fieldKey: string; fieldType: string; sortOrder: number;
  required: boolean; groupKey: string | null; labels: FieldLabel[];
}
export interface WizardTemplate {
  id: string; type: 'designer' | 'word' | 'simple'; name: string; description: string | null;
  pricePerPage: number | string; discountedPricePerPage: number | string | null; isActive: boolean;
  wordFileName: string | null; wordFilePath: string | null; layoutJson: unknown[] | null;
  fields: TField[]; languages: Language[];
}
interface WordPreview {
  html: string; valid: string[]; unlinked: string[];
  malformed: { text: string; reason: string }[];
  groups: Record<string, string>; orphans: string[];
}

type StepId = 'basics' | 'word' | 'fields' | 'try' | 'done';
const STEP_LABEL: Record<StepId, string> = {
  basics: 'What is it', word: 'Word file', fields: 'Fields', try: 'Try it', done: 'Done',
};
function stepsFor(type: WizardTemplate['type']): StepId[] {
  if (type === 'simple') return ['basics', 'done'];
  if (type === 'designer') return ['basics', 'fields', 'try', 'done'];
  return ['basics', 'word', 'fields', 'try', 'done'];
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'image', label: 'Image' },
];
const KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
// A loop/group mismatch is fixed automatically by syncing; anything else is a real problem in the file.
const isGroupMismatch = (m: { reason: string }) => m.reason.startsWith('Used inside');

const errMsg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

// ── Wizard shell ──

export function TemplateSetupWizard({ templateId, initialStep }: { templateId?: string; initialStep?: string | null }) {
  const router = useRouter();
  const [tpl, setTpl] = useState<WizardTemplate | null>(null);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState<StepId>((initialStep as StepId) || 'basics');
  const [tried, setTried] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    api.get<Language[]>('/settings/languages')
      .then((l) => { if (!ignore) setLanguages(l.filter((x) => x.isActive)); })
      .catch(() => { if (!ignore) setLoadError('Couldn’t load languages.'); });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!templateId) return;
    let ignore = false;
    api.get<WizardTemplate>(`/templates/${templateId}`)
      .then((t) => { if (!ignore) setTpl(t); })
      .catch(() => { if (!ignore) setLoadError('This template no longer exists.'); });
    return () => { ignore = true; };
  }, [templateId, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  if (loadError) {
    return (
      <div className="max-w-3xl">
        <Alert className="mb-4">{loadError}</Alert>
        <Link href="/templates" className="text-sm text-primary-text underline">Back to templates</Link>
      </div>
    );
  }
  if (templateId && !tpl) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const steps = stepsFor(tpl?.type ?? 'word');
  const current = steps.includes(step) ? step : 'basics';
  const index = steps.indexOf(current);
  const go = (s: StepId) => { setStep(s); window.scrollTo({ top: 0 }); };
  const next = () => go(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => go(steps[Math.max(index - 1, 0)]);
  // Document languages, in the order the platform lists them.
  const docLanguages = tpl ? languages.filter((l) => tpl.languages.some((d) => d.id === l.id)) : [];

  return (
    <div className="max-w-4xl">
      <div className="mb-2">
        <Link href={tpl ? `/templates/${tpl.id}` : '/templates'} className="text-sm text-text-secondary hover:text-text">
          ← {tpl ? tpl.name : 'Templates'}
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-text mb-1">{tpl ? 'Set up template' : 'New template'}</h1>
      <p className="text-sm text-text-secondary mb-6">Step {index + 1} of {steps.length} · {STEP_LABEL[current]}</p>

      <ol className="flex flex-wrap gap-x-2 gap-y-2 mb-6" aria-label="Steps">
        {steps.map((s, i) => {
          const done = i < index;
          const active = i === index;
          // Steps after "What is it" need the template to exist.
          const reachable = !!tpl && i <= steps.length - 1;
          return (
            <li key={s} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable || active}
                onClick={() => go(s)}
                aria-current={active ? 'step' : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                  active ? 'border-primary bg-primary text-white' : done ? 'border-border bg-surface text-text' : 'border-border bg-surface text-text-muted'
                } ${reachable && !active ? 'hover:border-primary cursor-pointer' : ''}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${active ? 'bg-white/20' : done ? 'tone tone-success' : 'bg-bg'}`}>
                  {done ? <CheckIcon className="w-3 h-3" /> : i + 1}
                </span>
                {STEP_LABEL[s]}
              </button>
              {i < steps.length - 1 && <span className="text-text-muted" aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>

      {current === 'basics' && (
        <BasicsStep
          tpl={tpl}
          languages={languages}
          onSaved={(saved, created) => {
            const nextStep = stepsFor(saved.type)[1];
            if (created) router.replace(`/templates/${saved.id}/setup?step=${nextStep}`);
            else { setTpl(saved); go(nextStep); }
          }}
        />
      )}
      {tpl && current === 'word' && <WordStep tpl={tpl} onChanged={reload} onBack={back} onNext={next} />}
      {tpl && current === 'fields' && (
        <FieldsStep key={tpl.fields.map((f) => f.id).join()} tpl={tpl} docLanguages={docLanguages} onChanged={reload} onBack={back} onNext={next} />
      )}
      {tpl && current === 'try' && (
        <TryStep tpl={tpl} docLanguages={docLanguages} onTried={() => setTried(true)} onBack={back} onNext={next} />
      )}
      {tpl && current === 'done' && <DoneStep tpl={tpl} docLanguages={docLanguages} tried={tried} onBack={back} />}
    </div>
  );
}

function StepCard({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="text-lg font-semibold text-text mb-1">{title}</h2>
      {intro && <div className="text-sm text-text-secondary mb-5">{intro}</div>}
      {children}
    </div>
  );
}

function NavRow({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
      <div>{onBack && <Button onClick={onBack}>← Back</Button>}</div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

// ── ① What is it ──

function BasicsStep({ tpl, languages, onSaved }: {
  tpl: WizardTemplate | null;
  languages: Language[];
  onSaved: (t: WizardTemplate, created: boolean) => void;
}) {
  const [form, setForm] = useState({
    name: tpl?.name ?? '',
    description: tpl?.description ?? '',
    pricePerPage: tpl ? String(tpl.pricePerPage ?? '') : '',
    discountedPricePerPage: tpl?.discountedPricePerPage != null ? String(tpl.discountedPricePerPage) : '',
    type: tpl?.type ?? ('word' as WizardTemplate['type']),
  });
  const [langIds, setLangIds] = useState<string[]>(tpl?.languages.map((l) => l.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleLang = (id: string) => setLangIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.type !== 'simple' && langIds.length === 0) {
      setError('Pick at least one document language.');
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      pricePerPage: parseFloat(form.pricePerPage) || 0,
      ...(form.discountedPricePerPage ? { discountedPricePerPage: parseFloat(form.discountedPricePerPage) } : {}),
      languageIds: langIds,
    };
    try {
      if (tpl) {
        onSaved(await api.patch<WizardTemplate>(`/templates/${tpl.id}`, body), false);
      } else {
        onSaved(await api.post<WizardTemplate>('/templates', { ...body, type: form.type, isActive: false }), true);
      }
    } catch (err) {
      setError(errMsg(err, 'Failed to save the template.'));
      setSaving(false);
    }
  };

  const typeOptions: { value: WizardTemplate['type']; title: string; text: string }[] = [
    { value: 'word', title: 'From my Word file', text: 'Recommended. You write the document in Word with placeholders; translators fill in a form and download it filled in.' },
    { value: 'designer', title: 'Build the layout here', text: 'Advanced. No Word file: you define the fields, and a clean document is generated from them (optionally with a custom layout).' },
    { value: 'simple', title: 'No form — pricing only', text: 'For freeform jobs: just a name and a price per page. No document is produced.' },
  ];

  return (
    <form onSubmit={submit}>
      <StepCard title="What is this template?" intro="A template is one kind of document you translate, for example a birth certificate.">
        {error && <Alert className="mb-4">{error}</Alert>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" htmlFor="w-name" required className="sm:col-span-2">
            <Input id="w-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={255} placeholder="e.g. Birth certificate" autoFocus />
          </Field>
          <Field label="Description" htmlFor="w-desc" hint="Optional" className="sm:col-span-2">
            <Textarea id="w-desc" rows={2} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Price per page" htmlFor="w-price" required>
            <Input id="w-price" type="number" step="0.01" min="0" required value={form.pricePerPage} onChange={(e) => setForm({ ...form, pricePerPage: e.target.value })} />
          </Field>
          <Field label="Discounted price per page" htmlFor="w-disc" hint="Optional">
            <Input id="w-disc" type="number" step="0.01" min="0" value={form.discountedPricePerPage} onChange={(e) => setForm({ ...form, discountedPricePerPage: e.target.value })} />
          </Field>
        </div>

        {!tpl && (
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-text mb-2">How is the translation produced?</legend>
            <div className="space-y-2">
              {typeOptions.map((o) => (
                <label key={o.value} className={`flex gap-3 items-start rounded-lg border p-3 cursor-pointer ${form.type === o.value ? 'border-primary bg-primary-light' : 'border-border'}`}>
                  <input type="radio" name="w-type" className="mt-1" checked={form.type === o.value} onChange={() => setForm({ ...form, type: o.value })} />
                  <span>
                    <span className="block text-sm font-semibold text-text">{o.title}</span>
                    <span className="block text-sm text-text-secondary">{o.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {form.type !== 'simple' && (
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-text mb-1">Document languages</legend>
            <p className="text-sm text-text-secondary mb-2">
              The languages this document is produced in. You&apos;ll be asked for field labels in these only, and the template is offered for jobs translating into them.
            </p>
            <div className="flex flex-wrap gap-2">
              {languages.map((l) => (
                <label key={l.id} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer ${langIds.includes(l.id) ? 'border-primary bg-primary-light text-primary-text' : 'border-border text-text'}`}>
                  <input type="checkbox" checked={langIds.includes(l.id)} onChange={() => toggleLang(l.id)} />
                  {l.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </StepCard>
      <NavRow>
        <Link href={tpl ? `/templates/${tpl.id}` : '/templates'} className="btn btn-secondary">Cancel</Link>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Next →'}</Button>
      </NavRow>
    </form>
  );
}

// ── ② Word file ──

function CopyCode({ text }: { text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.error('Couldn’t copy — select it and copy by hand.');
    }
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="bg-bg border border-border rounded px-1.5 py-0.5 text-xs text-text">{text}</code>
      <button type="button" onClick={copy} className="text-xs text-primary-text underline">Copy</button>
    </span>
  );
}

function WordStep({ tpl, onChanged, onBack, onNext }: { tpl: WizardTemplate; onChanged: () => void; onBack: () => void; onNext: () => void }) {
  const [preview, setPreview] = useState<WordPreview | null>(null);
  const [busy, setBusy] = useState<'upload' | 'check' | null>(tpl.wordFilePath ? 'check' : null);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  /** Read the file's placeholders; create missing fields and fix loop groups automatically. */
  const inspect = async (): Promise<WordPreview> => {
    let p = await api.get<WordPreview>(`/templates/${tpl.id}/word-preview`);
    const realProblems = p.malformed.filter((m) => !isGroupMismatch(m));
    if (realProblems.length === 0 && (p.unlinked.length > 0 || p.malformed.some(isGroupMismatch))) {
      await api.post(`/templates/${tpl.id}/word-placeholders`, {
        placeholders: p.unlinked.map((k) => ({ find: k, fieldKey: k })),
      });
      p = await api.get<WordPreview>(`/templates/${tpl.id}/word-preview`);
      onChanged();
    }
    return p;
  };

  useEffect(() => {
    if (!tpl.wordFilePath) return;
    let ignore = false;
    inspect()
      .then((p) => { if (!ignore) setPreview(p); })
      .catch((err) => { if (!ignore) setError(errMsg(err, 'Couldn’t read the Word file.')); })
      .finally(() => { if (!ignore) setBusy(null); });
    return () => { ignore = true; };
    // Inspect once when the step opens; uploads re-inspect themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl.id]);

  const upload = async (file: File) => {
    setError('');
    setBusy('upload');
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.upload(`/templates/${tpl.id}/upload-word`, fd, 'POST');
      setPreview(await inspect());
      onChanged();
    } catch (err) {
      setError(errMsg(err, 'Upload failed.'));
    } finally {
      setBusy(null);
    }
  };

  const downloadExample = async () => {
    try {
      await api.download('/templates/example-docx', 'Example template.docx', 'GET');
    } catch (err) {
      toast.error(errMsg(err, 'Couldn’t download the example.'));
    }
  };

  const problems = preview?.malformed.filter((m) => !isGroupMismatch(m)) ?? [];
  const found = preview ? [...preview.valid, ...preview.unlinked] : [];
  const loops = preview ? [...new Set(Object.values(preview.groups))] : [];
  const hasFile = !!tpl.wordFileName;
  const canContinue = hasFile && !!preview && problems.length === 0 && found.length > 0 && !busy;

  return (
    <div>
      <StepCard title="Your Word file" intro="Write the translated document in Word, with placeholders where the values go. Translators then fill in a form, and the Word file comes out filled in.">
        <ol className="list-decimal pl-5 space-y-3 text-sm text-text mb-5">
          <li>Write the document in Word as usual, in its final layout.</li>
          <li>
            Where a value goes, type its name in braces: <CopyCode text="{full_name}" /> <CopyCode text="{date_of_birth}" />
            <div className="text-xs text-text-muted mt-1">Names use letters, numbers and underscores only — no spaces.</div>
          </li>
          <li>
            For a part that repeats (for example one table row per child), put <CopyCode text="{#children}" /> before it and <CopyCode text="{/children}" /> after it.
            <div className="text-xs text-text-muted mt-1">In a table, put the opening tag in the row&apos;s first cell and the closing tag in its last cell: the row repeats once per child.</div>
          </li>
        </ol>
        <Button onClick={downloadExample}>↓ Download an example .docx</Button>

        <div className="border-t border-border mt-6 pt-5">
          <label className="block text-sm font-semibold text-text mb-2">{hasFile ? 'Replace the Word file' : 'Upload your Word file'}</label>
          <input
            type="file"
            accept=".docx"
            disabled={busy !== null}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }}
            className="block w-full text-sm text-text file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-primary file:text-white file:text-sm file:font-medium"
          />
          {hasFile && <p className="text-sm text-text-secondary mt-2">Current file: <span className="font-medium text-text">{tpl.wordFileName}</span></p>}
          {busy === 'upload' && <p className="text-sm text-text-secondary mt-2">Uploading and checking…</p>}
          {busy === 'check' && <p className="text-sm text-text-secondary mt-2">Checking the file…</p>}
          {error && <Alert className="mt-3">{error}</Alert>}
        </div>

        {preview && (
          <div className="mt-5 space-y-3">
            {problems.length > 0 && (
              <Alert>
                <div className="font-semibold mb-1">{problems.length === 1 ? '1 problem' : `${problems.length} problems`} — fix in Word and upload again</div>
                <ul className="space-y-1">
                  {problems.map((m, i) => (
                    <li key={i}><code className="font-medium">{m.text}</code> — {m.reason}</li>
                  ))}
                </ul>
              </Alert>
            )}
            {found.length === 0 && problems.length === 0 && (
              <Alert tone="warning">No placeholders found. Add <code>{'{field_name}'}</code> where values should go, then upload again.</Alert>
            )}
            {found.length > 0 && (
              <div className="tone tone-success rounded-lg p-3 text-sm">
                Found {found.length} value{found.length === 1 ? '' : 's'}: {found.join(', ')}
                {loops.length > 0 && <div className="mt-1">Repeating part{loops.length === 1 ? '' : 's'}: {loops.join(', ')}</div>}
              </div>
            )}
            <button type="button" onClick={() => setShowPreview((v) => !v)} className="text-sm text-primary-text underline">
              {showPreview ? 'Hide' : 'Show'} the document preview
            </button>
            {showPreview && (
              <div className="bg-white text-black border border-border rounded-xl p-6 prose prose-sm max-w-none overflow-x-auto"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(preview.html) }} />
            )}
          </div>
        )}
      </StepCard>
      <NavRow onBack={onBack}>
        {!canContinue && hasFile && problems.length > 0 && <span className="text-sm text-text-muted">Fix the problems to continue</span>}
        <Button variant="primary" disabled={!canContinue} onClick={onNext}>Next →</Button>
      </NavRow>
    </div>
  );
}

// ── ③ Fields ──

interface Row { labels: Record<string, string>; fieldType: string; required: boolean }

function FieldsStep({ tpl, docLanguages, onChanged, onBack, onNext }: {
  tpl: WizardTemplate; docLanguages: Language[]; onChanged: () => void; onBack: () => void; onNext: () => void;
}) {
  const sorted = [...tpl.fields].sort((a, b) => a.sortOrder - b.sortOrder);
  const first = docLanguages[0];
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(sorted.map((f) => {
      const labels: Record<string, string> = {};
      for (const l of docLanguages) labels[l.id] = f.labels.find((x) => x.languageId === l.id)?.label ?? '';
      if (first && !labels[first.id]) labels[first.id] = humanize(f.fieldKey);
      return [f.id, { labels, fieldType: f.fieldType, required: f.required }];
    })),
  );
  const [orphans, setOrphans] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newField, setNewField] = useState({ key: '', group: '', fieldType: 'text' });

  useEffect(() => {
    if (tpl.type !== 'word' || !tpl.wordFilePath) return;
    let ignore = false;
    api.get<WordPreview>(`/templates/${tpl.id}/word-preview`)
      .then((p) => { if (!ignore) setOrphans(p.orphans); })
      .catch(() => {});
    return () => { ignore = true; };
  }, [tpl.id, tpl.type, tpl.wordFilePath]);

  const setRow = (id: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }));
  const setLabel = (id: string, langId: string, value: string) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], labels: { ...r[id].labels, [langId]: value } } }));

  const removeField = async (f: TField) => {
    if (!(await confirmDialog({ title: `Remove ${f.fieldKey}?`, message: 'The field is deleted from this template.', confirmText: 'Remove', danger: true }))) return;
    try {
      await api.delete(`/templates/${tpl.id}/fields/${f.id}`);
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Couldn’t remove the field.'));
    }
  };

  const addField = async (e: FormEvent) => {
    e.preventDefault();
    const key = newField.key.trim();
    if (!KEY_PATTERN.test(key)) {
      toast.error('Use letters, numbers and underscores only, starting with a letter (e.g. full_name).');
      return;
    }
    try {
      await api.post(`/templates/${tpl.id}/fields`, {
        fieldKey: key,
        fieldType: newField.fieldType,
        ...(newField.group.trim() ? { groupKey: newField.group.trim() } : {}),
        ...(first ? { labels: [{ languageId: first.id, label: humanize(key) }] } : {}),
      });
      setNewField({ key: '', group: '', fieldType: 'text' });
      onChanged();
    } catch (err) {
      toast.error(errMsg(err, 'Couldn’t add the field.'));
    }
  };

  const save = async () => {
    setError('');
    if (first && sorted.some((f) => !rows[f.id]?.labels[first.id]?.trim())) {
      setError(`Every field needs a ${first.name} label.`);
      return;
    }
    setSaving(true);
    try {
      for (const f of sorted) {
        const r = rows[f.id];
        const labels = Object.entries(r.labels)
          .filter(([, v]) => v.trim())
          .map(([languageId, label]) => ({ languageId, label: label.trim() }));
        // Keep labels in languages that aren't document languages (e.g. older ones).
        for (const old of f.labels) {
          if (!docLanguages.some((l) => l.id === old.languageId)) labels.push({ languageId: old.languageId, label: old.label });
        }
        const sameLabels = labels.length === f.labels.length && labels.every((l) => f.labels.some((o) => o.languageId === l.languageId && o.label === l.label));
        if (sameLabels && r.fieldType === f.fieldType && r.required === f.required) continue;
        await api.patch(`/templates/${tpl.id}/fields/${f.id}`, { labels, fieldType: r.fieldType, required: r.required });
      }
      onChanged();
      onNext();
    } catch (err) {
      setError(errMsg(err, 'Couldn’t save the fields.'));
    } finally {
      setSaving(false);
    }
  };

  // Fixed fields first, then one section per repeating group.
  const sections: { group: string | null; fields: TField[] }[] = [{ group: null, fields: sorted.filter((f) => !f.groupKey) }];
  for (const g of [...new Set(sorted.map((f) => f.groupKey).filter(Boolean))] as string[]) {
    sections.push({ group: g, fields: sorted.filter((f) => f.groupKey === g) });
  }

  return (
    <div>
      <StepCard
        title="Fields"
        intro={<>These are the boxes translators fill in. Labels appear on that form{docLanguages.length > 1 ? ` — ${first?.name} is required, the others are optional (empty falls back to ${first?.name})` : ''}.</>}
      >
        {error && <Alert className="mb-4">{error}</Alert>}
        {sorted.length === 0 && (
          <p className="text-sm text-text-muted mb-4">
            {tpl.type === 'word' ? 'No fields yet — go back and upload a Word file with placeholders.' : 'No fields yet — add the first one below.'}
          </p>
        )}
        {sorted.length > 0 && (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left">Value</th>
                  {docLanguages.map((l) => <th key={l.id} className="text-left">Label ({l.name})</th>)}
                  <th className="text-left">Type</th>
                  <th className="text-center">Required</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <FieldSection key={sec.group ?? '_fixed'} group={sec.group} colSpan={docLanguages.length + 4}>
                    {sec.fields.map((f) => (
                      <tr key={f.id}>
                        <td>
                          <code className="text-xs">{f.fieldKey}</code>
                          {orphans.includes(f.fieldKey) && <div className="text-xs text-danger mt-0.5">Not in the Word file any more</div>}
                        </td>
                        {docLanguages.map((l) => (
                          <td key={l.id}>
                            <Input
                              aria-label={`${f.fieldKey} label in ${l.name}`}
                              value={rows[f.id]?.labels[l.id] ?? ''}
                              onChange={(e) => setLabel(f.id, l.id, e.target.value)}
                              dir={l.direction === 'rtl' ? 'rtl' : undefined}
                              maxLength={255}
                            />
                          </td>
                        ))}
                        <td>
                          <Select aria-label={`${f.fieldKey} type`} value={rows[f.id]?.fieldType} onChange={(e) => setRow(f.id, { fieldType: e.target.value })}>
                            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </Select>
                        </td>
                        <td className="text-center">
                          <input type="checkbox" aria-label={`${f.fieldKey} required`} checked={!!rows[f.id]?.required} onChange={(e) => setRow(f.id, { required: e.target.checked })} />
                        </td>
                        <td className="text-right">
                          {(tpl.type !== 'word' || orphans.includes(f.fieldKey)) && (
                            <Button size="sm" variant="ghost" onClick={() => removeField(f)}>Remove</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </FieldSection>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tpl.type === 'designer' && (
          <form onSubmit={addField} className="mt-5 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-text mb-2">Add a field</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <Field label="Name" htmlFor="nf-key" hint="e.g. full_name">
                <Input id="nf-key" value={newField.key} onChange={(e) => setNewField({ ...newField, key: e.target.value })} required maxLength={100} />
              </Field>
              <Field label="Repeating group" htmlFor="nf-group" hint="Optional, e.g. children">
                <Input id="nf-group" value={newField.group} onChange={(e) => setNewField({ ...newField, group: e.target.value })} maxLength={100} />
              </Field>
              <Field label="Type" htmlFor="nf-type">
                <Select id="nf-type" value={newField.fieldType} onChange={(e) => setNewField({ ...newField, fieldType: e.target.value })}>
                  {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </Field>
              <Button type="submit">Add field</Button>
            </div>
            <p className="text-xs text-text-muted mt-2">Fields with the same repeating group are filled in as a list (one row per entry).</p>
          </form>
        )}
      </StepCard>
      <NavRow onBack={onBack}>
        <Button variant="primary" disabled={saving || sorted.length === 0} onClick={save}>{saving ? 'Saving…' : 'Next →'}</Button>
      </NavRow>
    </div>
  );
}

function FieldSection({ group, colSpan, children }: { group: string | null; colSpan: number; children: ReactNode }) {
  return (
    <>
      {group && (
        <tr>
          <td colSpan={colSpan} className="bg-bg text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Repeats: {group}
          </td>
        </tr>
      )}
      {children}
    </>
  );
}

// ── ④ Try it ──

function sampleValue(f: TField, label: string): string {
  if (f.fieldType === 'date') return '2000-01-31';
  if (f.fieldType === 'number') return '1';
  return `Sample ${label.toLowerCase()}`;
}

function TryStep({ tpl, docLanguages, onTried, onBack, onNext }: {
  tpl: WizardTemplate; docLanguages: Language[]; onTried: () => void; onBack: () => void; onNext: () => void;
}) {
  const sorted = [...tpl.fields].sort((a, b) => a.sortOrder - b.sortOrder).filter((f) => f.fieldType !== 'image');
  const labelOf = (f: TField) => f.labels.find((l) => l.languageId === docLanguages[0]?.id)?.label || f.labels[0]?.label || humanize(f.fieldKey);
  const fixed = sorted.filter((f) => !f.groupKey);
  const groupKeys = [...new Set(sorted.map((f) => f.groupKey).filter(Boolean))] as string[];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fixed.map((f) => [f.id, sampleValue(f, labelOf(f))])));
  const [entries, setEntries] = useState<Record<string, Record<string, string>[]>>(() =>
    Object.fromEntries(groupKeys.map((g) => [g, [Object.fromEntries(sorted.filter((f) => f.groupKey === g).map((f) => [f.id, sampleValue(f, labelOf(f))]))]])),
  );
  const [languageId, setLanguageId] = useState(docLanguages[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const hasImages = tpl.fields.some((f) => f.fieldType === 'image');

  const inputFor = (f: TField, value: string, onChange: (v: string) => void, id: string) =>
    f.fieldType === 'textarea'
      ? <Textarea id={id} rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      : <Input id={id} type={f.fieldType === 'date' ? 'date' : f.fieldType === 'number' ? 'number' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} />;

  const download = async () => {
    setBusy(true);
    try {
      const payload = [
        ...fixed.map((f) => ({ templateFieldId: f.id, value: values[f.id] ?? '' })),
        ...groupKeys.flatMap((g) => (entries[g] ?? []).flatMap((row, entryIndex) =>
          Object.entries(row).map(([templateFieldId, value]) => ({ templateFieldId, value, entryIndex })))),
      ].filter((v) => v.value !== '');
      await api.download(`/templates/${tpl.id}/test-export`, `TEST ${tpl.name}.docx`, 'POST', {
        values: payload,
        ...(languageId ? { languageId } : {}),
      });
      onTried();
    } catch (err) {
      toast.error(errMsg(err, 'Couldn’t generate the test file.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepCard title="Try it" intro="Fill in sample values and download the result, exactly as a translator would get it. Nothing here is saved.">
        {tpl.type === 'designer' && !(tpl.layoutJson && tpl.layoutJson.length) && (
          <Alert tone="info" className="mb-4">No custom layout yet, so a clean default document is produced (title, then the fields). You can design a layout later in the template&apos;s Layout tab.</Alert>
        )}
        {hasImages && <p className="text-sm text-text-muted mb-4">Image fields aren&apos;t included in the test file.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fixed.map((f) => (
            <Field key={f.id} label={labelOf(f)} htmlFor={`t-${f.id}`}>
              {inputFor(f, values[f.id] ?? '', (v) => setValues((s) => ({ ...s, [f.id]: v })), `t-${f.id}`)}
            </Field>
          ))}
        </div>
        {groupKeys.map((g) => {
          const gf = sorted.filter((f) => f.groupKey === g);
          const rows = entries[g] ?? [];
          return (
            <div key={g} className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-text">{humanize(g)} <span className="text-text-muted font-normal">(repeats)</span></h3>
                <Button size="sm" onClick={() => setEntries((s) => ({ ...s, [g]: [...rows, Object.fromEntries(gf.map((f) => [f.id, '']))] }))}>+ Add entry</Button>
              </div>
              <div className="space-y-3">
                {rows.map((row, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-text-secondary">Entry {i + 1}</span>
                      {rows.length > 1 && (
                        <button type="button" className="text-xs text-danger underline" onClick={() => setEntries((s) => ({ ...s, [g]: rows.filter((_, j) => j !== i) }))}>Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {gf.map((f) => (
                        <Field key={f.id} label={labelOf(f)} htmlFor={`t-${f.id}-${i}`}>
                          {inputFor(f, row[f.id] ?? '', (v) => setEntries((s) => ({ ...s, [g]: rows.map((r, j) => (j === i ? { ...r, [f.id]: v } : r)) })), `t-${f.id}-${i}`)}
                        </Field>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-end gap-3 mt-6 border-t border-border pt-5">
          {docLanguages.length > 1 && (
            <Field label="Produce it in" htmlFor="t-lang">
              <Select id="t-lang" value={languageId} onChange={(e) => setLanguageId(e.target.value)}>
                {docLanguages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </Select>
            </Field>
          )}
          <Button variant="primary" disabled={busy} onClick={download}>{busy ? 'Generating…' : '↓ Download test Word file'}</Button>
        </div>
      </StepCard>
      <NavRow onBack={onBack}>
        <Button variant="primary" onClick={onNext}>Next →</Button>
      </NavRow>
    </div>
  );
}

// ── ⑤ Done ──

function DoneStep({ tpl, docLanguages, tried, onBack }: { tpl: WizardTemplate; docLanguages: Language[]; tried: boolean; onBack: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const first = docLanguages[0];
  const others = docLanguages.slice(1);
  const missingOther = others.map((l) => ({
    lang: l,
    count: tpl.fields.filter((f) => !f.labels.some((x) => x.languageId === l.id && x.label)).length,
  })).filter((m) => m.count > 0);
  const unlabelled = first ? tpl.fields.filter((f) => !f.labels.some((x) => x.languageId === first.id && x.label)).length : 0;

  const items: { ok: boolean; warn?: boolean; text: string }[] = [
    { ok: true, text: `${tpl.name} · ${Number(tpl.pricePerPage).toFixed(2)} per page` },
  ];
  if (tpl.type !== 'simple') {
    items.push({ ok: docLanguages.length > 0, text: docLanguages.length ? `Document languages: ${docLanguages.map((l) => l.name).join(', ')}` : 'No document language chosen' });
    if (tpl.type === 'word') items.push({ ok: !!tpl.wordFileName, text: tpl.wordFileName ? `Word file: ${tpl.wordFileName}` : 'No Word file uploaded' });
    items.push({ ok: tpl.fields.length > 0 && unlabelled === 0, text: tpl.fields.length ? `${tpl.fields.length} field${tpl.fields.length === 1 ? '' : 's'}${unlabelled ? `, ${unlabelled} without a ${first?.name} label` : ', all labelled'}` : 'No fields' });
    for (const m of missingOther) items.push({ ok: true, warn: true, text: `${m.count} field${m.count === 1 ? '' : 's'} without a ${m.lang.name} label (the ${first?.name} one is shown instead)` });
    items.push({ ok: true, warn: !tried, text: tried ? 'Test file downloaded' : 'Not tried yet — you can still go back to “Try it”' });
  }
  const blocked = items.some((i) => !i.ok);

  const finish = async (activate: boolean) => {
    setBusy(true);
    try {
      if (activate !== tpl.isActive) await api.patch(`/templates/${tpl.id}`, { isActive: activate });
      toast.success(activate ? `${tpl.name} is active — it's offered when creating jobs.` : `${tpl.name} saved as a draft.`);
      router.push(`/templates/${tpl.id}`);
    } catch (err) {
      toast.error(errMsg(err, 'Couldn’t save.'));
      setBusy(false);
    }
  };

  return (
    <div>
      <StepCard title="All set?" intro={tpl.isActive ? 'This template is active.' : 'Drafts aren’t offered when creating jobs. Activate the template when it’s ready.'}>
        <ul className="space-y-2">
          {items.map((i, n) => (
            <li key={n} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-xs ${!i.ok ? 'tone tone-danger' : i.warn ? 'tone tone-warning' : 'tone tone-success'}`}>
                {!i.ok ? '!' : i.warn ? '·' : <CheckIcon className="w-3 h-3" />}
              </span>
              <span className="text-text">{i.text}</span>
            </li>
          ))}
        </ul>
        {blocked && <Alert tone="warning" className="mt-4">Fix the items marked ! before activating.</Alert>}
      </StepCard>
      <NavRow onBack={onBack}>
        {tpl.isActive ? (
          <>
            <Button disabled={busy} onClick={() => finish(false)}>Deactivate</Button>
            <Button variant="primary" disabled={busy} onClick={() => router.push(`/templates/${tpl.id}`)}>Finish</Button>
          </>
        ) : (
          <>
            <Button disabled={busy} onClick={() => finish(false)}>Save as draft</Button>
            <Button variant="primary" disabled={busy || blocked} onClick={() => finish(true)}>Activate template</Button>
          </>
        )}
      </NavRow>
    </div>
  );
}
