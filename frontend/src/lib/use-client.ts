'use client';

import { useEffect, useState } from 'react';
import { api } from './api';
import { logger } from './logger';

export interface ClientSummary { id: string; name: string; type: string; }

/** The client with this id (null while loading / when id is empty). */
export function useClient<T extends { id: string } = ClientSummary>(id: string): T | null {
  // Keyed by id so a previous client is never returned for a new id.
  const [loaded, setLoaded] = useState<T | null>(null);

  useEffect(() => {
    if (!id) return;
    let ignore = false;
    api.get<T>(`/clients/${id}`)
      .then((c) => { if (!ignore) setLoaded(c); })
      .catch((err) => logger.error('Failed to load client', err, 'clients'));
    return () => { ignore = true; };
  }, [id]);

  return id && loaded?.id === id ? loaded : null;
}
