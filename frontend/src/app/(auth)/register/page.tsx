'use client';

import { useEffect, useState, FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '../auth-shell';

interface InviteDetails {
  email: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  roleName: string | null;
}

function InvalidInvite({ message }: { message: string }) {
  return (
    <div className="card p-6 shadow-sm">
      <div className="mb-4 p-3 tone tone-danger rounded-lg text-sm" role="alert">{message}</div>
      <div className="text-center">
        <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">Back to login</Link>
      </div>
    </div>
  );
}

function RegisterForm() {
  const token = useSearchParams().get('token') || '';
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!token) return;
    let ignore = false;
    api
      .post<InviteDetails>('/auth/invite-details', { token })
      .then((d) => {
        if (!ignore) setInvite(d);
      })
      .catch((err) => {
        if (!ignore) setLoadError(err instanceof ApiError ? err.message : 'Couldn’t load your invitation. Try again in a moment.');
      });
    return () => {
      ignore = true;
    };
  }, [token]);

  if (!token) return <InvalidInvite message="This registration link is missing its invite token. Please use the link from your invite email." />;
  if (loadError) return <InvalidInvite message={loadError} />;
  if (!invite) {
    return (
      <div className="card p-6 shadow-sm">
        <p className="text-sm text-text-secondary text-center">Loading your invitation…</p>
      </div>
    );
  }
  return <RegisterFields token={token} invite={invite} />;
}

function RegisterFields({ token, invite }: { token: string; invite: InviteDetails }) {
  const router = useRouter();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState(invite.firstName);
  const [lastName, setLastName] = useState(invite.lastName);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      // Goes through the auth context so the app sees the new user immediately
      // (and an admin who opened the invite link is replaced, not left in the UI).
      await register({ email: invite.email, firstName, lastName, password, inviteToken: token });
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-6 shadow-sm">
      <p className="mb-5 p-3 tone tone-info rounded-lg text-sm">
        You&apos;re joining <strong>{invite.organizationName}</strong>
        {invite.roleName ? <> as <strong>{invite.roleName}</strong></> : null}.
      </p>
      <form onSubmit={handleSubmit}>
        {error && <div className="mb-4 p-3 tone tone-danger rounded-lg text-sm" role="alert">{error}</div>}

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-text mb-1.5">Email</label>
          <input id="email" type="email" value={invite.email} readOnly aria-readonly="true" autoComplete="username"
            className="input bg-bg text-text-secondary cursor-not-allowed" />
          <p className="text-xs text-text-muted mt-1">Your invitation is for this address.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-text mb-1.5">First name</label>
            <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={100}
              autoComplete="given-name" autoFocus={!invite.firstName} className="input" />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-text mb-1.5">Last name</label>
            <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required maxLength={100}
              autoComplete="family-name" className="input" />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-text mb-1.5">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            autoComplete="new-password" autoFocus={!!invite.firstName}
            className="input" placeholder="Upper, lower, number & special char" />
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-text mb-1.5">Confirm password</label>
          <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8}
            autoComplete="new-password" className="input" placeholder="Re-enter your password" />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">Back to login</Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell subtitle="Create your account">
      <Suspense fallback={
        <div className="card p-6 shadow-sm">
          <p className="text-sm text-text-secondary text-center">Loading...</p>
        </div>
      }>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
