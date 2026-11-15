'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import { useDebounce } from '@/lib/use-debounce';
import { Select, SearchInput } from '@/components/ui/Field';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/DataTable';
import { ClockIcon } from '@/components/ui/icons';

export interface AuditEntry {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: string | null;
  byPlatform: boolean;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditPage {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
}

/** "did what" for each action (the target's name follows). */
const VERBS: Record<string, string> = {
  'user.created': 'added the user',
  'user.updated': 'changed the user',
  'user.activated': 'reactivated',
  'user.deactivated': 'deactivated',
  'user.password_reset': 'reset the password of',
  'user.password_changed': 'changed their password',
  'user.deleted': 'deleted the user',
  'session.logout_everywhere': 'signed out on all devices',
  'role.created': 'created the role',
  'role.updated': 'changed the role',
  'role.reset': 'reset to the default the role',
  'role.deleted': 'deleted the role',
  'invite.created': 'invited',
  'invite.resent': 'resent the invitation to',
  'invite.cancelled': 'cancelled the invitation to',
  'settings.updated': 'changed the organization settings',
  'settings.logo_changed': 'changed the logo',
  'settings.logo_removed': 'removed the logo',
  'freeform_type.created': 'added the freeform type',
  'freeform_type.updated': 'changed the freeform type',
  'freeform_type.deleted': 'deleted the freeform type',
  'client.created': 'added the client',
  'client.deleted': 'deleted the client',
  'job.created': 'created the job',
  'job.updated': 'edited the job',
  'job.deleted': 'deleted the job',
  'job.status_changed': 'changed the status of',
  'job.reopened': 'reopened',
  'job.user_assigned': 'assigned someone to',
  'job.user_removed': 'removed someone from',
  'invoice.created': 'created the invoice',
  'invoice.updated': 'edited the invoice',
  'invoice.status_changed': 'changed the status of',
  'invoice.payment_recorded': 'recorded a payment on',
  'invoice.payment_deleted': 'deleted a payment on',
  'invoice.emailed': 'emailed the invoice',
  'invoice.deleted': 'deleted the invoice',
  'template.created': 'created the template',
  'template.updated': 'changed the template',
  'template.deleted': 'deleted the template',
  'template.word_uploaded': 'uploaded a Word file to',
  'document.status_changed': 'changed the status of the document',
  'document.deleted': 'deleted the document',
  'organization.deletion_requested': 'asked to delete the organization',
  'organization.deletion_withdrawn': 'withdrew the deletion request',
  'tenant.created': 'created the organization',
  'tenant.updated': 'renamed the organization',
  'tenant.approved': 'approved',
  'tenant.suspended': 'suspended',
  'tenant.reactivated': 'reactivated',
  'tenant.rejected': 'rejected the sign-up of',
  'tenant.deletion_approved': 'approved the deletion of',
  'tenant.deletion_declined': 'declined the deletion of',
  'tenant.restored': 'restored',
  'tenant.purged': 'deleted for good',
  'tenant.invite_sent': 'sent an invitation for',
  'platform.settings_updated': 'changed the platform settings',
  'language.created': 'added the language',
  'language.updated': 'changed the language',
  'language.deleted': 'deleted the language',
  'label.created': 'added the label',
  'label.updated': 'changed the label',
  'label.deleted': 'deleted the label',
};

/** The filter menu: action prefixes. */
const AREAS: { value: string; label: string; platform?: boolean }[] = [
  { value: '', label: 'Everything' },
  { value: 'job', label: 'Jobs' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'client', label: 'Clients' },
  { value: 'template', label: 'Templates' },
  { value: 'document', label: 'Documents' },
  { value: 'user', label: 'Team members' },
  { value: 'invite', label: 'Invitations' },
  { value: 'role', label: 'Roles' },
  { value: 'settings', label: 'Settings' },
  { value: 'organization', label: 'Organization' },
  { value: 'tenant', label: 'Organizations', platform: true },
  { value: 'platform', label: 'Platform settings', platform: true },
  { value: 'language', label: 'Languages', platform: true },
];

function linkFor(e: AuditEntry, platform: boolean): string | null {
  if (!e.targetId || /\.(deleted|purged|rejected)$/.test(e.action)) return null;
  switch (e.targetType) {
    case 'client': return `/clients/${e.targetId}`;
    case 'job': return `/jobs/${e.targetId}`;
    case 'invoice': return `/invoices/${e.targetId}`;
    case 'template': return `/templates/${e.targetId}`;
    case 'document': return `/documents/${e.targetId}`;
    case 'tenant': return platform ? `/platform/tenants/${e.targetId}` : null;
    default: return null;
  }
}

function detailText(e: AuditEntry): string[] {
  const d = e.details ?? {};
  const out: string[] = [];
  if (typeof d.status === 'string') out.push(`to ${humanize(d.status)}`);
  if (typeof d.user === 'string') out.push(`user: ${d.user}`);
  if (typeof d.permissionLevel === 'string') out.push(`can ${d.permissionLevel}`);
  if (typeof d.role === 'string') out.push(`role: ${d.role}`);
  if (d.jobScope === 'all' || d.jobScope === 'assigned') out.push(d.jobScope === 'all' ? 'sees all jobs' : 'sees assigned jobs');
  if (typeof d.seesPrices === 'boolean') out.push(d.seesPrices ? 'sees prices' : 'prices hidden');
  if (typeof d.email === 'string') out.push(String(d.email));
  if (d.paidAmount !== undefined) out.push(`amount ${String(d.paidAmount)}`);
  if (typeof d.paidAt === 'string') out.push(`paid ${d.paidAt}`);
  if (typeof d.method === 'string') out.push(`by ${d.method}`);
  if (typeof d.name === 'string' && e.action !== 'tenant.created') out.push(`name: ${d.name}`);
  if (typeof d.reason === 'string') out.push(`reason: “${d.reason}”`);
  if (Array.isArray(d.fields)) {
    const fields = (d.fields as unknown[]).map((f) => humanize(String(f))).filter((f) => f !== 'Role Id');
    if (fields.length) out.push(`changed: ${fields.join(', ')}`);
  }
  return out;
}

/**
 * The audit log as a list: who did what, when. `endpoint` is `/audit-log`
 * (organization) or `/platform/audit-log`.
 */
export function ActivityLog({ endpoint, platform = false }: { endpoint: string; platform?: boolean }) {
  const [area, setArea] = useState('');
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');
  const term = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AuditPage | null>(null);
  const [error, setError] = useState('');
  const [actors, setActors] = useState<{ id: string; name: string; byPlatform: boolean }[]>([]);

  useEffect(() => {
    if (platform) return;
    api.get<{ id: string; name: string; byPlatform: boolean }[]>('/audit-log/actors')
      .then(setActors)
      .catch(() => setActors([]));
  }, [platform]);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (area) params.set('action', area);
    if (actor) params.set('actorUserId', actor);
    if (term.trim()) params.set('search', term.trim());
    let live = true;
    api.get<AuditPage>(`${endpoint}?${params}`)
      .then((r) => { if (live) { setResult(r); setError(''); } })
      .catch((err) => { if (live) setError(err instanceof ApiError ? err.message : 'Couldn’t load the activity'); });
    return () => { live = false; };
  }, [endpoint, page, area, actor, term]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const filtered = !!(area || actor || term.trim());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <SearchInput placeholder="Search names, numbers…" value={search} aria-label="Search the activity"
          onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Select aria-label="What" className="w-auto" value={area} onChange={(e) => { setArea(e.target.value); setPage(1); }}>
          {AREAS.filter((a) => !a.value || !!a.platform === platform || (platform && (a.value === 'user' || a.value === 'role'))).map((a) => (
            <option key={a.value} value={a.value}>{a.label}</option>
          ))}
        </Select>
        {!platform && actors.length > 0 && (
          <Select aria-label="Who" className="w-auto" value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }}>
            <option value="">Anyone</option>
            {actors.map((a) => <option key={a.id} value={a.id}>{a.name}{a.byPlatform ? ' (platform admin)' : ''}</option>)}
          </Select>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="card overflow-hidden">
        {result && result.data.length === 0 ? (
          <EmptyState icon={<ClockIcon />}
            title={filtered ? 'Nothing matches' : 'No activity yet'}
            description={filtered ? 'Try another filter.' : 'Important actions — deletions, status and role changes, payments, settings — show up here.'} />
        ) : (
          <ul className="divide-y divide-border" aria-label="Activity">
            {(result?.data ?? []).map((e) => {
              const href = linkFor(e, platform);
              const extra = detailText(e);
              const verb = VERBS[e.action] ?? humanize(e.action);
              return (
                <li key={e.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
                  <time className="text-xs text-text-muted tabular-nums sm:w-36 shrink-0" dateTime={e.createdAt}>
                    {formatDateTime(e.createdAt)}
                  </time>
                  <div className="min-w-0 text-sm text-text">
                    <span className="font-medium">{e.actorName}</span>
                    {e.byPlatform && !platform && <Badge tone="tone tone-info" className="ml-1.5 align-middle">Platform admin</Badge>}
                    {' '}{verb}
                    {e.targetLabel && (
                      <>
                        {' '}
                        {href ? <Link href={href} className="font-medium text-primary hover:underline">{e.targetLabel}</Link>
                          : <span className="font-medium">{e.targetLabel}</span>}
                      </>
                    )}
                    {extra.length > 0 && <span className="text-text-secondary"> — {extra.join(' · ')}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {result && (
          <Pagination page={page} totalPages={totalPages} total={result.total} pageSize={result.limit}
            noun="entries" onPage={setPage} />
        )}
      </div>
    </div>
  );
}
