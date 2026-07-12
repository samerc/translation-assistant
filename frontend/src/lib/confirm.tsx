'use client';

// Promise-based confirm/alert dialogs that replace the browser's blocking
// window.confirm()/alert(). A single <ConfirmHost/> (mounted once in the
// authenticated layout) renders the current request; call sites just await
// confirmDialog(...) / alertDialog(...) from anywhere — no per-component hook.

import { useEffect, useState } from 'react';

interface DialogOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface DialogRequest extends DialogOptions {
  id: number;
  mode: 'confirm' | 'alert';
  resolve: (value: boolean) => void;
}

let counter = 0;
let queue: DialogRequest[] = [];
let listeners: ((reqs: DialogRequest[]) => void)[] = [];

function emit() {
  const snapshot = [...queue];
  listeners.forEach((l) => l(snapshot));
}

function push(req: Omit<DialogRequest, 'id' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ ...req, id: ++counter, resolve });
    emit();
  });
}

/** Ask the user to confirm a (usually destructive) action. Resolves true/false. */
export function confirmDialog(opts: string | DialogOptions): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return push({ mode: 'confirm', danger: true, ...o });
}

/** Show an informational message with a single OK button. */
export function alertDialog(opts: string | Omit<DialogOptions, 'danger' | 'cancelText'>): Promise<boolean> {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return push({ mode: 'alert', ...o });
}

export function ConfirmHost() {
  const [reqs, setReqs] = useState<DialogRequest[]>([]);

  useEffect(() => {
    listeners.push(setReqs);
    setReqs([...queue]);
    return () => {
      listeners = listeners.filter((l) => l !== setReqs);
    };
  }, []);

  const current = reqs[0];

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter') finish(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;

  const finish = (value: boolean) => {
    current.resolve(value);
    queue = queue.filter((r) => r.id !== current.id);
    emit();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={() => finish(false)} />
      <div className="relative bg-surface border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
        <h3 className="text-lg font-semibold text-text mb-2">
          {current.title || (current.mode === 'alert' ? 'Notice' : 'Are you sure?')}
        </h3>
        <p className="text-sm text-text-secondary whitespace-pre-line">{current.message}</p>
        <div className="mt-6 flex justify-end gap-3">
          {current.mode === 'confirm' && (
            <button
              onClick={() => finish(false)}
              className="px-4 py-2 bg-bg border border-border text-text-secondary rounded-lg text-sm hover:bg-border/50 transition-colors"
            >
              {current.cancelText || 'Cancel'}
            </button>
          )}
          <button
            autoFocus
            onClick={() => finish(true)}
            className={`px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors ${
              current.danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary-hover'
            }`}
          >
            {current.confirmText || (current.mode === 'alert' ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
