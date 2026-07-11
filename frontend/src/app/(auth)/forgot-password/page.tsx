'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Request failed');
        return;
      }

      setSubmitted(true);
      // In this internal app, the token is returned directly
      if (data.token) {
        setResetToken(data.token);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text">Reset Password</h1>
          <p className="text-text-secondary text-sm mt-1">Enter your email to receive a reset link</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
          {!submitted ? (
            <form onSubmit={handleSubmit}>
              {error && (
                <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>
              )}

              <div className="mb-6">
                <label htmlFor="email" className="block text-sm font-medium text-text mb-1.5">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          ) : (
            <div>
              <div className="mb-4 p-3 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 rounded-lg text-sm">
                If an account with that email exists, a reset link has been generated.
              </div>

              {resetToken && (
                <div className="mb-4">
                  <p className="text-sm text-text-secondary mb-2">Reset link (valid for 30 minutes):</p>
                  <Link
                    href={`/reset-password?token=${resetToken}`}
                    className="text-sm text-primary hover:text-primary-hover font-medium break-all"
                  >
                    Click here to reset password
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
