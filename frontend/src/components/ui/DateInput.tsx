'use client';

import { useRef, useState } from 'react';
import { dateFormatPattern, formatDate, parseDateInput } from '@/lib/format';
import { CalendarIcon } from './icons';

/**
 * A date field in the organization's date format (Settings › General), not the
 * browser's: type "15/11/2026" or pick it from the calendar. The value stays
 * `YYYY-MM-DD` ('' = empty), like a native date input.
 */
export function DateInput({
  value, onChange, id, required, disabled, min, max, className = '', 'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  'aria-label'?: string;
}) {
  // What the user is typing; null = show the value, formatted.
  const [draft, setDraft] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLInputElement>(null);
  const pattern = dateFormatPattern();
  const shown = draft ?? (value ? formatDate(value) : '');
  const parsed = draft === null ? value : parseDateInput(draft);
  const outOfRange = !!parsed && ((min && parsed < min) || (max && parsed > max));
  const invalid = draft !== null && draft.trim() !== '' && (!parsed || outOfRange);

  const commit = () => {
    if (draft === null) return;
    if (draft.trim() === '') onChange('');
    else if (parsed && !outOfRange) onChange(parsed);
    else return; // keep the text so it can be corrected; the field shows why
    setDraft(null);
  };

  const openPicker = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); }
  };

  return (
    <div className={`relative ${className}`}>
      <input
        ref={text}
        id={id}
        className={`input w-full pr-10 ${invalid ? '!border-danger' : ''}`}
        inputMode="numeric"
        autoComplete="off"
        placeholder={pattern}
        value={shown}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title={invalid ? (outOfRange ? 'That date is outside the allowed range' : `Use the format ${pattern}`) : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          // A complete, valid date counts right away (forms submitted without leaving the field).
          const typed = e.target.value;
          const iso = parseDateInput(typed);
          const inRange = !!iso && !((min && iso < min) || (max && iso > max));
          if (inRange) onChange(iso);
          else if (typed.trim() === '') onChange('');
          // Half-typed or impossible dates block the form's submit with a message.
          e.target.setCustomValidity(typed.trim() === '' || inRange ? ''
            : iso ? 'That date is outside the allowed range.' : `Enter the date as ${pattern}.`);
        }}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      />
      <button type="button" onClick={openPicker} disabled={disabled} aria-label="Open calendar" tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-text-muted hover:text-text disabled:opacity-50">
        <CalendarIcon />
      </button>
      {/* The browser's calendar, opened by the button; it only ever sets the value. */}
      <input ref={picker} type="date" tabIndex={-1} aria-hidden="true" value={value} min={min} max={max}
        onChange={(e) => {
          setDraft(null);
          text.current?.setCustomValidity('');
          onChange(e.target.value);
        }}
        className="absolute bottom-0 right-0 w-px h-px opacity-0 pointer-events-none" />
    </div>
  );
}
