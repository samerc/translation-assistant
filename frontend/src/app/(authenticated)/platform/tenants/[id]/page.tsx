'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { alertDialog, confirmDialog } from '@/lib/confirm';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { TableCard } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { NO_AUTOFILL } from '@/lib/no-autofill';
import {
  RequirePlatformAdmin,
  TenantStatusBadge,
  copyToClipboard,
  type TenantRow,
} from '../../platform-shared';

interface TenantUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

interface TenantDetail extends TenantRow {
  users: TenantUser[];
  dataCounts: { clients: number; jobs: number; documents: number; invoices: number; templates: number };
  deletionGraceDays: number;
}

/** "3 clients, 1 job" — empty string when the organization holds nothing. */
function describeCounts(c: TenantDetail['dataCounts']): string {
  return (Object.entries(c) as [string, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${n === 1 ? k.replace(/s$/, '') : k}`)
    .join(', ');
}

export default function TenantPage() {
  return (
    <RequirePlatformAdmin>
      <TenantDetailView />
    </RequirePlatformAdmin>
  );
}

function TenantDetailView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [declining, setDeclining] = useState(false);
  const [declineMessage, setDeclineMessage] = useState('');
  const [inviteFirst, setInviteFirst] = useState('');
  const [inviteLast, setInviteLast] = useState('');

  useEffect(() => {
    let ignore = false;
    api
      .get<TenantDetail>(`/platform/tenants/${id}`)
      .then((t) => {
        if (!ignore) setTenant(t);
      })
      .catch((err) => {
        if (!ignore) setError(err instanceof ApiError && err.status === 404 ? 'This organization no longer exists.' : 'Couldn’t load the organization.');
      });
    return () => {
      ignore = true;
    };
  }, [id, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div>
        <Alert className="mb-4">{error}</Alert>
        <Link href="/platform" className="text-sm text-primary-text underline">Back to organizations</Link>
      </div>
    );
  }
  if (!tenant) {
    return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  const approve = () => run(() => api.post(`/platform/tenants/${id}/approve`), `${tenant.name} approved — we emailed its admin.`);
  const reactivate = () => run(() => api.post(`/platform/tenants/${id}/reactivate`), `${tenant.name} reactivated.`);
  const suspend = async () => {
    const ok = await confirmDialog({
      title: `Suspend ${tenant.name}?`,
      message: 'All of its users are signed out and can’t log in until you reactivate it. Its data is kept.',
      confirmText: 'Suspend',
      danger: true,
    });
    if (ok) await run(() => api.post(`/platform/tenants/${id}/suspend`), `${tenant.name} suspended.`);
  };
  const reject = async () => {
    const ok = await confirmDialog({
      title: `Reject ${tenant.name}?`,
      message: 'The sign-up and its account are deleted. They can sign up again later.',
      confirmText: 'Reject',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/platform/tenants/${id}/reject`);
      toast.success(`${tenant.name} rejected.`);
      router.push('/platform');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
      setBusy(false);
    }
  };

  const dataSummary = describeCounts(tenant.dataCounts);
  const isEmpty = !dataSummary;
  const requester = tenant.users.find((u) => u.id === tenant.deletionRequestedByUserId);
  const openRequest = !!tenant.deletionRequestedAt && tenant.status !== 'closing';

  const approveDeletion = async () => {
    const ok = await confirmDialog({
      title: `Delete ${tenant.name}?`,
      message: isEmpty
        ? 'It holds no clients, jobs, documents, invoices or templates, so it and its accounts are deleted right away. This cannot be undone.'
        : `It holds ${dataSummary}. It is closed now (nobody can sign in) and everything is permanently deleted after ${tenant.deletionGraceDays} days. Until then you can restore it.`,
      confirmText: isEmpty ? 'Delete now' : 'Close and schedule deletion',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await api.post<{ deleted: boolean }>(`/platform/tenants/${id}/delete`);
      if (res.deleted) {
        toast.success(`${tenant.name} deleted.`);
        router.push('/platform');
        return;
      }
      toast.success(`${tenant.name} is closed and scheduled for deletion. We emailed its admins.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const declineDeletion = async (e: FormEvent) => {
    e.preventDefault();
    await run(
      () => api.post(`/platform/tenants/${id}/decline-deletion`, declineMessage.trim() ? { message: declineMessage.trim() } : {}),
      'Request declined. We emailed the admin who asked.',
    );
    setDeclining(false);
    setDeclineMessage('');
  };

  const restore = () => run(() => api.post(`/platform/tenants/${id}/restore`), `${tenant.name} restored. We emailed its admins.`);

  const purgeNow = async () => {
    const ok = await confirmDialog({
      title: `Delete ${tenant.name} now?`,
      message: 'Everything is permanently deleted right away instead of at the end of the grace period: data, files and accounts. This cannot be undone.',
      confirmText: 'Delete permanently',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/platform/tenants/${id}/purge`);
      toast.success(`${tenant.name} deleted.`);
      router.push('/platform');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
      setBusy(false);
    }
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    await run(() => api.patch(`/platform/tenants/${id}`, { name }), 'Organization renamed.');
    setRenaming(false);
  };

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ token: string }>(`/platform/tenants/${id}/invite`, {
        email: inviteEmail,
        ...(inviteFirst.trim() ? { firstName: inviteFirst.trim() } : {}),
        ...(inviteLast.trim() ? { lastName: inviteLast.trim() } : {}),
      });
      const link = `${window.location.origin}/register?token=${res.token}`;
      const copied = await copyToClipboard(link);
      setInviteEmail('');
      setInviteFirst('');
      setInviteLast('');
      await alertDialog({
        title: 'Invitation sent',
        message: `We emailed ${inviteEmail} an invitation to join as Admin. If it doesn't arrive, send them this link (valid for 7 days)${copied ? ' — it is already copied' : ''}:\n\n${link}`,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to send the invitation.');
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (u: TenantUser) => {
    const ok = await confirmDialog({
      title: `Reset ${u.firstName}'s password?`,
      message: 'You get a one-time temporary password to give them. They must change it when they log in, and are signed out everywhere now.',
      confirmText: 'Reset password',
    });
    if (!ok) return;
    try {
      const { temporaryPassword } = await api.post<{ temporaryPassword: string }>(`/platform/users/${u.id}/reset-password`);
      const copied = await copyToClipboard(temporaryPassword);
      await alertDialog({
        title: 'Temporary password',
        message: `${temporaryPassword}\n\nShown only once${copied ? ' (copied to your clipboard)' : ''}. Give it to ${u.firstName} through a safe channel.`,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reset the password.');
    }
  };

  const toggleActive = (u: TenantUser) =>
    run(
      () => api.patch(`/platform/users/${u.id}/${u.isActive ? 'deactivate' : 'activate'}`),
      u.isActive ? `${u.firstName} deactivated.` : `${u.firstName} reactivated.`,
    );

  return (
    <div>
      <div className="mb-2">
        <Link href="/platform" className="text-sm text-text-secondary hover:text-text">← Organizations</Link>
      </div>
      <PageHeader
        title={
          renaming ? (
            <form onSubmit={saveName} className="flex gap-2 items-center">
              <Input aria-label="Organization name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={150} autoFocus />
              <Button type="submit" variant="primary" size="sm" disabled={busy}>Save</Button>
              <Button size="sm" onClick={() => setRenaming(false)}>Cancel</Button>
            </form>
          ) : (
            <span className="inline-flex items-center gap-3 flex-wrap">
              {tenant.name} <TenantStatusBadge status={tenant.status} />
            </span>
          )
        }
        description={`${tenant.source === 'signup' ? 'Signed up' : 'Created'} ${formatDate(tenant.createdAt)}${tenant.approvedAt && tenant.source === 'signup' ? ` · approved ${formatDate(tenant.approvedAt)}` : ''}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            {!renaming && <Button onClick={() => { setName(tenant.name); setRenaming(true); }}>Rename</Button>}
            {tenant.status === 'pending' && (
              <>
                <Button variant="primary" disabled={busy} onClick={approve}>Approve</Button>
                <Button variant="danger" disabled={busy} onClick={reject}>Reject</Button>
              </>
            )}
            {tenant.status === 'active' && <Button variant="danger" disabled={busy} onClick={suspend}>Suspend</Button>}
            {tenant.status === 'suspended' && <Button variant="primary" disabled={busy} onClick={reactivate}>Reactivate</Button>}
            {tenant.status === 'closing' && (
              <>
                <Button variant="primary" disabled={busy} onClick={restore}>Restore</Button>
                <Button variant="danger" disabled={busy} onClick={purgeNow}>Delete now</Button>
              </>
            )}
          </div>
        }
      />

      {tenant.status === 'pending' && (
        <Alert tone="warning" className="mb-4">
          This organization signed up and is waiting for your approval. Its admin can&apos;t log in until you approve it.
        </Alert>
      )}
      {tenant.status === 'suspended' && (
        <Alert tone="danger" className="mb-4">Suspended: none of its users can log in. Its data is kept.</Alert>
      )}
      {tenant.status === 'closing' && tenant.deleteAfter && (
        <Alert tone="danger" className="mb-4">
          Scheduled for deletion: nobody can sign in, and all of its data, files and accounts are permanently deleted on{' '}
          <strong>{formatDate(tenant.deleteAfter)}</strong>. Restore it before then to undo.
        </Alert>
      )}
      {openRequest && (
        <div className="card p-5 mb-4">
          <h3 className="font-semibold text-text mb-1">Deletion requested</h3>
          <p className="text-sm text-text-secondary">
            {requester ? `${requester.firstName} ${requester.lastName} (${requester.email})` : 'An admin'} asked to delete this organization on{' '}
            {formatDate(tenant.deletionRequestedAt ?? '')}.
          </p>
          {tenant.deletionReason && <p className="text-sm text-text mt-2 whitespace-pre-wrap">&ldquo;{tenant.deletionReason}&rdquo;</p>}
          <p className="text-sm text-text-secondary mt-2">
            {isEmpty
              ? 'It holds no data, so approving deletes it right away.'
              : `It holds ${dataSummary}. Approving closes it now and deletes everything after ${tenant.deletionGraceDays} days.`}
          </p>
          {declining ? (
            <form onSubmit={declineDeletion} className="mt-3 space-y-3 max-w-xl">
              <Field label="Message to the admin" htmlFor="decline-msg" hint="Optional">
                <Textarea id="decline-msg" rows={2} maxLength={500} value={declineMessage} onChange={(e) => setDeclineMessage(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={busy}>Decline request</Button>
                <Button onClick={() => setDeclining(false)}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="flex gap-2 mt-3">
              <Button variant="danger" disabled={busy} onClick={approveDeletion}>Approve deletion</Button>
              <Button disabled={busy} onClick={() => setDeclining(true)}>Decline</Button>
            </div>
          )}
        </div>
      )}

      <h2 className="text-base font-semibold text-text mb-1">Accounts</h2>
      <p className="text-sm text-text-secondary mb-3">
        You can help with accounts (lockouts, leavers). The organization&apos;s clients, jobs, documents and invoices stay private to it.
      </p>
      <TableCard minWidth={720}>
        <table className="data-table">
          <thead>
            <tr>
              <th className="text-left">Name</th>
              <th className="text-left">Role</th>
              <th className="text-left">Status</th>
              <th className="text-left">Since</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenant.users.length === 0 && (
              <tr><td colSpan={5} className="text-center text-text-muted py-6">No accounts yet — the admin&apos;s invitation hasn&apos;t been used.</td></tr>
            )}
            {tenant.users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-medium text-text">{u.firstName} {u.lastName}</div>
                  <div className="text-xs text-text-secondary">{u.email}</div>
                </td>
                <td>{u.role}</td>
                <td>
                  {!u.emailVerified ? (
                    <Badge tone="tone tone-warning">Email not confirmed</Badge>
                  ) : u.isActive ? (
                    <Badge tone="tone tone-success">Active</Badge>
                  ) : (
                    <Badge tone="tone tone-neutral">Deactivated</Badge>
                  )}
                </td>
                <td className="text-text-secondary">{formatDate(u.createdAt)}</td>
                <td className="text-right whitespace-nowrap">
                  <span className="inline-flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => resetPassword(u)}>Reset password</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => toggleActive(u)}>
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {tenant.status === 'active' && (
        <form onSubmit={invite} className="card p-5 mt-6 max-w-2xl">
          <h3 className="font-semibold text-text mb-1">Invite another admin</h3>
          <p className="text-sm text-text-secondary mb-3">For example when the organization&apos;s admin has left. They get an email to set up their account.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="First name (optional)" htmlFor="invite-first">
              <Input id="invite-first" {...NO_AUTOFILL} maxLength={100} value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} />
            </Field>
            <Field label="Last name (optional)" htmlFor="invite-last">
              <Input id="invite-last" {...NO_AUTOFILL} maxLength={100} value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="invite-email" className="sm:col-span-2">
              <Input id="invite-email" type="email" {...NO_AUTOFILL} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </Field>
          </div>
          <Button type="submit" variant="primary" className="mt-3" disabled={busy || !inviteEmail}>Send invitation</Button>
        </form>
      )}

      {(tenant.status === 'active' || tenant.status === 'suspended') && !openRequest && (
        <div className="card p-5 mt-6 max-w-2xl">
          <h3 className="font-semibold text-text mb-1">Delete organization</h3>
          <p className="text-sm text-text-secondary mb-3">
            {isEmpty
              ? 'It holds no clients, jobs, documents, invoices or templates, so it is deleted right away with its accounts.'
              : `It holds ${dataSummary}. Deleting closes it now (nobody can sign in) and permanently removes everything after ${tenant.deletionGraceDays} days; you can restore it until then.`}
          </p>
          <Button variant="danger" disabled={busy} onClick={approveDeletion}>Delete organization</Button>
        </div>
      )}
    </div>
  );
}
