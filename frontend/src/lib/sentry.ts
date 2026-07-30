// Client-side error reporting bridge. No-op unless NEXT_PUBLIC_SENTRY_DSN is set.
// Sentry is dynamically imported so it never enters the server bundle and only
// loads in the browser when a DSN is configured (no build-wrapper / next.config
// changes needed).

let initialized = false;

export async function captureError(
  error: unknown,
  context?: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  try {
    const Sentry = await import('@sentry/react');
    if (!initialized) {
      Sentry.init({
        dsn,
        environment: process.env.NODE_ENV,
        tracesSampleRate: 0,
      });
      initialized = true;
    }
    Sentry.captureException(error, {
      tags: context ? { context } : undefined,
      extra,
    });
  } catch {
    // Never let error reporting throw into the app.
  }
}
