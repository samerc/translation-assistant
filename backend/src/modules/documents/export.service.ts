import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  BorderStyle,
  HeadingLevel,
  TabStopType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import { Document } from './entities/document.entity.js';

interface LayoutBlock {
  id: string;
  type:
    'header' | 'text' | 'field' | 'field-row' | 'divider' | 'footer' | 'date';
  content?: string;
  fieldKey?: string;
  fieldKeys?: string[];
  fontSize?: number;
  alignment?: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  bgColor?: string;
  showLabel?: boolean;
  labelText?: string;
  labelBold?: boolean;
  labelPosition?: 'left' | 'top';
  separator?: string;
  valueAlignment?: 'left' | 'center' | 'right';
}

type GroupRow = Record<string, string>;

/** "holder_name" → "Holder name" — last resort when a field has no label. */
function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/** Field label in the job's target language, else any label, else the humanized key. */
export function fieldLabelResolver(doc: Document): (key: string) => string {
  const targetId = doc.job?.targetLanguage?.id;
  const labels = new Map<string, string>();
  for (const f of doc.template.fields ?? []) {
    const own =
      f.labels?.find((l) => l.languageId === targetId)?.label ||
      f.labels?.find((l) => l.label)?.label;
    labels.set(f.fieldKey, own || humanizeKey(f.fieldKey));
  }
  return (key) => labels.get(key) ?? humanizeKey(key);
}

/**
 * Split saved values into fixed fields and repeatable-group rows.
 * Group fields (groupKey set) are stored once per entry (entryIndex 0..n-1);
 * rows come back in entry order, with empty entries dropped.
 */
export function collectFieldValues(doc: Document): {
  fixed: Map<string, string>;
  groups: Map<string, GroupRow[]>;
  groupOf: Map<string, string>;
} {
  const fixed = new Map<string, string>();
  const byEntry = new Map<string, GroupRow[]>();
  const groupOf = new Map<string, string>();
  for (const f of doc.template.fields ?? []) {
    if (f.groupKey) groupOf.set(f.fieldKey, f.groupKey);
  }
  for (const fv of doc.fieldValues) {
    const field = fv.templateField;
    if (!field) continue;
    const group = groupOf.get(field.fieldKey);
    if (group && fv.entryIndex !== null && fv.entryIndex !== undefined) {
      const rows = byEntry.get(group) ?? [];
      (rows[fv.entryIndex] ??= {})[field.fieldKey] = fv.value;
      byEntry.set(group, rows);
    } else {
      fixed.set(field.fieldKey, fv.value);
    }
  }
  const groups = new Map<string, GroupRow[]>();
  for (const [group, rows] of byEntry) groups.set(group, rows.filter(Boolean));
  return { fixed, groups, groupOf };
}

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
  ) {}

  async exportDocument(
    documentId: string,
  ): Promise<{ filePath: string; fileName: string; downloadName: string }> {
    const doc = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: {
        template: {
          fields: {
            labels: {
              language: true,
            },
          },
        },

        fieldValues: {
          templateField: true,
        },

        job: {
          targetLanguage: true,
        },
      },
    });

    if (!doc) throw new NotFoundException('Document not found');

    // What the user's browser saves it as, e.g. "JOB-0001 Birth Certificate.docx"
    const downloadName = `${doc.job.jobNumber} ${doc.template.name}.docx`;
    if (doc.template.type === 'word') {
      return { ...(await this.exportWordTemplate(doc)), downloadName };
    } else if (doc.template.type === 'designer') {
      return { ...(await this.exportDesignerTemplate(doc)), downloadName };
    } else {
      throw new BadRequestException('Simple templates cannot be exported');
    }
  }

  // ── Word Template Export (replace placeholders in .docx) ──

  private async exportWordTemplate(
    doc: Document,
  ): Promise<{ filePath: string; fileName: string }> {
    if (!doc.template.wordFilePath) {
      throw new BadRequestException('No Word file uploaded for this template');
    }

    // Read the template .docx as a zip
    const PizZip = (await import('pizzip')).default;
    const Docxtemplater = (await import('docxtemplater')).default;

    const templateBuffer = readFileSync(doc.template.wordFilePath);
    const zip = new PizZip(templateBuffer);
    const docx = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
      // Any placeholder without a saved value renders as empty instead of throwing.
      nullGetter: () => '',
    });

    // Fixed fields by key; each group as an array of rows for {#group}…{/group}.
    // A group field used outside a loop (templates written before loops were
    // supported) gets the first entry's value.
    const { fixed, groups } = collectFieldValues(doc);
    const data: Record<string, string | GroupRow[]> = Object.fromEntries(fixed);
    for (const [group, rows] of groups) {
      data[group] = rows;
      for (const [key, value] of Object.entries(rows[0] ?? {})) {
        if (!(key in data)) data[key] = value;
      }
    }

    try {
      docx.render(data);
    } catch (err) {
      // docxtemplater throws on malformed/mismatched braces in the template.
      const detail =
        (
          err as {
            properties?: {
              errors?: { properties?: { explanation?: string } }[];
            };
          }
        )?.properties?.errors
          ?.map((e) => e.properties?.explanation)
          .filter(Boolean)
          .join('; ') || (err as Error).message;
      throw new BadRequestException(
        `Failed to generate the document. The Word template has invalid placeholders: ${detail}`,
      );
    }

    const outputBuffer = docx.getZip().generate({ type: 'nodebuffer' });
    const outputDir = join(process.cwd(), 'uploads', 'exports');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const fileName = `${doc.template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${randomUUID().slice(0, 8)}.docx`;
    const filePath = join(outputDir, fileName);
    writeFileSync(filePath, outputBuffer);

    return { filePath, fileName };
  }

  // ── Designer Template Export (generate .docx from layout blocks) ──

  private async exportDesignerTemplate(
    doc: Document,
  ): Promise<{ filePath: string; fileName: string }> {
    const blocks = (doc.template.layoutJson as LayoutBlock[]) || [];
    // Render right-to-left when the job's target language is RTL (e.g. Arabic).
    const isRtl = doc.job?.targetLanguage?.direction === 'rtl';
    const { fixed, groups, groupOf } = collectFieldValues(doc);
    const labelOf = fieldLabelResolver(doc);

    const paragraphs: (Paragraph | Table)[] = [];

    // A field / field-row block that shows repeatable-group fields is rendered
    // once per entry of that group; everything else once, from fixed values.
    const rowsFor = (keys: string[]): (GroupRow | null)[] => {
      const group = keys.map((k) => groupOf.get(k)).find(Boolean);
      const rows = group ? groups.get(group) : undefined;
      return rows?.length ? rows : [null];
    };
    const valueOf = (key: string, row: GroupRow | null) =>
      row?.[key] ?? fixed.get(key) ?? '';

    for (const block of blocks) {
      const alignment = this.getAlignment(block.alignment, isRtl);
      const fontSize = (block.fontSize || 12) * 2; // docx uses half-points
      // docx throws on anything but 6-digit hex — fall back instead of a 500
      const hex = block.color?.replace('#', '') ?? '';
      const color = /^[0-9a-f]{6}$/i.test(hex) ? hex : '000000';

      if (block.type === 'divider') {
        paragraphs.push(
          new Paragraph({
            bidirectional: isRtl,
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
            },
            spacing: { before: 100, after: 100 },
          }),
        );
        continue;
      }

      if (block.type === 'header') {
        paragraphs.push(
          new Paragraph({
            alignment,
            bidirectional: isRtl,
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: block.content || '',
                size: fontSize,
                bold: block.bold !== false,
                italics: block.italic,
                color,
              }),
            ],
          }),
        );
        continue;
      }

      if (
        block.type === 'text' ||
        block.type === 'footer' ||
        block.type === 'date'
      ) {
        let text = block.content || '';
        if (block.type === 'date') {
          text = text.replace('{date}', new Date().toLocaleDateString());
        }
        paragraphs.push(
          new Paragraph({
            alignment,
            bidirectional: isRtl,
            children: [
              new TextRun({
                text,
                size: fontSize,
                bold: block.bold,
                italics: block.italic || block.type === 'footer',
                color,
              }),
            ],
          }),
        );
        continue;
      }

      if (block.type === 'field') {
        for (const row of rowsFor([block.fieldKey || ''])) {
          const value = valueOf(block.fieldKey || '', row);
          const runs: TextRun[] = [];

          if (block.showLabel !== false) {
            const label = block.labelText || labelOf(block.fieldKey || '');
            const sep = block.separator || '';
            runs.push(
              new TextRun({
                text: `${label}${sep}`,
                size: fontSize,
                bold: block.labelBold !== false,
                color,
              }),
            );

            if (block.labelPosition !== 'top') {
              runs.push(new TextRun({ text: '\t', size: fontSize }));
            } else {
              paragraphs.push(
                new Paragraph({
                  alignment,
                  bidirectional: isRtl,
                  children: [...runs],
                }),
              );
              runs.length = 0;
            }
          }

          runs.push(
            new TextRun({
              text: value,
              size: fontSize,
              bold: block.bold,
              italics: block.italic,
              color,
            }),
          );

          paragraphs.push(
            new Paragraph({
              alignment:
                block.showLabel !== false && block.labelPosition !== 'top'
                  ? alignment
                  : this.getAlignment(
                      block.valueAlignment || block.alignment,
                      isRtl,
                    ),
              bidirectional: isRtl,
              tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
              children: runs,
            }),
          );
        }
        continue;
      }

      if (block.type === 'field-row') {
        const keys = block.fieldKeys || [];
        for (const row of rowsFor(keys)) {
          const runs: TextRun[] = [];

          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const value = valueOf(key, row);

            if (block.showLabel !== false) {
              const sep = block.separator || '';
              runs.push(
                new TextRun({
                  text: `${labelOf(key)}${sep} `,
                  size: fontSize,
                  bold: block.labelBold !== false,
                  color,
                }),
              );
            }

            runs.push(
              new TextRun({
                text: value,
                size: fontSize,
                bold: block.bold,
                italics: block.italic,
                color,
              }),
            );

            if (i < keys.length - 1) {
              runs.push(new TextRun({ text: '\t', size: fontSize }));
            }
          }

          paragraphs.push(
            new Paragraph({ alignment, bidirectional: isRtl, children: runs }),
          );
        }
        continue;
      }
    }

    // No layout designed yet: a plain default — title, fixed fields in template
    // order, then one table per repeatable group (a row per entry).
    if (blocks.length === 0) {
      paragraphs.push(
        ...this.defaultLayout(doc, fixed, groups, labelOf, isRtl),
      );
    }

    const docxDoc = new DocxDocument({
      sections: [{ children: paragraphs }],
    });

    const buffer = await Packer.toBuffer(docxDoc);
    const outputDir = join(process.cwd(), 'uploads', 'exports');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const fileName = `${doc.template.name.replace(/[^a-zA-Z0-9]/g, '_')}_${randomUUID().slice(0, 8)}.docx`;
    const filePath = join(outputDir, fileName);
    writeFileSync(filePath, buffer);

    return { filePath, fileName };
  }

  private defaultLayout(
    doc: Document,
    fixed: Map<string, string>,
    groups: Map<string, GroupRow[]>,
    labelOf: (key: string) => string,
    isRtl: boolean,
  ): (Paragraph | Table)[] {
    const out: (Paragraph | Table)[] = [];
    const align = isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
    const fields = [...(doc.template.fields ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const para = (runs: TextRun[], after = 120) =>
      new Paragraph({
        alignment: align,
        bidirectional: isRtl,
        spacing: { after },
        children: runs,
      });

    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        bidirectional: isRtl,
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 240 },
        children: [new TextRun({ text: doc.template.name, bold: true })],
      }),
    );

    for (const f of fields.filter((x) => !x.groupKey)) {
      out.push(
        para([
          new TextRun({ text: `${labelOf(f.fieldKey)}: `, bold: true }),
          new TextRun({ text: fixed.get(f.fieldKey) ?? '' }),
        ]),
      );
    }

    const groupKeys = [
      ...new Set(fields.map((x) => x.groupKey).filter(Boolean)),
    ] as string[];
    for (const group of groupKeys) {
      const cols = fields.filter((x) => x.groupKey === group);
      const rows = groups.get(group) ?? [];
      if (rows.length === 0) continue;
      out.push(
        para(
          [new TextRun({ text: humanizeKey(group), bold: true, size: 26 })],
          80,
        ),
      );
      const cell = (text: string, bold = false) =>
        new TableCell({
          children: [
            new Paragraph({
              alignment: align,
              bidirectional: isRtl,
              children: [new TextRun({ text, bold })],
            }),
          ],
        });
      const ordered = isRtl ? [...cols].reverse() : cols;
      out.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ordered.map((c) => cell(labelOf(c.fieldKey), true)),
            }),
            ...rows.map(
              (row) =>
                new TableRow({
                  children: ordered.map((c) => cell(row[c.fieldKey] ?? '')),
                }),
            ),
          ],
        }),
        para([], 200),
      );
    }
    return out;
  }

  private getAlignment(
    alignment?: string,
    isRtl = false,
  ): (typeof AlignmentType)[keyof typeof AlignmentType] {
    switch (alignment) {
      case 'center':
        return AlignmentType.CENTER;
      case 'right':
        return AlignmentType.RIGHT;
      case 'left':
        return AlignmentType.LEFT;
      // No explicit alignment → follow the script direction (RTL reads right-aligned).
      default:
        return isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
    }
  }
}
