'use client';

import { useGoBack } from '@/lib/go-back';

/**
 * "← Back to …" at the top of a detail page: returns to the page the user came
 * from (see `useGoBack`), else to `href`.
 */
export function BackLink({ href, label, beforeLeave }: {
  href: string;
  label: string;
  beforeLeave?: () => Promise<boolean>;
}) {
  const back = useGoBack(href, label, beforeLeave);
  return (
    <button type="button" onClick={() => void back.go()}
      className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text transition-colors mb-3">
      ← Back to {back.label}
    </button>
  );
}
