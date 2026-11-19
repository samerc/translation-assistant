/**
 * One value per page in headers and footers. A header/footer paragraph with
 * {#pages}…{/pages} (any group name) becomes, at export, a run of Word fields
 *   { IF { PAGE } = 1 "first entry" "" }{ IF { PAGE } = 2 "second entry" "" }…
 * so Word shows each page's own value (e.g. the seal number printed on each
 * page of the original) — whatever the number of pages turns out to be. Pages
 * beyond the last entry show nothing. Inside the loop, {field} is the entry's
 * value and {no} its number.
 *
 * Runs before docxtemplater, which then never sees these loops.
 */
import type PizZip from 'pizzip';
import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element,
} from '@xmldom/xmldom';
import { ROW_NUMBER } from './word-placeholders.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PARTS = /^word\/(header|footer)\d*\.xml$/;
const LOOP = /\{#([a-zA-Z_][a-zA-Z0-9_]*)\}([\s\S]*?)\{\/\1\}/;

type Row = Record<string, string>;

const els = (root: XmlDocument | Element, name: string): Element[] =>
  Array.from(root.getElementsByTagNameNS(W, name));

function textNodes(p: Element): Element[] {
  return els(p, 't').filter((t) => {
    for (let n = t.parentNode; n; n = n.parentNode)
      if (n === p) return true;
      else if ((n as Element).localName === 'p') return false;
    return false;
  });
}

function setText(t: Element, text: string) {
  while (t.firstChild) t.removeChild(t.firstChild);
  t.appendChild(t.ownerDocument!.createTextNode(text));
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}

/** Field quotes can't hold a straight double quote. */
const quoteSafe = (s: string) => s.replace(/"/g, '”').replace(/\r?\n/g, ' ');

function fill(inner: string, row: Row, i: number) {
  return inner.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_, key: string) =>
    key === ROW_NUMBER ? String(i + 1) : (row[key] ?? ''),
  );
}

/** The runs of `{ IF { PAGE } = n "value" "" }` for every entry. */
function pageFieldRuns(
  doc: XmlDocument,
  rPr: Element | null,
  values: string[],
): Element[] {
  const run = (child: (r: Element) => void) => {
    const r = doc.createElementNS(W, 'w:r');
    if (rPr) r.appendChild(rPr.cloneNode(true));
    child(r);
    return r;
  };
  const fldChar = (type: string) =>
    run((r) => {
      const c = doc.createElementNS(W, 'w:fldChar');
      c.setAttributeNS(W, 'w:fldCharType', type);
      r.appendChild(c);
    });
  const instr = (text: string) =>
    run((r) => {
      const t = doc.createElementNS(W, 'w:instrText');
      t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      t.appendChild(doc.createTextNode(text));
      r.appendChild(t);
    });
  const shown = (text: string) =>
    run((r) => {
      const t = doc.createElementNS(W, 'w:t');
      r.appendChild(t);
      setText(t, text);
    });

  return values.flatMap((value, i) => [
    fldChar('begin'),
    instr(' IF '),
    fldChar('begin'),
    instr(' PAGE '),
    fldChar('separate'),
    shown('1'),
    fldChar('end'),
    instr(` = ${i + 1} "${quoteSafe(value)}" "" `),
    fldChar('separate'),
    // What shows before Word recalculates: page 1's value.
    shown(i === 0 ? value : ''),
    fldChar('end'),
  ]);
}

/** Replace one paragraph's {#group}…{/group}; true if it had one. */
function expandParagraph(
  doc: XmlDocument,
  p: Element,
  groups: Map<string, Row[]>,
): boolean {
  const nodes = textNodes(p);
  const full = nodes.map((t) => t.textContent ?? '').join('');
  const m = LOOP.exec(full);
  if (!m) return false;
  const rows = groups.get(m[1]) ?? [];
  const values = rows.map((row, i) => fill(m[2], row, i));

  // Character position → (node, offset).
  const at = (pos: number) => {
    let acc = 0;
    for (const node of nodes) {
      const len = (node.textContent ?? '').length;
      if (pos < acc + len || node === nodes[nodes.length - 1])
        return { node, i: pos - acc };
      acc += len;
    }
    return { node: nodes[0], i: 0 };
  };
  const start = at(m.index);
  const end = at(m.index + m[0].length - 1);
  const startRun = start.node.parentNode as Element;
  const rPr =
    (Array.from(startRun.childNodes).find(
      (n) => (n as Element).localName === 'rPr',
    ) as Element | undefined) ?? null;
  const before = (start.node.textContent ?? '').slice(0, start.i);
  const after = (end.node.textContent ?? '').slice(end.i + 1);

  // Clear the loop's text; keep what was before it in the first run, after it in a copy.
  const a = nodes.indexOf(start.node);
  const b = nodes.indexOf(end.node);
  for (let k = a; k <= b; k++) setText(nodes[k], '');
  setText(start.node, before);
  const fields = pageFieldRuns(doc, rPr, values);
  let anchor: Element = startRun;
  for (const r of fields) {
    startRun.parentNode!.insertBefore(r, anchor.nextSibling);
    anchor = r;
  }
  if (after) {
    if (a === b) {
      const tail = startRun.cloneNode(true) as Element;
      for (const t of els(tail, 't')) setText(t, '');
      setText(els(tail, 't')[0], after);
      startRun.parentNode!.insertBefore(tail, anchor.nextSibling);
    } else {
      setText(end.node, after);
    }
  }
  return true;
}

/** Expand every per-page loop in the document's headers and footers. */
export function expandPerPageValues(
  zip: PizZip,
  groups: Map<string, Row[]>,
): void {
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = file.asText();
    if (!xml.includes('{#')) continue;
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    let changed = false;
    for (const p of els(doc, 'p')) {
      // A paragraph can hold more than one loop.
      while (expandParagraph(doc, p, groups)) changed = true;
    }
    if (changed) zip.file(name, new XMLSerializer().serializeToString(doc));
  }
}
