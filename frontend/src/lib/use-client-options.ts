'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { logger } from './logger';

/**
 * Client options for a <select>. The API caps a page at 100 (sorted by name), so a
 * client chosen elsewhere (?clientId=, a prefilled job) may not be in that page —
 * fetch it on its own and include it, or the select would silently show nothing.
 */
export function useClientOptions<T extends { id: string }>(selectedId: string): T[] {
  const [list, setList] = useState<T[] | null>(null);
  const [extra, setExtra] = useState<T | null>(null);

  useEffect(() => {
    api.get<{ data: T[] }>('/clients?limit=100')
      .then((res) => setList(res.data))
      .catch((err) => {
        logger.error('Failed to load clients', err, 'clients');
        setList([]);
      });
  }, []);

  const missing = Boolean(list && selectedId && !list.some((c) => c.id === selectedId));

  useEffect(() => {
    if (!missing) return;
    let ignore = false;
    api.get<T>(`/clients/${selectedId}`)
      .then((c) => { if (!ignore) setExtra(c); })
      .catch((err) => logger.error('Failed to load selected client', err, 'clients'));
    return () => { ignore = true; };
  }, [missing, selectedId]);

  const options = list ?? [];
  return missing && extra?.id === selectedId ? [extra, ...options] : options;
}
