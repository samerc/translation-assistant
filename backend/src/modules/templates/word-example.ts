import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const cell = (text: string, bold = false) =>
  new TableCell({
    width: { size: 33, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold })] })],
  });

/**
 * A small, working example Word template for the setup wizard: single values
 * and a table row that repeats (one per child).
 */
export async function buildExampleDocx(): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun('Family Record Extract (example)')],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Full name: ', bold: true }),
              new TextRun('{full_name}'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Date of birth: ', bold: true }),
              new TextRun('{date_of_birth}'),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Place of birth: ', bold: true }),
              new TextRun('{place_of_birth}'),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Children (this table row repeats once per child):',
                bold: true,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  cell('Name', true),
                  cell('Date of birth', true),
                  cell('Relationship', true),
                ],
              }),
              new TableRow({
                children: [
                  cell('{#children}{child_name}'),
                  cell('{child_date_of_birth}'),
                  cell('{child_relationship}{/children}'),
                ],
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Notes: ', bold: true }),
              new TextRun('{notes}'),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
