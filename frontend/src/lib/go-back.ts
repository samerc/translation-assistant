'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "← Back" that returns to the page the user actually came from (a client, the
 * calendar, a search result…), not to a fixed list. Uses the browser's Navigation
 * API to find the nearest earlier history entry that is a different page — tab /
 * filter changes on the same page and finished forms (/jobs/new…) are skipped —
 * and traverses there, so the list keeps its scroll position and the forward
 * history stays intact. No usable entry (opened in a new tab, direct link, a
 * browser without the API) → the page's fixed fallback.
 */

interface NavEntry { key: string; url: string | null; index: number }
interface Nav {
  entries(): NavEntry[];
  currentEntry: NavEntry | null;
  traverseTo(key: string): unknown;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

function nav(): Nav | null {
  if (typeof window === 'undefined') return null;
  const n = (window as unknown as { navigation?: Nav }).navigation;
  return n && typeof n.entries === 'function' && typeof n.traverseTo === 'function' ? n : null;
}

/** Pages a "back" should never land on: forms already submitted, and anything outside the app. */
const SKIP = [/^\/jobs\/new$/, /^\/invoices\/new$/, /^\/templates\/new$/, /^\/templates\/[^/]+\/setup$/];
const OUTSIDE = /^\/(login|register|signup|verify-email|forgot-password|reset-password|terms|privacy)(\/|$)/;

const LABELS: [RegExp, string][] = [
  [/^\/$/, 'Dashboard'],
  [/^\/jobs$/, 'Jobs'],
  [/^\/jobs\/[^/]+$/, 'job'],
  [/^\/clients$/, 'Clients'],
  [/^\/clients\/[^/]+$/, 'client'],
  [/^\/invoices$/, 'Invoices'],
  [/^\/invoices\/[^/]+$/, 'invoice'],
  [/^\/templates$/, 'Templates'],
  [/^\/templates\/[^/]+$/, 'template'],
  [/^\/documents\/[^/]+$/, 'document'],
  [/^\/calendar$/, 'Calendar'],
  [/^\/notifications$/, 'Notifications'],
  [/^\/reports$/, 'Reports'],
  [/^\/team$/, 'Team'],
  [/^\/activity$/, 'Activity'],
  [/^\/settings$/, 'Settings'],
  [/^\/platform$/, 'Organizations'],
];

function labelFor(pathname: string): string {
  return LABELS.find(([re]) => re.test(pathname))?.[1] ?? 'previous page';
}

function backTarget(): string | null {
  const n = nav();
  const current = n?.currentEntry;
  if (!n || !current || !current.url) return null;
  const origin = window.location.origin;
  const here = new URL(current.url).pathname;
  const entries = n.entries();
  for (let i = current.index - 1; i >= 0; i--) {
    const e = entries[i];
    if (!e?.url) return null;
    const u = new URL(e.url);
    if (u.origin !== origin || OUTSIDE.test(u.pathname)) return null;
    if (u.pathname === here || SKIP.some((re) => re.test(u.pathname))) continue;
    return `${e.key}\n${u.pathname}`;
  }
  return null;
}

function subscribe(cb: () => void) {
  const n = nav();
  if (!n) return () => {};
  n.addEventListener('currententrychange', cb);
  return () => n.removeEventListener('currententrychange', cb);
}

export interface GoBack {
  /** Where the button goes, for its text: "Back to <label>". */
  label: string;
  /** True when it returns to the page the user came from (not the fallback). */
  isHistory: boolean;
  go: () => Promise<void>;
}

/**
 * @param fallbackHref  where to go with no usable history (e.g. `/jobs`)
 * @param fallbackLabel its label (e.g. `Jobs`); also used when history leads to that same page
 * @param beforeLeave   optional check (unsaved changes) — false keeps the user here
 */
export function useGoBack(fallbackHref: string, fallbackLabel: string, beforeLeave?: () => Promise<boolean>): GoBack {
  const router = useRouter();
  const target = useSyncExternalStore(subscribe, backTarget, () => null);
  const [key, pathname] = target ? target.split('\n') : [null, null];
  const fallbackPath = fallbackHref.split('?')[0];
  const label = !pathname || pathname === fallbackPath ? fallbackLabel : labelFor(pathname);

  const go = useCallback(async () => {
    if (beforeLeave && !(await beforeLeave())) return;
    const n = nav();
    if (key && n) {
      try {
        const r = n.traverseTo(key) as { committed?: Promise<unknown>; finished?: Promise<unknown> } | undefined;
        r?.committed?.catch(() => {});
        r?.finished?.catch(() => {});
        return;
      } catch { /* entry gone — fall through */ }
    }
    router.push(fallbackHref);
  }, [beforeLeave, key, router, fallbackHref]);

  return { label, isHistory: Boolean(key), go };
}
