'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '../auth-shell';

interface SignupStatus {
  enabled: boolean;
  turnstileSiteKey: string | null;
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export default function SignupPage() {
  const [status, setStatus] = useState<SignupStatus | null>(null);
  const [form, setForm] = useState({ organizationName: '', firstName: '', lastName: '', email: '', password: '', confirm: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ message: string; token?: string } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    api.get<SignupStatus>('/auth/signup-status')
      .then(setStatus)
      .catch(() => setStatus({ enabled: true, turnstileSiteKey: null }));
  }, []);

  // Cloudflare Turnstile ("are you human") when the server has a site key.
  const siteKey = status?.turnstileSiteKey;
  useEffect(() => {
    if (!siteKey || !widgetRef.current) return;
    const render = () => {
      if (!window.turnstile || !widgetRef.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: siteKey,
        callback: setTurnstileToken,
        'expired-callback': () => setTurnstileToken(''),
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [siteKey]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('The passwords don’t match.');
      return;
    }
    if (siteKey && !turnstileToken) {
      setError('Please complete the human check.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ message: string; token?: string }>('/auth/signup', {
        organizationName: form.organizationName,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        acceptTerms,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      setDone(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-up failed. Please try again.');
      // A Turnstile token is single-use.
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setTurnstileToken('');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell subtitle="Almost there">
        <div className="card p-6 shadow-sm text-sm">
          <h2 className="font-semibold text-text text-base mb-2">Check your email</h2>
          <p className="text-text-secondary">{done.message}</p>
          {done.token && (
            <p className="mt-4 p-3 tone tone-info rounded-lg">
              Development mode (no email):{' '}
              <Link className="underline font-medium" href={`/verify-email?token=${done.token}`}>confirm your address here</Link>.
            </p>
          )}
          <div className="mt-6 text-center">
            <Link href="/login" className="text-primary hover:text-primary-hover font-medium">Back to sign in</Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (status && !status.enabled) {
    return (
      <AuthShell subtitle="Create an account">
        <div className="card p-6 shadow-sm text-sm text-center">
          <p className="text-text">Sign-ups are closed at the moment.</p>
          <p className="text-text-secondary mt-1">If you were invited, use the link in your invitation email.</p>
          <div className="mt-6">
            <Link href="/login" className="text-primary hover:text-primary-hover font-medium">Back to sign in</Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Create an account for your organization" wide>
      <form onSubmit={submit} className="card p-6 shadow-sm space-y-4">
        {error && <div className="p-3 tone tone-danger rounded-lg text-sm" role="alert">{error}</div>}

        <div>
          <label htmlFor="org" className="block text-sm font-medium text-text mb-1.5">Organization name</label>
          <input id="org" className="input w-full" value={form.organizationName} onChange={set('organizationName')} required minLength={2} maxLength={150} autoFocus placeholder="e.g. Smith Translations" />
          <p className="text-xs text-text-muted mt-1">Your business or team. You&apos;ll invite your colleagues after sign-up.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="first" className="block text-sm font-medium text-text mb-1.5">First name</label>
            <input id="first" className="input w-full" value={form.firstName} onChange={set('firstName')} required maxLength={100} autoComplete="given-name" />
          </div>
          <div>
            <label htmlFor="last" className="block text-sm font-medium text-text mb-1.5">Last name</label>
            <input id="last" className="input w-full" value={form.lastName} onChange={set('lastName')} required maxLength={100} autoComplete="family-name" />
          </div>
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-text mb-1.5">Email</label>
          <input id="email" type="email" className="input w-full" value={form.email} onChange={set('email')} required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-text mb-1.5">Password</label>
          <input id="password" type="password" className="input w-full" value={form.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
          <p className="text-xs text-text-muted mt-1">At least 8 characters, with upper- and lower-case letters, a number and a symbol.</p>
        </div>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-text mb-1.5">Confirm password</label>
          <input id="confirm" type="password" className="input w-full" value={form.confirm} onChange={set('confirm')} required autoComplete="new-password" />
        </div>

        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <input type="checkbox" className="mt-0.5" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} required />
          <span>
            I agree to the{' '}
            <Link href="/terms" target="_blank" className="text-primary hover:text-primary-hover underline">terms of service</Link>{' '}
            and the{' '}
            <Link href="/privacy" target="_blank" className="text-primary hover:text-primary-hover underline">privacy policy</Link>.
          </span>
        </label>

        {siteKey && <div ref={widgetRef} className="min-h-[65px]" />}

        <button type="submit" disabled={loading || !status} className="btn btn-primary w-full">
          {loading ? 'Creating your account…' : 'Create account'}
        </button>
        <p className="text-xs text-text-muted text-center">New organizations are reviewed before they can log in. We&apos;ll email you.</p>
        <div className="text-center text-sm">
          <span className="text-text-secondary">Already have an account? </span>
          <Link href="/login" className="text-primary hover:text-primary-hover font-medium">Sign in</Link>
        </div>
      </form>
    </AuthShell>
  );
}
