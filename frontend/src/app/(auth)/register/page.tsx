'use client';

import { useState, FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005/api';

function RegisterForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, firstName, lastName, password, inviteToken: token }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        setError(msg || 'Registration failed');
        return;
      }
      // Register logs the user in (access token in body, refresh cookie set) — go home.
      if (data.accessToken) localStorage.setItem('accessToken', data.accessToken);
      router.push('/');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
        <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">
          This registration link is missing its invite token. Please use the link from your invite email.
        </div>
        <div className="text-center">
          <Link href="/login" className="text-sm text-primary hover:text-primary-hover font-medium">Back to login</Link>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent';

  return (
    <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
      <form onSubmit={handleSubmit}>
        {error && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-text mb-1.5">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
            className={inputClass} placeholder="The email your invite was sent to" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-text mb-1.5">First name</label>
            <input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-text mb-1.5">Last name</label>
            <input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className={inputClass} />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-text mb-1.5">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className={inputClass} placeholder="Upper, lower, number & special char" />
        </div>

        <div className="mb-6">
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-text mb-1.5">Confirm password</label>
          <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8}
            className={inputClass} placeholder="Re-enter your password" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary-hover transition-colors disabled:opacity-50">
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
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-text">Create your account</h1>
          <p className="text-text-secondary text-sm mt-1">Complete your invite to get started</p>
        </div>

        <Suspense fallback={
          <div className="bg-surface border border-border rounded-xl p-6 shadow-sm">
            <p className="text-sm text-text-secondary text-center">Loading...</p>
          </div>
        }>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
