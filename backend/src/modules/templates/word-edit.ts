/**
 * Edits a Word template in place from the setup wizard's on-page document:
 * turn selected text into a {placeholder}, put it back, or make a table row
 * repeat ({#group} … {/group}).
 *
 * The browser renders the .docx and tells us *where* the user selected by
 * text, not by XML position: the paragraph's text, which of the identical
 * paragraphs it is, and the selection's start/end counted in non-whitespace
 * characters. Whitespace is ignored on both sides because the renderer and
 * Word disagree on tabs, line breaks and non-breaking spaces. Only `w:t` text
 * counts (no field codes, deleted text or symbols), and paragraphs in
 * `mc:Fallback` copies of text boxes are skipped — the renderer draws one copy.
 */
import PizZip from 'pizzip';
import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element,
  type Node as XmlNode,
} from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const BODY = 'word/document.xml';

export interface WordSpot {
  /** The whole paragraph's text as shown. */
  paragraphText: string;
  /** 0 = the first paragraph with that (whitespace-free) text, 1 = the second… */
  occurrence: number;
  /** Selection, in non-whitespace characters of the paragraph. */
  start: number;
  end: number;
  /** The selected text (checked, so a stale page can't edit the wrong words). */
  text: string;
}

/** A user-facing problem with the requested edit (→ 400/409). */
export class WordEditError extends Error {
  constructor(
    message: string,
    readonly conflict = false,
  ) {
    super(message);
  }
}

export const squash = (s: string) => s.replace(/\s+/g, '');

const isW = (n: XmlNode | null, name: string): n is Element =>
  !!n &&
  n.nodeType === 1 &&
  (n as Element).localName === name &&
  (n as Element).namespaceURI === W;

function hasAncestor(el: XmlNode, test: (n: XmlNode) => boolean): boolean {
  for (let p = el.parentNode; p; p = p.parentNode) if (test(p)) return true;
  return false;
}

function closestW(el: XmlNode, name: string): Element | null {
  for (let p = el.parentNode; p; p = p.parentNode) if (isW(p, name)) return p;
  return null;
}

function list(doc: XmlDocument | Element, name: string): Element[] {
  return Array.from(doc.getElementsByTagNameNS(W, name));
}

/** Paragraphs as the page shows them (no mc:Fallback duplicates). */
function paragraphs(doc: XmlDocument): Element[] {
  return list(doc, 'p').filter(
    (p) =>
      !hasAncestor(
        p,
        (n) => n.nodeType === 1 && (n as Element).localName === 'Fallback',
      ),
  );
}

/** The paragraph's own `w:t` nodes (not those of paragraphs nested in text boxes). */
function textNodes(p: Element): Element[] {
  return list(p, 't').filter((t) => closestW(t, 'p') === p);
}

const textOf = (p: Element) =>
  textNodes(p)
    .map((t) => t.textContent ?? '')
    .join('');

function setText(t: Element, text: string) {
  while (t.firstChild) t.removeChild(t.firstChild);
  t.appendChild(t.ownerDocument!.createTextNode(text));
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}

/** One entry per non-whitespace character: the w:t it's in and its index there. */
function charMap(p: Element) {
  const map: { node: Element; i: number }[] = [];
  for (const node of textNodes(p)) {
    const s = node.textContent ?? '';
    for (let i = 0; i < s.length; i++)
      if (!/\s/.test(s[i])) map.push({ node, i });
  }
  return map;
}

/** Replace non-whitespace characters [start, end) of a paragraph with `text` (kept in the first run, so it keeps that run's formatting). */
function replaceRange(p: Element, start: number, end: number, text: string) {
  const map = charMap(p);
  const from = map[start];
  const to = map[end - 1];
  const nodes = textNodes(p);
  const a = nodes.indexOf(from.node);
  const b = nodes.indexOf(to.node);
  const first = from.node.textContent ?? '';
  if (a === b) {
    setText(from.node, first.slice(0, from.i) + text + first.slice(to.i + 1));
    return;
  }
  setText(from.node, first.slice(0, from.i) + text);
  for (let k = a + 1; k < b; k++) setText(nodes[k], '');
  setText(to.node, (to.node.textContent ?? '').slice(to.i + 1));
}

function load(buffer: Buffer) {
  const zip = new PizZip(buffer);
  const file = zip.file(BODY);
  if (!file) throw new WordEditError('This file has no document body.');
  const doc = new DOMParser().parseFromString(file.asText(), 'text/xml');
  return { zip, doc };
}

function save(zip: PizZip, doc: XmlDocument): Buffer {
  zip.file(BODY, new XMLSerializer().serializeToString(doc));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function findParagraph(doc: XmlDocument, spot: WordSpot): Element {
  const want = squash(spot.paragraphText);
  const matches = paragraphs(doc).filter((p) => squash(textOf(p)) === want);
  const p = matches[spot.occurrence];
  if (!p) {
    throw new WordEditError(
      'That text couldn’t be found in the Word file — it may be in a header, footer or text box, or the page is out of date. Reload and try again.',
      true,
    );
  }
  return p;
}

/** Checks the selection against the file and returns the paragraph. */
function locate(doc: XmlDocument, spot: WordSpot): Element {
  const p = findParagraph(doc, spot);
  const text = squash(textOf(p));
  const { start, end } = spot;
  if (!(
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= text.length
  )) {
    throw new WordEditError('Select some text first.');
  }
  if (text.slice(start, end) !== squash(spot.text)) {
    throw new WordEditError(
      'The page is out of date — reload and try again.',
      true,
    );
  }
  return p;
}

/** Selected text → {fieldKey}. */
export function markField(
  buffer: Buffer,
  spot: WordSpot,
  fieldKey: string,
): Buffer {
  const { zip, doc } = load(buffer);
  const p = locate(doc, spot);
  const text = squash(textOf(p));
  const selected = text.slice(spot.start, spot.end);
  // Not across or inside an existing {placeholder}.
  const before = text.slice(0, spot.start);
  if (
    /[{}]/.test(selected) ||
    before.lastIndexOf('{') > before.lastIndexOf('}')
  ) {
    throw new WordEditError('That text is already a field. Select plain text.');
  }
  replaceRange(p, spot.start, spot.end, `{${fieldKey}}`);
  return save(zip, doc);
}

/** A {placeholder} (the selection is exactly its tag) → plain text again. */
export function unmarkField(
  buffer: Buffer,
  spot: WordSpot,
  restore: string,
): Buffer {
  const { zip, doc } = load(buffer);
  const p = locate(doc, spot);
  if (!/^\{[a-zA-Z_][a-zA-Z0-9_]*\}$/.test(squash(spot.text))) {
    throw new WordEditError('Pick a field to remove.');
  }
  if (/[{}]/.test(restore))
    throw new WordEditError('The text can’t contain braces.');
  replaceRange(p, spot.start, spot.end, restore);
  return save(zip, doc);
}

function rowOf(doc: XmlDocument, spot: WordSpot): Element {
  const p = findParagraph(doc, spot);
  const row = closestW(p, 'tr');
  if (!row)
    throw new WordEditError('Click inside a table row to make it repeat.');
  return row;
}

const rowText = (row: Element) => list(row, 'p').map(textOf).join('');

/** A run holding `text`, formatted like the paragraph's first run. */
function tagRun(doc: XmlDocument, p: Element, text: string): Element {
  const r = doc.createElementNS(W, 'w:r');
  const firstRun = Array.from(p.childNodes).find((n): n is Element =>
    isW(n, 'r'),
  );
  const rPr =
    firstRun && Array.from(firstRun.childNodes).find((n) => isW(n, 'rPr'));
  if (rPr) r.appendChild(rPr.cloneNode(true));
  const t = doc.createElementNS(W, 'w:t');
  r.appendChild(t);
  setText(t, text);
  return r;
}

/** Make a table row repeat once per entry of `group`: {#group} in its first cell, {/group} in its last. */
export function repeatRow(
  buffer: Buffer,
  spot: WordSpot,
  group: string,
): Buffer {
  const { zip, doc } = load(buffer);
  const row = rowOf(doc, spot);
  if (/\{[#/]/.test(rowText(row)))
    throw new WordEditError('This row already repeats.');
  const cells = Array.from(row.childNodes).filter((n): n is Element =>
    isW(n, 'tc'),
  );
  const firstP = cells.length ? list(cells[0], 'p')[0] : undefined;
  const lastCellPs = cells.length ? list(cells[cells.length - 1], 'p') : [];
  const lastP = lastCellPs[lastCellPs.length - 1];
  if (!firstP || !lastP)
    throw new WordEditError('This row has no cells to repeat.');

  const open = tagRun(doc, firstP, `{#${group}}`);
  const pPr = Array.from(firstP.childNodes).find((n) => isW(n, 'pPr'));
  firstP.insertBefore(open, pPr ? pPr.nextSibling : firstP.firstChild);
  lastP.appendChild(tagRun(doc, lastP, `{/${group}}`));
  return save(zip, doc);
}

/** Stop a row repeating: remove its {#…} and {/…} tags. Returns the group's name too. */
export function unrepeatRow(
  buffer: Buffer,
  spot: WordSpot,
): { buffer: Buffer; group: string | null } {
  const { zip, doc } = load(buffer);
  const row = rowOf(doc, spot);
  let group: string | null = null;
  for (const p of list(row, 'p')) {
    for (;;) {
      const text = squash(textOf(p));
      const m = /\{([#/])([a-zA-Z_][a-zA-Z0-9_]*)\}/.exec(text);
      if (!m) break;
      if (m[1] === '#') group = m[2];
      replaceRange(p, m.index, m.index + m[0].length, '');
    }
  }
  if (!group) throw new WordEditError('This row doesn’t repeat.');
  return { buffer: save(zip, doc), group };
}
