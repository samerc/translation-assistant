'use client';

import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useDebounce } from '@/lib/use-debounce';
import { toast } from '@/lib/toast';
import { alertDialog, confirmDialog } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, SearchInput } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { RowChevron, TableCard } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { BuildingIcon, PlusIcon } from '@/components/ui/icons';
import { NO_AUTOFILL } from '@/lib/no-autofill';
import {
  RequirePlatformAdmin,
  TenantStatusBadge,
  copyToClipboard,
  type TenantRow,
  type TenantStatus,
} from './platform-shared';

interface TenantList {
  data: TenantRow[];
  counts: Partial<Record<TenantStatus, number>>;
  deletionRequests: number;
}

type Filter = 'all' | TenantStatus;

export default function PlatformPage() {
  return (
    <RequirePlatformAdmin>
      <Organizations />
    </RequirePlatformAdmin>
  );
}

const EMPTY_FORM = { name: '', adminEmail: '', adminFirstName: '', adminLastName: '' };

function Organizations() {
  const router = useRouter();
  const [list, setList] = useState<TenantList | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    api
      .get<TenantList>(`/platform/tenants?${params}`)
      .then((res) => {
        if (!ignore) {
          setList(res);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!ignore) setLoadError(true);
      });
    return () => {
      ignore = true;
    };
  }, [filter, debouncedSearch, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const counts = list?.counts ?? {};
  const pending = counts.pending ?? 0;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.post<{ tenant: TenantRow; invite: { token: string } }>('/platform/tenants', {
        name: form.name,
        adminEmail: form.adminEmail,
        ...(form.adminFirstName.trim() ? { adminFirstName: form.adminFirstName.trim() } : {}),
        ...(form.adminLastName.trim() ? { adminLastName: form.adminLastName.trim() } : {}),
      });
      const link = `${window.location.origin}/register?token=${res.invite.token}`;
      const copied = await copyToClipboard(link);
      setShowForm(false);
      setForm(EMPTY_FORM);
      reload();
      await alertDialog({
        title: 'Organization created',
        message:
          `We emailed an invitation to ${form.adminEmail}. If it doesn't arrive, send them this link (valid for 7 days)` +
          `${copied ? ' — it is already copied to your clipboard' : ''}:\n\n${link}`,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create the organization.');
    } finally {
      setSaving(false);
    }
  };

  const act = async (e: MouseEvent, t: TenantRow, action: 'approve' | 'reject') => {
    e.stopPropagation();
    if (action === 'reject') {
      const ok = await confirmDialog({
        title: `Reject ${t.name}?`,
        message: 'The sign-up and its account are deleted. They can sign up again later.',
        confirmText: 'Reject',
        danger: true,
      });
      if (!ok) return;
    }
    setBusyId(t.id);
    try {
      await api.post(`/platform/tenants/${t.id}/${action}`);
      toast.success(action === 'approve' ? `${t.name} approved — we emailed its admin.` : `${t.name} rejected.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: pending ? `Waiting (${pending})` : 'Waiting' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
  ];

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Each organization has its own users, clients, jobs, templates and invoices. You manage the organizations and their accounts, not their data."
        actions={
          <Button variant="primary" icon={<PlusIcon />} onClick={() => setShowForm((v) => !v)}>
            New organization
          </Button>
        }
      />

      {pending > 0 && filter !== 'pending' && (
        <Alert tone="warning" className="mb-4">
          {pending} sign-up{pending === 1 ? ' is' : 's are'} waiting for your approval.{' '}
          <button className="underline font-medium" onClick={() => setFilter('pending')}>
            Review
          </button>
        </Alert>
      )}

      {showForm && (
        <form onSubmit={create} className="card p-5 mb-4 max-w-2xl">
          <h3 className="font-semibold text-text mb-1">New organization</h3>
          <p className="text-sm text-text-secondary mb-4">
            It is active straight away. Its first admin gets an email invitation to set up their account.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Organization name" htmlFor="org-name" required>
              <Input
                id="org-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                maxLength={150}
              />
            </Field>
            <Field label="Admin's email" htmlFor="org-admin" required>
              <Input
                id="org-admin"
                {...NO_AUTOFILL}
                type="email"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                required
              />
            </Field>
            <Field label="Admin's first name" htmlFor="org-admin-first" hint="Optional">
              <Input
                id="org-admin-first"
                {...NO_AUTOFILL}
                value={form.adminFirstName}
                onChange={(e) => setForm({ ...form, adminFirstName: e.target.value })}
                maxLength={100}
              />
            </Field>
            <Field label="Admin's last name" htmlFor="org-admin-last" hint="Optional">
              <Input
                id="org-admin-last"
                {...NO_AUTOFILL}
                value={form.adminLastName}
                onChange={(e) => setForm({ ...form, adminLastName: e.target.value })}
                maxLength={100}
              />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create and invite'}
            </Button>
            <Button onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between mb-4">
        <SegmentedControl label="Status" options={filters} value={filter} onChange={setFilter} />
        <SearchInput
          placeholder="Search organizations…"
          aria-label="Search organizations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {!!list?.deletionRequests && (
        <Alert tone="warning" className="mb-4">
          {list.deletionRequests === 1 ? 'One organization has' : `${list.deletionRequests} organizations have`} asked to be deleted.
          Open it to approve or decline.
        </Alert>
      )}

      {loadError && <Alert className="mb-4">Couldn&apos;t load organizations. Try again in a moment.</Alert>}

      <TableCard minWidth={760}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="text-left">Organization</th>
              <th className="text-left">Status</th>
              <th className="text-left">Admin</th>
              <th className="text-right">Users</th>
              <th className="text-left">Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list && list.data.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    icon={<BuildingIcon />}
                    title={filter === 'pending' ? 'No sign-ups waiting' : 'No organizations yet'}
                    description={filter === 'pending' ? 'New sign-ups appear here. Ones that never confirm their email are removed after 7 days.' : 'Create one, or let people sign up.'}
                  />
                </td>
              </tr>
            )}
            {list?.data.map((t) => (
              <tr key={t.id} data-href onClick={() => router.push(`/platform/tenants/${t.id}`)}>
                <td>
                  <div className="font-medium text-text">{t.name}</div>
                  <div className="text-xs text-text-muted">{t.source === 'signup' ? 'Signed up' : 'Created by you'}</div>
                </td>
                <td>
                  <TenantStatusBadge status={t.status} />
                  {t.deletionRequestedAt && t.status !== 'closing' && (
                    <div className="text-xs text-danger font-medium mt-1">Deletion requested</div>
                  )}
                  {t.status === 'closing' && t.deleteAfter && (
                    <div className="text-xs text-text-muted mt-1">Deleted on {formatDate(t.deleteAfter)}</div>
                  )}
                  {t.status === 'pending' && !!t.admins?.length && !t.admins.some((a) => a.emailVerified) && (
                    <div className="text-xs text-text-muted mt-1">Email not confirmed yet</div>
                  )}
                </td>
                <td className="text-text-secondary">
                  {t.admins?.[0] ? (
                    <>
                      <div className="text-text">{t.admins[0].name}</div>
                      <div className="text-xs">{t.admins[0].email}</div>
                    </>
                  ) : (
                    <span className="text-text-muted">Invite pending</span>
                  )}
                </td>
                <td className="text-right tabular-nums">{t.userCount ?? 0}</td>
                <td className="text-text-secondary">{formatDate(t.createdAt)}</td>
                <td className="text-right whitespace-nowrap">
                  {t.status === 'pending' ? (
                    <span className="inline-flex gap-2">
                      <Button size="sm" variant="primary" disabled={busyId === t.id} onClick={(e) => act(e, t, 'approve')}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={(e) => act(e, t, 'reject')}>
                        Reject
                      </Button>
                    </span>
                  ) : (
                    <RowChevron />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </div>
  );
}
