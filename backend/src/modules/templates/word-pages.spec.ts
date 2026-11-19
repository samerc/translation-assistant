import PizZip from 'pizzip';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { PAGES_KEY, wrapInPages } from './word-pages.js';
import { scanWordPlaceholders } from './word-placeholders.js';

const cell = (text: string) =>
  new TableCell({
    children: [new Paragraph({ children: [new TextRun(text)] })],
  });

/** One page of a family extract: a heading value, the members, a last-page signature. */
async function onePage(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph('Caza {caza}'),
          new Table({
            rows: [
              new TableRow({ children: [cell('No.'), cell('Name')] }),
              new TableRow({
                children: [cell('{#members}{no}'), cell('{name}{/members}')],
              }),
            ],
          }),
          new Paragraph('Seal {seal_number}'),
          new Paragraph('{#last}'),
          new Paragraph('Signed {signatory}'),
          new Paragraph('{/last}'),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const bodyText = (buf: Buffer) =>
  new PizZip(buf)
    .file('word/document.xml')!
    .asText()
    .replace(/<w:p[ >]/g, '\n$&')
    .replace(/<[^>]+>/g, '');

describe('pages', () => {
  it('{#last}/{#first} are sections, not lists; fields inside stay single values', () => {
    const scan = scanWordPlaceholders(
      '{caza} {#members}{no}{name}{/members} {#last}{signatory}{/last}',
    );
    expect(scan.malformed).toEqual([]);
    expect(scan.groups).toEqual(['members']);
    expect(scan.groupOf).toEqual({ name: 'members' });
    expect(scan.fields).toContain('signatory');
    expect(
      scanWordPlaceholders('{#members}{#last}{/last}{/members}').malformed[0]
        ?.reason,
    ).toMatch(/repeating row/);
    expect(scanWordPlaceholders('{#last} x').malformed[0]?.reason).toMatch(
      /Never closed/,
    );
  });

  it('renders the page once per page: own members, numbers continue, last-page part once, page 1 values fill in', async () => {
    const zip = new PizZip(await onePage());
    wrapInPages(zip);
    const Docxtemplater = (await import('docxtemplater')).default;
    const t = new Docxtemplater(zip, {
      paragraphLoop: true,
      delimiters: { start: '{', end: '}' },
      nullGetter: () => '',
    });
    const page1 = {
      caza: 'Chouf',
      seal_number: '004106283',
      signatory: 'Rajeh NASR',
      members: [
        { no: '1', name: 'Bechara' },
        { no: '2', name: 'Gladys' },
      ],
      first: true,
      last: false,
    };
    // Page 2 has its own seal and members, no caza (→ page 1's).
    const page2 = {
      seal_number: '004106282',
      members: [{ no: '3', name: 'Jessica' }],
      first: false,
      last: true,
    };
    t.render({ ...page1, [PAGES_KEY]: [page1, page2] });
    const out = t.getZip().generate({ type: 'nodebuffer' });
    const text = bodyText(out);
    const xml = new PizZip(out).file('word/document.xml')!.asText();

    expect(text).not.toMatch(/[{}]/);
    expect(text.match(/Caza Chouf/g)).toHaveLength(2);
    expect(text).toMatch(/1\s*Bechara[\s\S]*2\s*Gladys[\s\S]*Seal 004106283/);
    expect(text).toMatch(
      /Seal 004106283[\s\S]*3\s*Jessica[\s\S]*Seal 004106282/,
    );
    expect(text.match(/Signed Rajeh NASR/g)).toHaveLength(1);
    expect(text.indexOf('Signed')).toBeGreaterThan(text.indexOf('004106282'));
    // One new page (before page 2), none before page 1.
    expect(xml.match(/<w:pageBreakBefore\/>/g)).toHaveLength(1);
  });
});
