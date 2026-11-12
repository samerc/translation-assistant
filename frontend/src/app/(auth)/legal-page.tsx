import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Who runs the service and how to reach them, for the terms and privacy pages.
 * Set NEXT_PUBLIC_LEGAL_OPERATOR / NEXT_PUBLIC_LEGAL_CONTACT at build time.
 */
export const OPERATOR = process.env.NEXT_PUBLIC_LEGAL_OPERATOR || 'the operator of this service';
export const CONTACT = process.env.NEXT_PUBLIC_LEGAL_CONTACT || '';

export function ContactLine() {
  return CONTACT ? (
    <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
  ) : (
    <>the sender address of the emails you receive from the service</>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <article className="card max-w-3xl mx-auto p-6 sm:p-10 text-sm leading-relaxed text-text-secondary [&_h2]:text-text [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1">
        <Link href="/login" className="text-xs text-text-muted hover:text-text">← Translation Assistant</Link>
        <h1 className="text-2xl font-bold text-text mt-3">{title}</h1>
        <p className="text-xs text-text-muted mt-1">Last updated {updated}</p>
        {children}
      </article>
    </div>
  );
}
