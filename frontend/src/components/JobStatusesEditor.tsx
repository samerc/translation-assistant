'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input, Select } from '@/components/ui/Field';
import { PlusIcon } from '@/components/ui/icons';
import {
  NOTIFY_LABELS, TONES, TONE_LABELS, invalidateJobStatuses, toneClass,
  type StageDef, type StatusDef,
} from '@/lib/job-statuses';

type Draft = { name: string; tone: string; notify: StatusDef['notify'] };
const blank = (): Draft => ({ name: '', tone: 'neutral', notify: 'assignees' });

const STAGE_NOTES: Record<string, string> = {
  quote: 'Open — counts for deadlines and overdue',
  accepted: 'Open — counts for deadlines and overdue',
  in_progress: 'Open — counts for deadlines and overdue',
  delivered: 'Locks the job; ready to invoice',
  invoiced: 'Set when the invoice is sent; locked',
  paid: 'Set when the invoice is paid in full; locked',
  lost: 'Closed',
  cancelled: 'Closed',
};

/**
 * Job statuses grouped by stage. `platform` = the defaults every organization
 * gets (`/platform/job-statuses`); otherwise the organization's own page
 * (`/job-statuses`): its statuses, defaults it can hide, stage colours.
 */
export function JobStatusesEditor({ platform = false }: { platform?: boolean }) {
  const endpoint = platform ? '/platform/job-statuses' : '/job-statuses';
  const [stages, setStages] = useState<StageDef[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // 'new:<stage>' while adding, or the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api.get<StageDef[]>(endpoint).then((s) => { setStages(s); setLoadError(false); }).catch(() => setLoadError(true));
  }, [endpoint]);
  useEffect(reload, [reload]);

  const changed = () => { reload(); if (!platform) invalidateJobStatuses(); };

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast.success(done);
      changed();
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startAdd = (stage: string) => { setEditing(`new:${stage}`); setDraft(blank()); };
  const startEdit = (s: StatusDef) => { setEditing(s.id); setDraft({ name: s.name, tone: s.tone, notify: s.notify }); };

  const save = async () => {
    if (!editing || !draft.name.trim()) return;
    const ok = editing.startsWith('new:')
      ? await run(() => api.post(endpoint, { stage: editing.slice(4), ...draft }), 'Status added')
      : await run(() => api.patch(`${endpoint}/${editing}`, draft), 'Status saved');
    if (ok) setEditing(null);
  };

  const toggleHidden = (s: StatusDef) => run(
    () => api.patch(`${endpoint}/${s.id}`, { hidden: !s.hidden }),
    s.hidden ? 'Status offered again' : platform ? 'No longer offered to organizations' : 'Status hidden',
  );

  const remove = async (s: StatusDef) => {
    if (!(await confirmDialog({ title: `Delete “${s.name}”?`, message: 'It disappears from every status menu.', confirmText: 'Delete' }))) return;
    await run(() => api.delete(`${endpoint}/${s.id}`), 'Status deleted');
  };

  // Swap with the neighbour of the same kind (defaults and own statuses keep their own order).
  const move = (list: StatusDef[], i: number, dir: -1 | 1) => {
    const a = list[i], b = list[i + dir];
    if (!a || !b || a.source !== b.source) return;
    const ao = a.sortOrder === b.sortOrder ? a.sortOrder + dir : b.sortOrder;
    void run(() => Promise.all([
      api.patch(`${endpoint}/${a.id}`, { sortOrder: Math.max(0, ao) }),
      api.patch(`${endpoint}/${b.id}`, { sortOrder: a.sortOrder }),
    ]));
  };

  const setStageTone = (stage: string, tone: string) =>
    run(() => api.patch(`/job-statuses/stages/${stage}`, { tone }));

  if (loadError) return <div className="card p-6 text-sm text-danger">Couldn’t load the job statuses.</div>;
  if (!stages) return <div className="card p-6 text-sm text-text-muted">Loading…</div>;

  const editable = (s: StatusDef) => platform || s.source === 'own';

  const form = (
    <div className="mt-2 p-3 rounded-lg border border-border bg-bg/50 grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
      <Field label="Name" htmlFor="status-name">
        <Input id="status-name" value={draft.name} maxLength={60} autoFocus
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(null); }}
          placeholder="e.g. Proofreading" />
      </Field>
      <Field label="Colour" htmlFor="status-tone">
        <Select id="status-tone" value={draft.tone} onChange={(e) => setDraft({ ...draft, tone: e.target.value })}>
          {TONES.map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
        </Select>
      </Field>
      <Field label="When a job moves here, notify" htmlFor="status-notify">
        <Select id="status-notify" value={draft.notify} onChange={(e) => setDraft({ ...draft, notify: e.target.value as Draft['notify'] })}>
          {(Object.keys(NOTIFY_LABELS) as Draft['notify'][]).map((n) => <option key={n} value={n}>{NOTIFY_LABELS[n]}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-3 flex items-center gap-2">
        <Badge tone={toneClass(draft.tone)}>{draft.name.trim() || 'Preview'}</Badge>
        <span className="flex-1" />
        <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={() => void save()} disabled={busy || !draft.name.trim()}>
          {editing?.startsWith('new:') ? 'Add status' : 'Save'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {platform
          ? 'Default statuses every organization gets inside the stages. Organizations can hide them and add their own.'
          : 'Add your own statuses inside each stage. The stage keeps deciding what happens — open, locked, invoiced — and the status shows where the work is.'}
      </p>
      {stages.map((st) => (
        <section key={st.stage} className="card p-4" aria-labelledby={`stage-${st.stage}`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`stage-${st.stage}`} className="font-semibold text-text">{st.label}</h3>
            <span className="text-xs text-text-muted">{STAGE_NOTES[st.stage]}</span>
            <span className="flex-1" />
            {!platform && (
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                <Badge tone={toneClass(st.tone)}>{st.label}</Badge>
                <Select aria-label={`Colour of ${st.label}`} className="!w-auto !py-1 text-xs" value={st.tone} disabled={busy}
                  onChange={(e) => void setStageTone(st.stage, e.target.value)}>
                  {TONES.map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
                </Select>
              </label>
            )}
            <Button size="sm" icon={<PlusIcon />} onClick={() => startAdd(st.stage)} disabled={busy}>Add status</Button>
          </div>

          {st.statuses.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {st.statuses.map((s, i) => (
                <li key={s.id} className="py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={toneClass(s.tone)} className={s.hidden ? 'opacity-50' : ''}>{s.name}</Badge>
                    {!platform && <span className="text-xs text-text-muted">{s.source === 'default' ? 'Default' : 'Yours'}</span>}
                    {s.hidden && <span className="text-xs text-text-muted">· {platform ? 'not offered' : 'hidden'}</span>}
                    <span className="text-xs text-text-muted">· Notifies: {NOTIFY_LABELS[s.notify]}</span>
                    {s.jobCount > 0 && <span className="text-xs text-text-muted">· {s.jobCount} job{s.jobCount === 1 ? '' : 's'}</span>}
                    <span className="flex-1" />
                    {editable(s) && (
                      <>
                        <Button size="sm" variant="ghost" aria-label={`Move ${s.name} up`} disabled={busy || st.statuses[i - 1]?.source !== s.source} onClick={() => move(st.statuses, i, -1)}>↑</Button>
                        <Button size="sm" variant="ghost" aria-label={`Move ${s.name} down`} disabled={busy || st.statuses[i + 1]?.source !== s.source} onClick={() => move(st.statuses, i, 1)}>↓</Button>
                        <Button size="sm" variant="ghost" onClick={() => startEdit(s)} disabled={busy}>Edit</Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => void toggleHidden(s)} disabled={busy}>
                      {s.hidden ? 'Show' : 'Hide'}
                    </Button>
                    {editable(s) && (
                      <Button size="sm" variant="ghost" onClick={() => void remove(s)} disabled={busy || s.jobCount > 0}
                        title={s.jobCount > 0 ? 'Jobs have this status — hide it instead' : undefined}>Delete</Button>
                    )}
                  </div>
                  {editing === s.id && form}
                </li>
              ))}
            </ul>
          )}
          {editing === `new:${st.stage}` && form}
        </section>
      ))}
    </div>
  );
}
