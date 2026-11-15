'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { confirmDialog } from '@/lib/confirm';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Field, Input } from '@/components/ui/Field';
import { CheckIcon, PlusIcon } from '@/components/ui/icons';

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isBuiltIn: boolean;
  locked: boolean;
  source: 'default' | 'customized' | 'own';
  jobScope: 'all' | 'assigned';
  seesPrices: boolean;
  permissions: { resource: string; action: string }[];
  userCount: number;
  customizedBy?: number;
}

/** The areas a role can be given, in reading order, with what each action means there. */
const AREAS: { key: string; label: string; hint: string; actions: string[] }[] = [
  { key: 'clients', label: 'Clients', hint: 'Companies and people, contacts, passport copies', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'jobs', label: 'Jobs', hint: 'Jobs, their status, people, prices and files', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'documents', label: 'Documents', hint: 'Filling in and exporting translations', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'templates', label: 'Templates', hint: 'Document templates and their fields', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'invoices', label: 'Invoices', hint: 'Invoices, payments, PDF/Word, emailing', actions: ['read', 'create', 'update', 'delete'] },
  { key: 'reports', label: 'Reports', hint: 'Revenue and job reports, dashboard figures', actions: ['read'] },
  { key: 'calendar', label: 'Calendar', hint: 'Deadlines and due dates', actions: ['read'] },
];
const ACTIONS: { key: string; label: string }[] = [
  { key: 'read', label: 'View' },
  { key: 'create', label: 'Create' },
  { key: 'update', label: 'Edit' },
  { key: 'delete', label: 'Delete' },
];

type Draft = {
  name: string;
  description: string;
  jobScope: 'all' | 'assigned';
  seesPrices: boolean;
  permissions: Set<string>;
};

const keysOf = (r: RoleView) => new Set(r.permissions.map((p) => `${p.resource}:${p.action}`));
const blank = (): Draft => ({ name: '', description: '', jobScope: 'assigned', seesPrices: true, permissions: new Set() });

/**
 * Roles as a table of areas × View/Create/Edit/Delete — read, and (unless
 * locked) edited in place. `endpoint` is `/roles` (an organization) or
 * `/platform/roles` (the defaults every organization starts with).
 */
export function RolesEditor({ endpoint, platform = false, onChanged }: { endpoint: string; platform?: boolean; onChanged?: () => void }) {
  const [roles, setRoles] = useState<RoleView[] | null>(null);
  const [error, setError] = useState('');
  // 'new' = the new-role form; a role id = that role being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const load = () => {
    api.get<RoleView[]>(endpoint)
      .then((r) => { setRoles(r); setError(''); })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Couldn’t load roles.'));
  };
  useEffect(load, [endpoint]);

  const startEdit = (r: RoleView) => {
    setEditing(r.id);
    setFormError('');
    setDraft({ name: r.name, description: r.description ?? '', jobScope: r.jobScope, seesPrices: r.seesPrices, permissions: keysOf(r) });
  };
  const startNew = () => { setEditing('new'); setFormError(''); setDraft(blank()); };
  const cancel = () => { setEditing(null); setFormError(''); };

  const toggle = (area: string, action: string, on: boolean) => {
    const next = new Set(draft.permissions);
    const key = `${area}:${action}`;
    if (on) {
      next.add(key);
      next.add(`${area}:read`); // any right on an area includes viewing it
    } else if (action === 'read') {
      for (const a of ACTIONS) next.delete(`${area}:${a.key}`);
    } else {
      next.delete(key);
    }
    setDraft({ ...draft, permissions: next });
  };

  const save = async (role?: RoleView) => {
    if (!draft.name.trim()) { setFormError('Give the role a name.'); return; }
    setBusy(true);
    setFormError('');
    const body = {
      ...(role?.isBuiltIn ? {} : { name: draft.name.trim() }),
      description: draft.description.trim(),
      jobScope: draft.jobScope,
      seesPrices: draft.seesPrices,
      permissions: [...draft.permissions],
    };
    try {
      if (role) await api.patch(`${endpoint}/${role.id}`, body);
      else await api.post(endpoint, { ...body, name: draft.name.trim() });
      toast.success(role ? 'Role saved' : 'Role created');
      setEditing(null);
      load();
      onChanged?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Couldn’t save the role.');
    } finally {
      setBusy(false);
    }
  };

  const reset = async (r: RoleView) => {
    if (!(await confirmDialog({
      title: `Reset “${r.name}” to the default?`,
      message: 'Your changes to this role are dropped and it follows the platform default again. People with this role keep it.',
      confirmText: 'Reset',
    }))) return;
    try {
      await api.post(`${endpoint}/${r.id}/reset`);
      toast.success('Back to the default');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t reset the role.');
    }
  };

  const remove = async (r: RoleView) => {
    if (!(await confirmDialog({
      title: `Delete the role “${r.name}”?`,
      message: platform && r.customizedBy ? `${r.customizedBy} organization(s) customized it — they keep their copy as their own role.` : 'This can’t be undone.',
      confirmText: 'Delete',
      danger: true,
    }))) return;
    try {
      await api.delete(`${endpoint}/${r.id}`);
      toast.success('Role deleted');
      load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Couldn’t delete the role.');
    }
  };

  const sourceBadge = (r: RoleView) => {
    if (r.locked) return <Badge tone="tone tone-neutral">Locked</Badge>;
    if (platform) return r.isBuiltIn ? <Badge tone="tone tone-neutral">Built-in</Badge> : <Badge tone="tone tone-info">Added by you</Badge>;
    if (r.source === 'customized') return <Badge tone="tone tone-warning">Customized</Badge>;
    if (r.source === 'own') return <Badge tone="tone tone-info">Your own</Badge>;
    return <Badge tone="tone tone-neutral">Default</Badge>;
  };

  const form = (role?: RoleView) => (
    <div className="space-y-4">
      {formError && <Alert>{formError}</Alert>}
      {!platform && role?.source === 'default' && (
        <Alert tone="info">This is a default role. Saving makes your organization’s own version of it; you can reset it to the default later.</Alert>
      )}
      {platform && role && (
        <Alert tone="info">Organizations that haven’t customized this role get the change right away{role.customizedBy ? ` (${role.customizedBy} customized it and keep their version)` : ''}.</Alert>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name" htmlFor={`role-name-${role?.id ?? 'new'}`} required hint={role?.isBuiltIn ? 'Built-in roles keep their name.' : undefined}>
          <Input id={`role-name-${role?.id ?? 'new'}`} value={draft.name} maxLength={100} disabled={role?.isBuiltIn}
            placeholder="e.g. Accounting" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="Description" htmlFor={`role-desc-${role?.id ?? 'new'}`}>
          <Input id={`role-desc-${role?.id ?? 'new'}`} value={draft.description} maxLength={300}
            placeholder="What people with this role do" onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-semibold text-text mb-1.5">Which jobs and clients</legend>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name={`scope-${role?.id ?? 'new'}`} checked={draft.jobScope === 'assigned'} onChange={() => setDraft({ ...draft, jobScope: 'assigned' })} />
            Only the jobs assigned to them
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name={`scope-${role?.id ?? 'new'}`} checked={draft.jobScope === 'all'} onChange={() => setDraft({ ...draft, jobScope: 'all' })} />
            All of the organization’s jobs and clients
          </label>
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-4 h-4" checked={draft.seesPrices} onChange={(e) => setDraft({ ...draft, seesPrices: e.target.checked })} />
        <span>
          <span className="font-medium text-text">Sees prices</span>
          <span className="block text-text-secondary">Job totals, line-item and template prices. When off, jobs they create are priced from your templates and they can’t change prices.</span>
        </span>
      </label>
      <Matrix permissions={draft.permissions} onToggle={toggle} />
      <div className="flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => save(role)}>{busy ? 'Saving…' : role ? 'Save role' : 'Create role'}</Button>
        <Button onClick={cancel} disabled={busy}>Cancel</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <p className="text-sm text-text-secondary flex-1 min-w-[16rem]">
          {platform
            ? 'Every organization starts with these roles. An organization can change one for itself (it then keeps its own version) or add its own. Admin always has every permission.'
            : 'Choose a role when you invite someone, or change it in the list above. Admin always has every permission, including the team, settings and roles.'}
        </p>
        {editing !== 'new' && <Button variant="primary" icon={<PlusIcon />} onClick={startNew}>New role</Button>}
      </div>
      {error && <Alert>{error}</Alert>}
      {editing === 'new' && (
        <div className="card p-5">
          <h3 className="font-semibold text-text mb-3">New role</h3>
          {form()}
        </div>
      )}
      {(roles ?? []).map((r) => (
        <div key={r.id} className="card p-5" data-role={r.name}>
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-text">{r.name}</h3>
                {sourceBadge(r)}
                <span className="text-xs text-text-muted">
                  {r.userCount === 1 ? '1 person' : `${r.userCount} people`}
                  {platform && r.customizedBy ? ` · customized by ${r.customizedBy} organization${r.customizedBy === 1 ? '' : 's'}` : ''}
                </span>
              </div>
              {r.description && <p className="text-sm text-text-secondary mt-0.5">{r.description}</p>}
            </div>
            {editing !== r.id && !r.locked && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => startEdit(r)}>Edit</Button>
                {r.source === 'customized' && <Button size="sm" variant="ghost" onClick={() => reset(r)}>Reset to default</Button>}
                {((platform && !r.isBuiltIn) || r.source === 'own') && (
                  <Button size="sm" variant="ghost" onClick={() => remove(r)}>Delete</Button>
                )}
              </div>
            )}
          </div>
          <div className="mt-4">
            {editing === r.id ? form(r) : r.locked ? (
              <p className="text-sm text-text">Everything: every area, all jobs and clients, prices, the team, settings and roles.</p>
            ) : (
              <>
                <p className="text-sm text-text mb-3">
                  Sees <strong>{r.jobScope === 'all' ? 'all of the organization’s jobs and clients' : 'only the jobs assigned to them'}</strong>
                  {' · '}{r.seesPrices ? 'sees prices' : <strong>prices hidden</strong>}
                </p>
                <Matrix permissions={keysOf(r)} />
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Areas × View/Create/Edit/Delete: check marks, or checkboxes when `onToggle` is given. */
function Matrix({ permissions, onToggle }: { permissions: Set<string>; onToggle?: (area: string, action: string, on: boolean) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm min-w-[520px]" aria-label="Permissions">
        <thead>
          <tr className="bg-sunken text-left text-xs text-text-secondary">
            <th className="px-3 py-2 font-semibold">Area</th>
            {ACTIONS.map((a) => <th key={a.key} className="px-3 py-2 font-semibold text-center w-20">{a.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {AREAS.map((area) => (
            <tr key={area.key} className="border-t border-border">
              <td className="px-3 py-2">
                <div className="font-medium text-text">{area.label}</div>
                <div className="text-xs text-text-muted">{area.hint}</div>
              </td>
              {ACTIONS.map((a) => {
                const key = `${area.key}:${a.key}`;
                const applies = area.actions.includes(a.key);
                const has = permissions.has(key);
                return (
                  <td key={a.key} className="px-3 py-2 text-center">
                    {!applies ? <span className="text-text-muted" aria-hidden="true">·</span>
                      : onToggle ? (
                        <input type="checkbox" className="w-4 h-4" checked={has} aria-label={`${area.label}: ${a.label}`}
                          onChange={(e) => onToggle(area.key, a.key, e.target.checked)} />
                      ) : has ? (
                        <span role="img" aria-label={`${area.label}: ${a.label}`}><CheckIcon className="w-4 h-4 inline text-success" /></span>
                      ) : <span role="img" className="text-text-muted" aria-label={`${area.label}: no ${a.label.toLowerCase()}`}>—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
