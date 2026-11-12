'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AuthShell } from '../auth-shell';

type Result = { ok: true; message: string; pending: boolean } | { ok: false; message: string };

function VerifyEmail() {
  const token = useSearchParams().get('token') ?? '';
  const [result, setResult] = useState<Result | null>(null);
  // The link is single-use: confirm once even if the effect runs twice (dev StrictMode).
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    if (!token) {
      Promise.resolve().then(() => setResult({ ok: false, message: 'This confirmation link is incomplete.' }));
      return;
    }
    api.post<{ message: string; organizationStatus?: string }>('/auth/verify-email', { token })
      .then((r) => setResult({ ok: true, message: r.message, pending: r.organizationStatus === 'pending' }))
      .catch((err) => setResult({ ok: false, message: err instanceof ApiError ? err.message : 'We couldn’t confirm your email. Try again in a moment.' }));
  }, [token]);

  return (
    <AuthShell subtitle="Email confirmation">
      <div className="card p-6 shadow-sm text-sm">
        {!result && <p className="text-text-secondary text-center">Confirming your email…</p>}
        {result?.ok && (
          <>
            <div className="p-3 tone tone-success rounded-lg">{result.message}</div>
            {!result.pending && (
              <div className="mt-6 text-center">
                <Link href="/login" className="btn btn-primary w-full">Sign in</Link>
              </div>
            )}
          </>
        )}
        {result && !result.ok && (
          <>
            <div className="p-3 tone tone-danger rounded-lg" role="alert">{result.message}</div>
            <p className="text-text-secondary mt-4">
              Links expire after 24 hours. Try signing in: if your address still needs confirming, you can ask for a new link there.
            </p>
          </>
        )}
        <div className="mt-6 text-center">
          <Link href="/login" className="text-primary hover:text-primary-hover font-medium">Back to sign in</Link>
        </div>
      </div>
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
