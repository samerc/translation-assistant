/**
 * Centralized logging utility.
 * In development, logs to console.
 * In production, can be connected to an external service (Sentry, LogRocket, etc.)
 */

import { captureError } from './sentry';

interface LogEntry {
  message: string;
  context?: string;
  error?: unknown;
  data?: Record<string, unknown>;
  timestamp: string;
}

const logs: LogEntry[] = [];

function formatError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch { return String(error); }
}

function createEntry(level: string, message: string, context?: string, error?: unknown, data?: Record<string, unknown>): LogEntry {
  const entry: LogEntry = {
    message: `[${level}] ${context ? `[${context}] ` : ''}${message}`,
    context,
    error,
    data,
    timestamp: new Date().toISOString(),
  };

  // Keep last 100 logs in memory for debugging
  logs.push(entry);
  if (logs.length > 100) logs.shift();

  return entry;
}

export const logger = {
  error(message: string, error?: unknown, context?: string) {
    const entry = createEntry('ERROR', message, context, error);
    if (process.env.NODE_ENV !== 'production') {
      console.error(entry.message, error ? formatError(error) : '');
    }
    // Forward to Sentry (no-op unless NEXT_PUBLIC_SENTRY_DSN is set). Fire-and-forget.
    void captureError(error ?? new Error(message), context, { message });
  },

  warn(message: string, data?: Record<string, unknown>, context?: string) {
    const entry = createEntry('WARN', message, context, undefined, data);
    if (process.env.NODE_ENV !== 'production') {
      console.warn(entry.message, data || '');
    }
  },

  info(message: string, data?: Record<string, unknown>, context?: string) {
    const entry = createEntry('INFO', message, context, undefined, data);
    if (process.env.NODE_ENV !== 'production') {
      console.log(entry.message, data || '');
    }
  },

  /** Get recent logs for debugging */
  getRecentLogs(): LogEntry[] {
    return [...logs];
  },
};
