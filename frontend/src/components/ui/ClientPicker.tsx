'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { useClient, type ClientSummary } from '@/lib/use-client';

interface ClientPickerProps {
  id?: string;
  value: string;
  onChange: (clientId: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

const PAGE = 20;

/**
 * Searchable client combobox. Searches the API as you type (debounced), so it
 * works with any number of clients — a plain <select> only ever had the first
 * page (100) of them.
 */
export function ClientPicker({ id, value, onChange, required, disabled, placeholder = 'Search clients…' }: ClientPickerProps) {
  const listId = useId();
  const loaded = useClient<ClientSummary>(value);
  // The row just picked from the list, so the box shows its name immediately
  // instead of going blank while useClient refetches it.
  const [picked, setPicked] = useState<ClientSummary | null>(null);
  const selected = loaded ?? (picked?.id === value ? picked : null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ q: string; items: ClientSummary[]; total: number } | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim();
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ limit: String(PAGE), sortBy: 'name', sortOrder: 'ASC' });
      if (q) params.set('search', q);
      api.get<{ data: ClientSummary[]; total: number }>(`/clients?${params}`)
        .then((res) => { if (!ignore) setResult({ q, items: res.data, total: res.total }); })
        .catch((err) => {
          logger.error('Failed to search clients', err, 'clients');
          if (!ignore) setResult({ q, items: [], total: 0 });
        });
    }, q ? 200 : 0);
    return () => { ignore = true; clearTimeout(timer); };
  }, [open, q]);

  const loading = open && result?.q !== q;
  const items = result?.q === q ? result.items : [];

  const choose = (c: ClientSummary) => {
    setPicked(c);
    onChange(c.id);
    setOpen(false);
    setQuery('');
  };

  const openList = () => { setOpen(true); setActive(0); };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (items[active]) choose(items[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); setQuery(''); }
  };

  const shown = open ? query : selected?.name ?? '';

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="input w-full"
        placeholder={value && !selected ? 'Loading…' : placeholder}
        value={shown}
        disabled={disabled}
        onFocus={openList}
        onClick={() => { if (!open) openList(); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); if (!open) setOpen(true); }}
        onKeyDown={onKeyDown}
        onBlur={() => { setOpen(false); setQuery(''); }}
      />
      {/* Carries `required` into native form validation (the visible box holds a search term, not the id). */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          onInvalid={() => inputRef.current?.focus()}
          className="absolute inset-x-0 bottom-0 h-px opacity-0 pointer-events-none"
        />
      )}
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-lg border border-border bg-surface shadow-lg py-1 text-sm"
        >
          {loading && items.length === 0 && <li className="px-3 py-2 text-text-muted">Searching…</li>}
          {!loading && items.length === 0 && (
            <li className="px-3 py-2 text-text-muted">{q ? `No clients match “${q}”` : 'No clients yet'}</li>
          )}
          {items.map((c, i) => (
            <li
              key={c.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={c.id === value}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => { e.preventDefault(); choose(c); }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer flex justify-between gap-3 ${i === active ? 'bg-primary-light text-primary-text' : 'text-text'}`}
            >
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-text-muted capitalize shrink-0">{c.type}</span>
            </li>
          ))}
          {!loading && result && result.total > items.length && (
            <li className="px-3 py-2 text-xs text-text-muted border-t border-border">
              Showing {items.length} of {result.total} — type to narrow down
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
