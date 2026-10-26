'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { confirmDialog } from './confirm';

const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page and lose them?';

// Set while a page has unsaved changes; read by confirmLeave().
let guarded = false;

/** Ask before leaving when a page has unsaved changes. Call before any
 *  programmatic navigation (router.push) that a guarded page doesn't own. */
export function confirmLeave(): Promise<boolean> {
  if (!guarded) return Promise.resolve(true);
  return confirmDialog({ message: LEAVE_MESSAGE, confirmText: 'Leave' });
}

/**
 * Warn before losing unsaved changes: browser close/reload (beforeunload) and
 * in-app links (sidebar etc. are <a> elements — intercepted in the capture
 * phase, before Next's <Link> handler). Programmatic navigation elsewhere in
 * the shell goes through confirmLeave().
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!dirty) return;
    guarded = true;

    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a || a.getAttribute('target') === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/')) return; // external, mailto:, #hash
      e.preventDefault();
      e.stopPropagation();
      void confirmLeave().then((ok) => {
        if (!ok) return;
        guarded = false;
        router.push(href);
      });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      guarded = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, router]);
}
