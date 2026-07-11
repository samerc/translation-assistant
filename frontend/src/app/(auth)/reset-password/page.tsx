'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Token verification state
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  // Verify the token before showing the form (requirement 6)
  useEffect(() => {
    if (!token) {
      setVerifying(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/verify-reset-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        setTokenValid(data.valid === true);
        if (data.email) setMaskedEmail(data.email);
      } catch {
        setTokenValid(false);
      } finally {
        setVerifying(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        setError(msg || 'Reset failed');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <p className="text-sm text-text-secondary text-center">Verifying reset token...</p>
      </div>
    );
  }

  if (!token || !tokenValid) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">
          This reset link is invalid or has expired. Please request a new one.
        </div>
        <div className="text-center">
          <Link href="/forgot-password" className="text-sm text-primary hover:text-primary-hover font-medium">
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="mb-4 p-3 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-lg text-sm">
          Password has been reset successfully. All other sessions have been logged out.
        </div>
        <div className="text-center">
          <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>
        )}

        {maskedEmail && (
          <p className="text-sm text-text-secondary mb-4">
            Resetting password for <span className="font-medium text-text">{maskedEmail}</span>
          </p>
        )}

        <div className="mb-4">
          <label htmlFor="newPassword" className="block text-sm font-medium text-text mb-1.5">New Password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Minimum 8 characters"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-text mb-1.5">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Re-enter your new password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">
          Back to login
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text">Set New Password</h1>
          <p className="text-text-secondary text-sm mt-1">Choose a strong password for your account</p>
        </div>

        <Suspense fallback={
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <p className="text-sm text-text-secondary text-center">Loading...</p>
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
