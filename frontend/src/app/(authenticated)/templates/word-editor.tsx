'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { humanize } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';

/**
 * The Word template, shown on the page: select text and make it a field, or
 * click in a table row and make it repeat. The server edits the .docx; where
 * the user selected is sent as text (see backend `templates/word-edit.ts`):
 * the paragraph's text, which of the identical paragraphs it is, and the
 * selection counted in non-whitespace characters.
 */

export interface WordSpot { paragraphText: string; occurrence: number; start: number; end: number; text: string }
export interface EditorField { fieldKey: string; groupKey: string | null; labels: { languageId: string; label: string }[] }

interface RowInfo { spot: WordSpot; group: string | null }
type Picked =
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'text'; spot: WordSpot; row: RowInfo | null }
  | { kind: 'field'; spot: WordSpot; key: string; row: RowInfo | null }
  | { kind: 'row'; row: RowInfo };

const squash = (s: string) => s.replace(/\s+/g, '');
const TAG = /\{[#/]?[a-zA-Z_][a-zA-Z0-9_]*\}/g;

/** "Full name" → "full_name"; names with no Latin letters → "field". */
export function toFieldKey(name: string): string {
  const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/[a-z]/.test(key)) return 'field';
  return /^[0-9]/.test(key) ? `_${key}` : key;
}

/** Keep the picked words highlighted while the name box has focus (CSS Custom Highlight API, where supported). */
function highlight(range: Range | null) {
  const registry = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  const Ctor = (globalThis as { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
  if (!registry || !Ctor) return;
  if (range) registry.set('ta-pick', new Ctor(range));
  else registry.delete('ta-pick');
}

/** Shrink the page to the box on narrow screens (pages are A4/Letter wide). */
function fitToWidth(el: HTMLElement) {
  const page = el.querySelector<HTMLElement>('section.docx');
  const box = el.parentElement;
  if (!page || !box) return;
  el.style.zoom = '';
  const needed = page.offsetWidth + 32;
  el.style.zoom = box.clientWidth < needed ? String(box.clientWidth / needed) : '';
}

const elementOf = (n: Node): Element | null => (n instanceof Element ? n : n.parentElement);

/** Body paragraphs, in document order (headers and footers can't be edited here). */
const bodyParagraphs = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll('p')).filter((p) => !p.closest('header, footer'));

function spotIn(root: HTMLElement, p: HTMLElement, start: number, end: number, text: string): WordSpot {
  const paragraphText = p.textContent ?? '';
  const same = squash(paragraphText);
  const occurrence = bodyParagraphs(root).filter((x) => squash(x.textContent ?? '') === same).indexOf(p);
  return { paragraphText, occurrence, start, end, text };
}

/** Non-whitespace characters before `node` (or before `offset` in it) within `p`. */
function offsetIn(p: HTMLElement, node: Node, offset?: number): number {
  const r = document.createRange();
  r.selectNodeContents(p);
  if (offset === undefined) r.setEndBefore(node);
  else r.setEnd(node, offset);
  return squash(r.toString()).length;
}

function rowInfo(root: HTMLElement, node: Node): RowInfo | null {
  const tr = elementOf(node)?.closest('tr');
  if (!tr || !root.contains(tr) || tr.closest('header, footer')) return null;
  const p = Array.from(tr.querySelectorAll('p')).find((x) => squash(x.textContent ?? ''));
  if (!p) return null;
  const text = squash(p.textContent ?? '');
  // The repeat tags sit in the row's own cells, or in an earlier row of a multi-row repeat.
  const group = tr.classList.contains('ta-repeat') ? (tr.getAttribute('data-group') ?? null) : null;
  return { spot: spotIn(root, p, 0, 1, text[0]), group };
}

function chipPick(root: HTMLElement, chip: HTMLElement): Picked {
  const tag = chip.dataset.tag ?? '';
  const p = chip.closest('p');
  if (!p || chip.closest('header, footer')) return { kind: 'none' };
  const row = rowInfo(root, chip);
  if (/^\{[#/]/.test(tag)) return row ? { kind: 'row', row } : { kind: 'none' };
  const start = offsetIn(p, chip);
  return { kind: 'field', key: tag.slice(1, -1), spot: spotIn(root, p, start, start + tag.length, tag), row };
}

function readSelection(root: HTMLElement): Picked | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  // Selecting something else on the page (e.g. typing a name) keeps what was picked.
  if (!root.contains(range.commonAncestorContainer)) return null;

  const chip = elementOf(range.startContainer)?.closest<HTMLElement>('.ta-ph');
  if (range.collapsed) {
    if (chip) return chipPick(root, chip);
    const row = rowInfo(root, range.startContainer);
    return row ? { kind: 'row', row } : { kind: 'none' };
  }
  const p = elementOf(range.startContainer)?.closest('p');
  const inShape = (n: Node) => !!elementOf(n)?.closest('svg');
  if (!p || inShape(range.startContainer) || inShape(range.endContainer)) {
    return { kind: 'error', message: 'That text is in a text box or shape — type a {placeholder} there in Word.' };
  }
  if (p !== elementOf(range.endContainer)?.closest('p')) {
    return { kind: 'error', message: 'Select text within one paragraph or table cell.' };
  }
  if (p.closest('header, footer')) {
    return { kind: 'error', message: 'Headers and footers can’t be changed here — type a {placeholder} there in Word.' };
  }
  const text = range.toString().trim();
  const length = squash(text).length;
  if (!length) return { kind: 'none' };
  const start = offsetIn(p, range.startContainer, range.startOffset);
  const whole = squash(p.textContent ?? '');
  const selected = whole.slice(start, start + length);
  const row = rowInfo(root, p);
  const tag = /^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/.exec(selected);
  if (tag) return { kind: 'field', key: tag[1], spot: spotIn(root, p, start, start + length, selected), row };
  const before = whole.slice(0, start);
  if (/[{}]/.test(selected) || before.lastIndexOf('{') > before.lastIndexOf('}')) {
    return { kind: 'error', message: 'Part of a field is selected — click the field itself instead.' };
  }
  return { kind: 'text', spot: spotIn(root, p, start, start + length, text), row };
}

/** Highlight {placeholders} and repeating rows; drop anything active the file might carry. */
function decorate(root: HTMLElement, labelOf: (key: string) => string) {
  root.querySelectorAll('iframe, script, object, embed').forEach((e) => e.remove());
  root.querySelectorAll('a').forEach((a) => a.removeAttribute('href'));
  root.querySelectorAll('img').forEach((img) => {
    if (!/^(blob|data):/.test(img.getAttribute('src') ?? '')) img.removeAttribute('src');
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const text = node.data;
    const matches = [...text.matchAll(TAG)];
    if (matches.length === 0) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of matches) {
      if (m.index > last) frag.append(text.slice(last, m.index));
      const span = document.createElement('span');
      const loop = m[0][1] === '#' || m[0][1] === '/';
      span.className = loop ? 'ta-ph ta-loop' : 'ta-ph';
      span.dataset.tag = m[0];
      span.textContent = m[0];
      span.title = loop ? 'Repeating row' : labelOf(m[0].slice(1, -1));
      frag.append(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    node.replaceWith(frag);
  }

  // Rows from {#group} to {/group} repeat.
  for (const table of Array.from(root.querySelectorAll('table'))) {
    let group: string | null = null;
    for (const tr of Array.from(table.rows)) {
      const t = tr.textContent ?? '';
      const open = /\{#([a-zA-Z_][a-zA-Z0-9_]*)\}/.exec(t);
      if (open) group = open[1];
      if (group) {
        tr.classList.add('ta-repeat');
        tr.setAttribute('data-group', group);
      }
      if (/\{\/[a-zA-Z_]/.test(t)) group = null;
    }
  }
}

export function WordDocEditor({ templateId, fields, firstLanguageId, version, onEdited }: {
  templateId: string;
  fields: EditorField[];
  firstLanguageId?: string;
  /** Bump to show the file again (after an upload). */
  version: number;
  /** The file changed: re-check it, reload the template. */
  onEdited: () => Promise<void> | void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState<Picked>({ kind: 'none' });
  const [ownVersion, setOwnVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  // What the user's fields replaced, so removing one puts the words back.
  const originals = useRef(new Map<string, string>());

  const labelOf = (key: string) => {
    const f = fields.find((x) => x.fieldKey === key);
    return f?.labels.find((l) => l.languageId === firstLanguageId)?.label || f?.labels[0]?.label || humanize(key);
  };
  const labelRef = useRef(labelOf);
  useEffect(() => { labelRef.current = labelOf; });

  const renderKey = version * 10000 + ownVersion;
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let ignore = false;
    (async () => {
      try {
        const [file, { renderAsync }] = await Promise.all([
          api.blob(`/templates/${templateId}/word-file`),
          import('docx-preview'),
        ]);
        if (ignore) return;
        const keepY = window.scrollY;
        el.style.minHeight = `${el.offsetHeight}px`;
        el.replaceChildren();
        await renderAsync(file, el, undefined, {
          className: 'docx', inWrapper: true, breakPages: false, ignoreLastRenderedPageBreak: true,
          renderChanges: false, renderComments: false, renderAltChunks: false, experimental: false, useBase64URL: false,
        });
        if (ignore) return;
        decorate(el, (k) => labelRef.current(k));
        fitToWidth(el);
        el.style.minHeight = '';
        window.scrollTo({ top: keepY });
        setLoadError('');
        setLoaded(renderKey);
      } catch (err) {
        if (!ignore) setLoadError(err instanceof ApiError ? err.message : 'Couldn’t show the Word file.');
      }
    })();
    return () => { ignore = true; };
  }, [templateId, renderKey]);

  useEffect(() => {
    const el = host.current;
    if (!el?.parentElement) return;
    const observer = new ResizeObserver(() => fitToWidth(el));
    observer.observe(el.parentElement);
    return () => { observer.disconnect(); highlight(null); };
  }, []);

  // Follow the selection inside the document (mouse, touch and keyboard alike).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Wait for the mouse/finger to let go: the panel's name box takes focus, which would end a drag.
    let pointerDown = false;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const el = host.current;
        if (!el || pointerDown) return;
        const next = readSelection(el);
        if (!next) return;
        const sel = window.getSelection();
        highlight(next.kind === 'text' && sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null);
        setPicked(next);
      }, 120);
    };
    const down = () => { pointerDown = true; };
    const up = () => { pointerDown = false; onChange(); };
    document.addEventListener('selectionchange', onChange);
    document.addEventListener('pointerdown', down);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      document.removeEventListener('selectionchange', onChange);
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      clearTimeout(timer);
    };
  }, []);

  const run = async (path: string, body: unknown, done?: () => void) => {
    setBusy(true);
    try {
      await api.post(`/templates/${templateId}/word/${path}`, body);
      done?.();
      window.getSelection()?.removeAllRanges();
      highlight(null);
      setPicked({ kind: 'none' });
      setOwnVersion((v) => v + 1);
      await onEdited();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'That didn’t work — try again.');
      if (err instanceof ApiError && err.status === 409) setOwnVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };

  const makeField = (spot: WordSpot, name: string) => {
    const typed = name.trim();
    const wanted = typed.toLowerCase();
    const existing = fields.find((f) =>
      f.fieldKey.toLowerCase() === wanted || humanize(f.fieldKey).toLowerCase() === wanted ||
      f.labels.some((l) => l.label.trim().toLowerCase() === wanted));
    let key = existing?.fieldKey;
    if (!key) {
      const base = toFieldKey(typed);
      key = base;
      for (let n = 2; fields.some((f) => f.fieldKey === key); n++) key = `${base}_${n}`;
    }
    const fieldKey = key;
    return run('mark', {
      spot, fieldKey,
      ...(existing ? {} : { label: typed, ...(firstLanguageId ? { languageId: firstLanguageId } : {}) }),
    }, () => originals.current.set(fieldKey, spot.text));
  };

  const removeField = (spot: WordSpot, key: string) =>
    run('unmark', { spot, restore: originals.current.get(key) ?? '' });

  const repeatRow = (row: RowInfo, name: string) => run('repeat', { spot: row.spot, groupKey: toFieldKey(name) });
  const stopRepeating = (row: RowInfo) => run('unrepeat', { spot: row.spot });

  const panelKey = picked.kind === 'none' || picked.kind === 'error' ? picked.kind : JSON.stringify(picked);

  return (
    <div>
      {loadError && <p className="text-sm text-danger mb-2">{loadError}</p>}
      {loaded === null && !loadError && <p className="text-sm text-text-secondary py-6 text-center">Opening the document…</p>}
      <div className="word-canvas overflow-x-auto rounded-xl border border-border bg-bg">
        <div ref={host} />
      </div>
      <ActionPanel
        key={panelKey}
        picked={picked}
        busy={busy}
        fields={fields}
        labelOf={labelOf}
        onMake={makeField}
        onRemove={removeField}
        onRepeat={repeatRow}
        onStopRepeating={stopRepeating}
      />
    </div>
  );
}

function ActionPanel({ picked, busy, fields, labelOf, onMake, onRemove, onRepeat, onStopRepeating }: {
  picked: Picked;
  busy: boolean;
  fields: EditorField[];
  labelOf: (key: string) => string;
  onMake: (spot: WordSpot, name: string) => void;
  onRemove: (spot: WordSpot, key: string) => void;
  onRepeat: (row: RowInfo, name: string) => void;
  onStopRepeating: (row: RowInfo) => void;
}) {
  const [name, setName] = useState('');
  const [listName, setListName] = useState('');
  const row = picked.kind === 'text' || picked.kind === 'field' || picked.kind === 'row' ? picked.row : null;

  const submitField = (e: FormEvent) => {
    e.preventDefault();
    if (picked.kind === 'text' && name.trim()) onMake(picked.spot, name);
  };
  const submitRow = (e: FormEvent) => {
    e.preventDefault();
    if (row && listName.trim()) onRepeat(row, listName);
  };

  return (
    <div className="sticky bottom-3 z-10 mt-3 rounded-xl border border-border bg-surface shadow-lg p-3 text-sm" aria-live="polite">
      {picked.kind === 'none' && (
        <p className="text-text-secondary">
          <span className="font-medium text-text">Select the text where a value goes</span> — a name, a date — and make it a field.
          Click inside a table row to make the row repeat (one per child, for example).
        </p>
      )}
      {picked.kind === 'error' && <p className="text-danger">{picked.message}</p>}

      {picked.kind === 'text' && (
        <form onSubmit={submitField} className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary">
            Make <span className="font-semibold text-text">“{picked.spot.text.length > 40 ? `${picked.spot.text.slice(0, 40)}…` : picked.spot.text}”</span> a field called
          </span>
          <Input
            aria-label="Field name"
            className="w-56"
            list="word-field-names"
            placeholder="e.g. Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
          />
          <datalist id="word-field-names">
            {fields.map((f) => <option key={f.fieldKey} value={labelOf(f.fieldKey)} />)}
          </datalist>
          <Button type="submit" variant="primary" size="sm" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Make a field'}</Button>
        </form>
      )}

      {picked.kind === 'field' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-text-secondary">Field: <span className="font-semibold text-text">{labelOf(picked.key)}</span> <code className="text-xs">{`{${picked.key}}`}</code></span>
          <Button size="sm" disabled={busy} onClick={() => onRemove(picked.spot, picked.key)}>Remove this field</Button>
        </div>
      )}

      {row && (
        <div className={`flex flex-wrap items-center gap-2 ${picked.kind === 'row' ? '' : 'mt-3 pt-3 border-t border-border'}`}>
          {row.group ? (
            <>
              <span className="text-text-secondary">This table row repeats once per <span className="font-semibold text-text">{humanize(row.group)}</span> entry.</span>
              <Button size="sm" disabled={busy} onClick={() => onStopRepeating(row)}>Stop repeating</Button>
            </>
          ) : (
            <form onSubmit={submitRow} className="flex flex-wrap items-center gap-2">
              <span className="text-text-secondary">Repeat this table row for each entry of a list called</span>
              <Input aria-label="List name" className="w-44" placeholder="e.g. Children" value={listName} onChange={(e) => setListName(e.target.value)} maxLength={100} />
              <Button type="submit" size="sm" disabled={busy || !listName.trim()}>Repeat row</Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
