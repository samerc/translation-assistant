'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current one.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/users/change-password', { currentPassword, newPassword });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      const raw = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setError(Array.isArray(raw) ? raw.join(' ') : String(raw));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-bg border border-border rounded-lg text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-semibold text-text">Change Password</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg" aria-label="Close">
            &times;
          </button>
        </div>

        {success ? (
          <div className="p-3 bg-success-light text-success rounded-lg text-sm text-center">
            Password changed successfully.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div className="mb-4 p-3 bg-danger-light text-danger rounded-lg text-sm">{error}</div>}

            <div className="mb-4">
              <label className="block text-sm font-medium text-text mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoFocus
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-text mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
              <p className="text-xs text-text-muted mt-1">At least 8 characters with an uppercase letter, lowercase letter, number, and special character — and not a commonly used password.</p>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-text mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-text-secondary hover:bg-bg rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
