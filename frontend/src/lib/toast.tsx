'use client';

// Lightweight toast notifications. Call toast.success/error/info(message) from
// anywhere; a single <ToastHost/> (mounted in the authenticated layout) renders
// the stack. Same singleton pattern as lib/confirm.tsx — no per-component hook.

import { useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

let counter = 0;
let items: Toast[] = [];
let listeners: ((t: Toast[]) => void)[] = [];

function emit() {
  const snapshot = [...items];
  listeners.forEach((l) => l(snapshot));
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function push(type: ToastType, message: string, ttl = 4000) {
  const id = ++counter;
  items.push({ id, type, message });
  emit();
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(id), ttl);
  }
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message, 6000),
  info: (message: string) => push('info', message),
};

const STYLES: Record<ToastType, string> = {
  success: 'bg-success-light border-success',
  error: 'bg-danger-light border-danger',
  info: 'bg-info-light border-info',
};

const ACCENT: Record<ToastType, string> = {
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
};

const ICON: Record<ToastType, string> = { success: '✓', error: '!', info: 'i' };

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    listeners.push(setToasts);
    setToasts([...items]);
    return () => {
      listeners = listeners.filter((l) => l !== setToasts);
    };
  }, []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[110] flex flex-col gap-2 w-full max-w-sm px-4 sm:px-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.type === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg ${STYLES[t.type]}`}
        >
          <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${ACCENT[t.type]}`}>
            {ICON[t.type]}
          </span>
          <span className="flex-1 text-sm text-text">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-text-muted hover:text-text transition-colors leading-none"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
