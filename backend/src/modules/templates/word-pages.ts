/**
 * Documents with several pages. A translated document has one page per page of
 * the original (a two-page family extract → two pages, the same members on
 * each), so the Word template describes ONE page and a document's values carry
 * a page number. At export the body is wrapped in a loop over the pages:
 *
 *   {#__pages}
 *   {^first} [new page] {/first}     ← every page but the first starts a new page
 *   … the template's body …
 *   {/__pages}
 *
 * docxtemplater then renders the body once per page with that page's values;
 * inside, {#first}/{#last} sections show only on the first / last page, and
 * values a page doesn't have come from page 1 (docxtemplater looks them up in
 * the outer scope).
 */
import type PizZip from 'pizzip';
import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element,
} from '@xmldom/xmldom';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const BODY = 'word/document.xml';

/** The data key of the page loop (never written in templates). */
export const PAGES_KEY = '__pages';

function para(doc: XmlDocument, text: string | null, pageBreak = false) {
  const p = doc.createElementNS(W, 'w:p');
  if (pageBreak) {
    // Starts a new page and takes (almost) no room: a 1pt empty line.
    const pPr = doc.createElementNS(W, 'w:pPr');
    pPr.appendChild(doc.createElementNS(W, 'w:pageBreakBefore'));
    const spacing = doc.createElementNS(W, 'w:spacing');
    spacing.setAttributeNS(W, 'w:before', '0');
    spacing.setAttributeNS(W, 'w:after', '0');
    spacing.setAttributeNS(W, 'w:line', '20');
    spacing.setAttributeNS(W, 'w:lineRule', 'exact');
    pPr.appendChild(spacing);
    const rPr = doc.createElementNS(W, 'w:rPr');
    const sz = doc.createElementNS(W, 'w:sz');
    sz.setAttributeNS(W, 'w:val', '2');
    rPr.appendChild(sz);
    pPr.appendChild(rPr);
    p.appendChild(pPr);
  }
  if (text !== null) {
    const r = doc.createElementNS(W, 'w:r');
    const t = doc.createElementNS(W, 'w:t');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.appendChild(doc.createTextNode(text));
    r.appendChild(t);
    p.appendChild(r);
  }
  return p;
}

/** Wrap the document body in the page loop (see above). */
export function wrapInPages(zip: PizZip): void {
  const file = zip.file(BODY);
  if (!file) return;
  const doc = new DOMParser().parseFromString(file.asText(), 'text/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) return;
  const children = Array.from(body.childNodes).filter(
    (n): n is Element => n.nodeType === 1,
  );
  const sectPr = children.find((n) => n.localName === 'sectPr') ?? null;
  const first = children.find((n) => n.localName !== 'sectPr') ?? sectPr;

  for (const p of [
    para(doc, `{#${PAGES_KEY}}`),
    para(doc, '{^first}'),
    para(doc, null, true),
    para(doc, '{/first}'),
  ])
    body.insertBefore(p, first);
  body.insertBefore(para(doc, `{/${PAGES_KEY}}`), sectPr);
  zip.file(BODY, new XMLSerializer().serializeToString(doc));
}
