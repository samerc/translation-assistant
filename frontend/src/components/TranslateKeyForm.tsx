'use client';

import { useState, FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

/**
 * Admin form for the Google Cloud Translation API key (Settings > General and
 * the document page's "GT isn't set up" prompt). The key is never sent back by
 * the API — only whether one is stored.
 */
export function TranslateKeyForm({ keySet, onSaved }: { keySet: boolean; onSaved: (keySet: boolean) => void }) {
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (value: string | null) => {
    setSaving(true);
    try {
      const res = await api.patch<{ googleTranslateKeySet?: boolean }>('/settings', { googleTranslateApiKey: value });
      setKey('');
      toast.success(value ? 'Google Translate key saved' : 'Google Translate key removed');
      onSaved(Boolean(res?.googleTranslateKeySet));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the key.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (key.trim()) save(key.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <label htmlFor="gt-key" className="block text-sm font-medium text-text">Google Cloud Translation API key</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          id="gt-key"
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keySet ? 'A key is saved — paste a new one to replace it' : 'Paste your API key'}
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={saving || !key.trim()}>
          {saving ? 'Saving...' : 'Save key'}
        </Button>
        {keySet && (
          <Button variant="secondary" disabled={saving} onClick={() => save(null)}>Remove</Button>
        )}
      </div>
      <p className="text-xs text-text-muted">
        Create one in Google Cloud Console (APIs &amp; Services → Credentials) with the Cloud Translation API enabled.
      </p>
    </form>
  );
}
