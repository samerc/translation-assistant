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
import {
  markField,
  repeatRow,
  unmarkField,
  unrepeatRow,
  WordEditError,
} from './word-edit.js';
import { scanWordPlaceholders } from './word-placeholders.js';

const cell = (text: string) =>
  new TableCell({
    children: [new Paragraph({ children: [new TextRun(text)] })],
  });

/** "Name: John Smith" with the name split over two runs (as Word often does), twice; a table with a child row. */
async function sample(): Promise<Buffer> {
  const name = () =>
    new Paragraph({
      children: [
        new TextRun({ text: 'Name: ', bold: true }),
        new TextRun('Jo'),
        new TextRun({ text: 'hn Smith', italics: true }),
      ],
    });
  const doc = new Document({
    sections: [
      {
        children: [
          name(),
          name(),
          new Table({
            rows: [
              new TableRow({ children: [cell('Child'), cell('Born')] }),
              new TableRow({
                children: [cell('Ali Smith'), cell('01/02/2010')],
              }),
            ],
          }),
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

const spot = (paragraphText: string, text: string, occurrence = 0) => {
  const squashed = paragraphText.replace(/\s+/g, '');
  const start = squashed.indexOf(text.replace(/\s+/g, ''));
  return {
    paragraphText,
    occurrence,
    start,
    end: start + text.replace(/\s+/g, '').length,
    text,
  };
};

describe('word-edit', () => {
  it('turns text split over runs into one placeholder, in the right paragraph', async () => {
    const out = markField(
      await sample(),
      spot('Name: John Smith', 'John Smith', 1),
      'full_name',
    );
    const lines = bodyText(out)
      .split('\n')
      .filter((l) => l.startsWith('Name'));
    expect(lines).toEqual(['Name: John Smith', 'Name: {full_name}']);
    expect(scanWordPlaceholders(bodyText(out)).fields).toEqual(['full_name']);
    expect(new PizZip(out).file('word/document.xml')!.asText()).toMatch(
      /^<\?xml[^>]*standalone/,
    );
    // Still a valid Word file docxtemplater can fill.
    const Docxtemplater = (await import('docxtemplater')).default;
    const t = new Docxtemplater(new PizZip(out), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
    });
    t.render({ full_name: 'Rana Test' });
    expect(bodyText(t.getZip().generate({ type: 'nodebuffer' }))).toContain(
      'Name: Rana Test',
    );
  });

  it('refuses stale or overlapping selections', async () => {
    const buf = await sample();
    expect(() =>
      markField(
        buf,
        { ...spot('Name: John Smith', 'John'), text: 'Jane' },
        'x',
      ),
    ).toThrow(WordEditError);
    expect(() =>
      markField(buf, spot('Nothing like this', 'like'), 'x'),
    ).toThrow(/couldn’t be found/);
    const once = markField(
      buf,
      spot('Name: John Smith', 'John Smith'),
      'full_name',
    );
    expect(() =>
      markField(once, spot('Name: {full_name}', 'full'), 'x'),
    ).toThrow(/already a field/);
  });

  it('puts the original text back', async () => {
    const once = markField(
      await sample(),
      spot('Name: John Smith', 'John Smith'),
      'full_name',
    );
    const back = unmarkField(
      once,
      spot('Name: {full_name}', '{full_name}'),
      'John Smith',
    );
    expect(bodyText(back)).not.toContain('{');
    expect(bodyText(back)).toContain('Name: John Smith');
  });

  it('makes a table row repeat, and stops it', async () => {
    let buf = markField(
      await sample(),
      spot('Ali Smith', 'Ali Smith'),
      'child_name',
    );
    buf = repeatRow(buf, spot('{child_name}', '{child_name}'), 'children');
    const scan = scanWordPlaceholders(bodyText(buf));
    expect(scan.malformed).toEqual([]);
    expect(scan.groupOf).toEqual({ child_name: 'children' });
    expect(() =>
      repeatRow(buf, spot('01/02/2010{/children}', '01/02/2010'), 'kids'),
    ).toThrow(/already repeats/);
    expect(() => repeatRow(buf, spot('Name: John Smith', 'John'), 'x')).toThrow(
      /table row/,
    );

    const Docxtemplater = (await import('docxtemplater')).default;
    const t = new Docxtemplater(new PizZip(buf), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
    });
    t.render({ children: [{ child_name: 'One' }, { child_name: 'Two' }] });
    const filled = bodyText(t.getZip().generate({ type: 'nodebuffer' }));
    expect(filled).toContain('One');
    expect(filled).toContain('Two');

    const { buffer, group } = unrepeatRow(
      buf,
      spot('{#children}{child_name}', '{child_name}'),
    );
    expect(group).toBe('children');
    expect(scanWordPlaceholders(bodyText(buffer)).groups).toEqual([]);
  });
});
