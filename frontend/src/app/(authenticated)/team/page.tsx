'use client';

import Link from 'next/link';
import { useState, useEffect, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { buttonClass } from '@/components/ui/Button';
import { KeyIcon } from '@/components/ui/icons';
import { confirmDialog, alertDialog } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { NO_AUTOFILL } from '@/lib/no-autofill';
import { formatDate } from '@/lib/format';

/**
 * The organization's people (Admin only): who is in it, their roles and open
 * jobs, invitations — and what each role may do. Was Settings › Users / Roles.
 */
export default function TeamPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.isPlatformAdmin || user.role?.name !== 'Admin') {
    return (
      <div className="card mt-6">
        <EmptyState
          icon={<KeyIcon />}
          title="You don't have access to this page"
          description="Only the organization's admins manage the team."
          action={<Link href="/" className={buttonClass()}>Back to dashboard</Link>}
        />
      </div>
    );
  }
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Team"
        description="Everyone in your organization. Invite translators (or yourself as one), change roles, and see who has open jobs."
      />
      <Members />
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-text mb-3">Roles</h2>
        <Roles />
      </section>
    </div>
  );
}

// ── Users & Invites (admin) ──

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role?: { id: string; name: string };
  /** Open jobs (quote / accepted / in progress) they are assigned to. */
  openJobCount?: number;
}
interface RoleOption { id: string; name: string }
interface PendingInvite {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  token: string;
  expiresAt: string;
  expired: boolean;
}

const inviteLink = (token: string) => `${window.location.origin}/register?token=${token}`;

async function copyText(text: string, what = 'Link') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error('Copy failed — select the link and copy it by hand.');
  }
}

function Members() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [inviteFirst, setInviteFirst] = useState('');
  const [inviteLast, setInviteLast] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ link: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<AdminUser[]>('/users')
      .then((res) => { setUsers(res); setLoadError(false); })
      .catch(() => setLoadError(true));
    api.get<RoleOption[]>('/roles').then(setRoles).catch(() => {});
    api.get<PendingInvite[]>('/auth/invites').then(setInvites).catch(() => {});
  };
  useEffect(load, []);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInviteResult(null);
    setInviteBusy(true);
    try {
      const res = await api.post<{ token: string }>('/auth/invite', {
        email: inviteEmail,
        ...(inviteRoleId ? { roleId: inviteRoleId } : {}),
        ...(inviteFirst.trim() ? { firstName: inviteFirst.trim() } : {}),
        ...(inviteLast.trim() ? { lastName: inviteLast.trim() } : {}),
      });
      setInviteResult({ link: inviteLink(res.token) });
      setInviteEmail('');
      setInviteFirst('');
      setInviteLast('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Failed to create invite.');
    } finally {
      setInviteBusy(false);
    }
  };

  const resendInvite = async (inv: PendingInvite) => {
    try {
      const res = await api.post<{ token: string }>(`/auth/invites/${inv.id}/resend`);
      await copyText(inviteLink(res.token), 'New link');
      toast.success(`Invite sent again to ${inv.email}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to resend the invite.');
    }
  };

  const cancelInvite = async (inv: PendingInvite) => {
    if (!(await confirmDialog({
      title: 'Cancel invite',
      message: `Cancel the invite for ${inv.email}? Its link stops working.`,
      confirmText: 'Cancel invite',
      cancelText: 'Keep it',
      danger: true,
    }))) return;
    try {
      await api.delete(`/auth/invites/${inv.id}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to cancel the invite.');
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await api.patch(`/users/${u.id}/${u.isActive ? 'deactivate' : 'activate'}`);
      load();
    } catch {
      setError('Failed to update user.');
    }
  };

  const resetPassword = async (u: AdminUser) => {
    if (!(await confirmDialog({
      title: 'Reset password',
      message: `Give ${u.email} a temporary password? They will be signed out everywhere and must choose a new password when they next log in.`,
      confirmText: 'Reset password',
    }))) return;
    try {
      const { temporaryPassword } = await api.post<{ temporaryPassword: string }>(`/users/${u.id}/reset-password`);
      try { await navigator.clipboard.writeText(temporaryPassword); } catch { /* clipboard may be blocked */ }
      await alertDialog({
        title: 'Temporary password',
        message: `${temporaryPassword}

Send this to ${u.email} over a channel you trust. It is shown only once (it was also copied to your clipboard).`,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reset password.');
    }
  };

  const remove = async (u: AdminUser) => {
    if (!(await confirmDialog(`Delete ${u.email}? This cannot be undone.`))) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? String(err.message) : 'Failed to delete user.');
    }
  };

  const inputClass = 'input';

  return (
    <div className="max-w-4xl space-y-6">
      {/* Invite */}
      <div className="card p-6">
        <h3 className="font-semibold text-text mb-1">Invite someone to the team</h3>
        <p className="text-sm text-text-secondary mb-4">We email them a link to join (valid 7 days). You can also copy the link and send it yourself.</p>
        {error && <div className="mb-4 p-3 tone tone-danger rounded-lg text-sm">{error}</div>}
        <form onSubmit={invite} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:items-end">
          <div>
            <label htmlFor="inviteFirst" className="block text-sm font-medium text-text mb-1.5">First name <span className="text-text-muted font-normal">(optional)</span></label>
            <input id="inviteFirst" {...NO_AUTOFILL} maxLength={100} value={inviteFirst} onChange={(e) => setInviteFirst(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="inviteLast" className="block text-sm font-medium text-text mb-1.5">Last name <span className="text-text-muted font-normal">(optional)</span></label>
            <input id="inviteLast" {...NO_AUTOFILL} maxLength={100} value={inviteLast} onChange={(e) => setInviteLast(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="inviteEmail" className="block text-sm font-medium text-text mb-1.5">Email</label>
            <input id="inviteEmail" type="email" {...NO_AUTOFILL} required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="inviteRole" className="block text-sm font-medium text-text mb-1.5">Role</label>
            <select id="inviteRole" value={inviteRoleId} onChange={(e) => setInviteRoleId(e.target.value)} className={inputClass}>
              <option value="">Default (Translator)</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={inviteBusy} className="btn btn-primary">
              {inviteBusy ? 'Creating...' : 'Create invite'}
            </button>
          </div>
        </form>
        {inviteResult && (
          <div className="mt-4 p-3 tone tone-success rounded-lg text-sm flex flex-col sm:flex-row sm:items-center gap-3" role="status">
            <span className="break-all flex-1">Invite created. Link: <span className="font-medium">{inviteResult.link}</span></span>
            <Button size="sm" onClick={() => copyText(inviteResult.link)}>Copy link</Button>
          </div>
        )}
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-text mb-4">Pending invites</h3>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[520px]">
              <thead>
                <tr className="border-b border-border text-left text-text-secondary">
                  <th className="py-2 font-semibold">Invited</th>
                  <th className="py-2 font-semibold">Role</th>
                  <th className="py-2 font-semibold">Expires</th>
                  <th className="py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id} className="border-b border-border last:border-0">
                    <td className="py-2">
                      <div className="text-text">{[inv.firstName, inv.lastName].filter(Boolean).join(' ') || inv.email}</div>
                      {(inv.firstName || inv.lastName) && <div className="text-xs text-text-muted">{inv.email}</div>}
                    </td>
                    <td className="py-2 text-text-secondary">{inv.role || '—'}</td>
                    <td className="py-2">
                      {inv.expired
                        ? <Badge tone="tone tone-danger">Expired</Badge>
                        : <span className="text-text-secondary">{formatDate(inv.expiresAt)}</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {!inv.expired && (
                        <button onClick={() => copyText(inviteLink(inv.token))} className="text-xs font-medium text-primary-text hover:underline mr-3">Copy link</button>
                      )}
                      <button onClick={() => resendInvite(inv)} className="text-xs font-medium text-primary-text hover:underline mr-3">Resend</button>
                      <button onClick={() => cancelInvite(inv)} className="text-xs font-medium text-danger hover:underline">Cancel</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* User list */}
      <div className="card p-6">
        <h3 className="font-semibold text-text mb-4">Members</h3>
        {loadError && <div className="mb-4 p-3 tone tone-danger rounded-lg text-sm">Couldn&apos;t load users.</div>}
        <div className="overflow-x-auto">
          <table className="data-table min-w-[520px]">
            <thead>
              <tr className="border-b border-border text-left text-text-secondary">
                <th className="py-2 font-semibold">Name</th>
                <th className="py-2 font-semibold">Email</th>
                <th className="py-2 font-semibold">Role</th>
                <th className="py-2 font-semibold">Open jobs</th>
                <th className="py-2 font-semibold">Status</th>
                <th className="py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0">
                  <td className="py-2 text-text">{u.firstName} {u.lastName}</td>
                  <td className="py-2 text-text-secondary">{u.email}</td>
                  <td className="py-2 text-text-secondary">{u.role?.name || '—'}</td>
                  <td className="py-2">
                    <Link href={`/jobs?assignee=${u.id === me?.id ? 'me' : u.id}`} className="text-primary-text hover:underline tabular-nums"
                      title={`${u.firstName}'s jobs`}>
                      {u.openJobCount ?? 0}
                    </Link>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${u.isActive ? 'tone tone-success' : 'tone tone-neutral'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">
                    {u.id === me?.id ? (
                      // The API refuses changing your own status anyway — don't offer it.
                      <span className="text-xs text-text-muted">You</span>
                    ) : (
                      <>
                        <button onClick={() => toggleActive(u)} className="text-xs font-medium text-primary-text hover:underline mr-3">
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => resetPassword(u)} className="text-xs font-medium text-primary-text hover:underline mr-3">Reset password</button>
                        <button onClick={() => remove(u)} className="text-xs font-medium text-danger hover:underline">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && !loadError && (
                <tr><td colSpan={6} className="py-6 text-center text-text-muted">No users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Roles & Permissions (admin) ──

interface Permission { id: string; resource: string; action: string; description?: string }
interface Role { id: string; name: string; description?: string; permissions: Permission[] }

function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Role[]>('/roles').then(setRoles).catch(() => setError('Couldn’t load roles.'));
  }, []);

  // Admin first, then the more limited roles.
  const order = ['Admin', 'Translator', 'Viewer'];
  const sorted = [...roles].sort((x, y) => order.indexOf(x.name) - order.indexOf(y.name));

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Every organization has the same three roles. Choose one when you invite someone, or change it in the list above.
      </p>
      {error && <div className="p-3 tone tone-danger rounded-lg text-sm">{error}</div>}
      <div className="space-y-3">
        {sorted.map((r) => {
          const byResource = r.permissions.reduce<Record<string, string[]>>((acc, p) => {
            (acc[p.resource] = acc[p.resource] || []).push(p.action);
            return acc;
          }, {});
          return (
            <div key={r.id} className="card p-4">
              <div className="font-medium text-text">{r.name}</div>
              {r.description && <div className="text-sm text-text-secondary mt-0.5">{r.description}</div>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.keys(byResource).sort().map((res) => (
                  <span key={res} className="badge tone tone-neutral capitalize" title={byResource[res].join(', ')}>
                    {res}: {['create', 'read', 'update', 'delete'].filter((a) => byResource[res].includes(a)).join(', ')}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
