import PizZip from 'pizzip';
import { Document, Footer, Packer, Paragraph, TextRun } from 'docx';
import { expandPerPageValues } from './word-pages.js';
import { headerFooterText } from './word-text.js';
import { scanWordPlaceholders } from './word-placeholders.js';

async function withFooter(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Seal ', italics: true }),
                  new TextRun('{#pages}{seal_number}{/pages}'),
                  new TextRun(' - end'),
                ],
              }),
            ],
          }),
        },
        children: [new Paragraph('Body {name}')],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const footerXml = (zip: PizZip) =>
  Object.keys(zip.files)
    .filter((n) => /^word\/footer\d*\.xml$/.test(n))
    .map((n) => zip.file(n)!.asText())
    .join('');

describe('per-page values in footers', () => {
  it('are found by the scan as a group', async () => {
    const buf = await withFooter();
    const scan = scanWordPlaceholders(headerFooterText(buf));
    expect(scan.groupOf).toEqual({ seal_number: 'pages' });
    expect(scan.malformed).toEqual([]);
  });

  it('become one IF { PAGE } field per entry, keeping the text around them', async () => {
    const zip = new PizZip(await withFooter());
    expandPerPageValues(
      zip,
      new Map([
        [
          'pages',
          [
            { seal_number: '004106283' },
            { seal_number: '004106282' },
            { seal_number: 'with "quotes"' },
          ],
        ],
      ]),
    );
    const xml = footerXml(zip);
    expect(xml).not.toContain('{#pages}');
    const instr = [...xml.matchAll(/<w:instrText[^>]*>([^<]*)</g)].map(
      (m) => m[1],
    );
    expect(instr.filter((t) => t.trim() === 'IF')).toHaveLength(3);
    expect(instr).toContain(' = 1 "004106283" "" ');
    expect(instr).toContain(' = 2 "004106282" "" ');
    expect(instr).toContain(' = 3 "with ”quotes”" "" ');
    const shown = [...xml.matchAll(/<w:t[^>]*>([^<]*)</g)].map((m) => m[1]);
    expect(shown.join('')).toContain('Seal ');
    expect(shown.join('')).toContain(' - end');

    // docxtemplater has nothing left to trip over.
    const Docxtemplater = (await import('docxtemplater')).default;
    const t = new Docxtemplater(zip, {
      paragraphLoop: true,
      delimiters: { start: '{', end: '}' },
    });
    expect(() => t.render({ name: 'x' })).not.toThrow();
  });

  it('no entries → the loop just disappears', async () => {
    const zip = new PizZip(await withFooter());
    expandPerPageValues(zip, new Map());
    expect(footerXml(zip)).not.toMatch(/[{}]/);
  });
});
