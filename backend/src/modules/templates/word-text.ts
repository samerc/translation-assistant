/**
 * The text of a Word template where placeholders can sit: the body (via
 * mammoth, as the page shows it) plus every header and footer — a footer's
 * {#pages}{seal_number}{/pages} gives one value per page (see word-pages.ts).
 */
import mammoth from 'mammoth';
import PizZip from 'pizzip';

const PARTS = /^word\/(header|footer)\d*\.xml$/;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Joined `w:t` text of each paragraph of the headers and footers. */
export function headerFooterText(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  const out: string[] = [];
  for (const name of Object.keys(zip.files).filter((n) => PARTS.test(n))) {
    const xml = zip.file(name)?.asText() ?? '';
    for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
      const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
        .map((m) => decode(m[1]))
        .join('');
      if (text.trim()) out.push(text);
    }
  }
  return out.join('\n');
}

/** Body + headers + footers, for scanWordPlaceholders(). */
export async function wordTemplateText(buffer: Buffer): Promise<string> {
  const html = await mammoth.convertToHtml({ buffer });
  const body = decode(html.value.replace(/<[^>]*>/g, ''));
  return `${body}\n${headerFooterText(buffer)}`;
}
