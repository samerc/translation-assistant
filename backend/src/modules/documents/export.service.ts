import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
} from 'docx';
import { Document } from './entities/document.entity.js';

interface LayoutBlock {
  id: string;
  type: 'header' | 'text' | 'field' | 'field-row' | 'divider' | 'footer' | 'date';
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

@Injectable()
export class ExportService {
  constructor(
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
  ) {}

  async exportDocument(documentId: string): Promise<{ filePath: string; fileName: string }> {
    const doc = await this.documentRepository.findOne({
      where: { id: documentId },
      relations: [
        'template',
        'template.fields',
        'template.fields.labels',
        'template.fields.labels.language',
        'fieldValues',
        'fieldValues.templateField',
        'job',
        'job.targetLanguage',
      ],
    });

    if (!doc) throw new NotFoundException('Document not found');

    if (doc.template.type === 'word') {
      return this.exportWordTemplate(doc);
    } else if (doc.template.type === 'designer') {
      return this.exportDesignerTemplate(doc);
    } else {
      throw new BadRequestException('Simple templates cannot be exported');
    }
  }

  // ── Word Template Export (replace placeholders in .docx) ──

  private async exportWordTemplate(doc: Document): Promise<{ filePath: string; fileName: string }> {
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

    // Build replacement data from field values
    const data: Record<string, string> = {};
    for (const fv of doc.fieldValues) {
      if (fv.templateField) {
        data[fv.templateField.fieldKey] = fv.value;
      }
    }

    try {
      docx.render(data);
    } catch (err) {
      // docxtemplater throws on malformed/mismatched braces in the template.
      const detail =
        (err as { properties?: { errors?: { properties?: { explanation?: string } }[] } })
          ?.properties?.errors?.map((e) => e.properties?.explanation).filter(Boolean).join('; ') ||
        (err as Error).message;
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

  private async exportDesignerTemplate(doc: Document): Promise<{ filePath: string; fileName: string }> {
    const blocks = (doc.template.layoutJson as LayoutBlock[]) || [];
    // Render right-to-left when the job's target language is RTL (e.g. Arabic).
    const isRtl = doc.job?.targetLanguage?.direction === 'rtl';
    const valueMap = new Map<string, string>();

    for (const fv of doc.fieldValues) {
      if (fv.templateField) {
        valueMap.set(fv.templateField.fieldKey, fv.value);
      }
    }

    const paragraphs: Paragraph[] = [];

    for (const block of blocks) {
      const alignment = this.getAlignment(block.alignment, isRtl);
      const fontSize = (block.fontSize || 12) * 2; // docx uses half-points
      const color = block.color?.replace('#', '') || '000000';

      if (block.type === 'divider') {
        paragraphs.push(new Paragraph({
          bidirectional: isRtl,
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' } },
          spacing: { before: 100, after: 100 },
        }));
        continue;
      }

      if (block.type === 'header') {
        paragraphs.push(new Paragraph({
          alignment,
          bidirectional: isRtl,
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({
            text: block.content || '',
            size: fontSize,
            bold: block.bold !== false,
            italics: block.italic,
            color,
          })],
        }));
        continue;
      }

      if (block.type === 'text' || block.type === 'footer' || block.type === 'date') {
        let text = block.content || '';
        if (block.type === 'date') {
          text = text.replace('{date}', new Date().toLocaleDateString());
        }
        paragraphs.push(new Paragraph({
          alignment,
          bidirectional: isRtl,
          children: [new TextRun({
            text,
            size: fontSize,
            bold: block.bold,
            italics: block.italic || block.type === 'footer',
            color,
          })],
        }));
        continue;
      }

      if (block.type === 'field') {
        const value = valueMap.get(block.fieldKey || '') || '';
        const runs: TextRun[] = [];

        if (block.showLabel !== false) {
          const label = block.labelText || block.fieldKey || '';
          const sep = block.separator || '';
          runs.push(new TextRun({
            text: `${label}${sep}`,
            size: fontSize,
            bold: block.labelBold !== false,
            color,
          }));

          if (block.labelPosition !== 'top') {
            runs.push(new TextRun({ text: '\t', size: fontSize }));
          } else {
            paragraphs.push(new Paragraph({ alignment, bidirectional: isRtl, children: [...runs] }));
            runs.length = 0;
          }
        }

        runs.push(new TextRun({
          text: value,
          size: fontSize,
          bold: block.bold,
          italics: block.italic,
          color,
        }));

        paragraphs.push(new Paragraph({
          alignment: block.showLabel !== false && block.labelPosition !== 'top'
            ? alignment
            : this.getAlignment(block.valueAlignment || block.alignment, isRtl),
          bidirectional: isRtl,
          tabStops: [{ type: 'right' as any, position: 9000 }],
          children: runs,
        }));
        continue;
      }

      if (block.type === 'field-row') {
        const keys = block.fieldKeys || [];
        const runs: TextRun[] = [];

        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const value = valueMap.get(key) || '';

          if (block.showLabel !== false) {
            const sep = block.separator || '';
            runs.push(new TextRun({
              text: `${key}${sep} `,
              size: fontSize,
              bold: block.labelBold !== false,
              color,
            }));
          }

          runs.push(new TextRun({
            text: value,
            size: fontSize,
            bold: block.bold,
            italics: block.italic,
            color,
          }));

          if (i < keys.length - 1) {
            runs.push(new TextRun({ text: '\t', size: fontSize }));
          }
        }

        paragraphs.push(new Paragraph({ alignment, bidirectional: isRtl, children: runs }));
        continue;
      }
    }

    // If no layout blocks, just output all field values
    if (blocks.length === 0) {
      for (const fv of doc.fieldValues) {
        if (fv.templateField) {
          paragraphs.push(new Paragraph({
            alignment: isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
            bidirectional: isRtl,
            children: [
              new TextRun({ text: `${fv.templateField.fieldKey}: `, bold: true, size: 24 }),
              new TextRun({ text: fv.value, size: 24 }),
            ],
          }));
        }
      }
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

  private getAlignment(alignment?: string, isRtl = false): typeof AlignmentType[keyof typeof AlignmentType] {
    switch (alignment) {
      case 'center': return AlignmentType.CENTER;
      case 'right': return AlignmentType.RIGHT;
      case 'left': return AlignmentType.LEFT;
      // No explicit alignment → follow the script direction (RTL reads right-aligned).
      default: return isRtl ? AlignmentType.RIGHT : AlignmentType.LEFT;
    }
  }
}
