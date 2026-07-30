import * as Sentry from '@sentry/node';

// Error reporting. No-op unless SENTRY_DSN is set, so it's safe in dev/CI.
// Must be imported before anything else in main.ts so Sentry can instrument
// http/express early. Tracing is off (error capture only) to keep it light.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0,
  });
}

export { Sentry };
