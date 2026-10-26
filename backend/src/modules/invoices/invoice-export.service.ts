import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  VerticalAlign,
  ImageRun,
} from 'docx';
import PDFDocument from 'pdfkit';
import { Invoice } from './entities/invoice.entity.js';
import { PdfText, TextAlign, TextStyle } from './pdf-text.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';
import { User } from '../users/entities/user.entity.js';

interface InvoiceBranding {
  businessName: string;
  businessAddress: string;
  logo: { buffer: Buffer; docxType: 'png' | 'jpg' } | null;
}

@Injectable()
export class InvoiceExportService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // ── Per-user invoice branding (name/address/logo of the invoice's creator) ──

  private async getBranding(invoice: Invoice): Promise<InvoiceBranding> {
    const creator = invoice.createdByUserId
      ? await this.userRepository.findOne({
          where: { id: invoice.createdByUserId },
        })
      : null;
    return {
      businessName: creator?.businessName?.trim() || '',
      businessAddress: creator?.businessAddress?.trim() || '',
      logo: this.parseLogo(creator?.logo),
    };
  }

  private parseLogo(dataUrl?: string | null): InvoiceBranding['logo'] {
    if (!dataUrl) return null;
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl);
    if (!m) return null;
    return {
      buffer: Buffer.from(m[2], 'base64'),
      docxType: m[1].toLowerCase() === 'png' ? 'png' : 'jpg',
    };
  }

  /** Read intrinsic pixel dimensions from a PNG/JPEG buffer (no external dep). */
  private imageSize(
    buffer: Buffer,
    isPng: boolean,
  ): { width: number; height: number } | null {
    try {
      if (isPng) {
        if (buffer.length < 24) return null;
        return {
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20),
        };
      }
      // JPEG: walk segment markers to the Start-Of-Frame that carries the size.
      let off = 2;
      while (off + 9 < buffer.length) {
        if (buffer[off] !== 0xff) {
          off++;
          continue;
        }
        const marker = buffer[off + 1];
        if (
          marker >= 0xc0 &&
          marker <= 0xcf &&
          ![0xc4, 0xc8, 0xcc].includes(marker)
        ) {
          return {
            height: buffer.readUInt16BE(off + 5),
            width: buffer.readUInt16BE(off + 7),
          };
        }
        off += 2 + buffer.readUInt16BE(off + 2);
      }
      return null;
    } catch {
      return null;
    }
  }

  /** Scale intrinsic dimensions into a bounding box, preserving aspect ratio. */
  private fitBox(w: number, h: number, maxW: number, maxH: number) {
    const ratio = Math.min(maxW / w, maxH / h, 1);
    return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
  }

  private async getInvoice(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: {
        client: {
          emails: true,
          addresses: true,
        },

        items: {
          job: true,
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    invoice.items.sort((a, b) => a.sortOrder - b.sortOrder);
    return invoice;
  }

  // issueDate/dueDate are date-only strings ("2026-10-26"). new Date() reads
  // them as UTC midnight, so format in UTC — the server's own time zone would
  // shift the printed day.
  private formatDate(value: string | Date): string {
    return new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' });
  }

  private async getSettings(): Promise<AppSettings | null> {
    const settings = await this.settingsRepository.find();
    return settings[0] || null;
  }

  private ensureExportDir(): string {
    const dir = join(process.cwd(), 'exports', 'invoices');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ── Word Export ──

  async exportWord(
    id: string,
  ): Promise<{ filePath: string; fileName: string }> {
    const invoice = await this.getInvoice(id);
    const branding = await this.getBranding(invoice);

    // Header block may contain a table (logo beside name) alongside paragraphs.
    const header: (Paragraph | Table)[] = [];
    const children: Paragraph[] = [];

    // Business name + address paragraphs (shown as text when there's no logo,
    // or in the right-hand cell of the logo table when there is).
    const nameParas: Paragraph[] = [];
    if (branding.businessName) {
      nameParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: branding.businessName,
              bold: true,
              size: 32,
              font: 'Arial',
            }),
          ],
          spacing: { after: branding.businessAddress ? 40 : 100 },
        }),
      );
    }
    if (branding.businessAddress) {
      nameParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: branding.businessAddress,
              size: 18,
              color: '666666',
              font: 'Arial',
            }),
          ],
          spacing: { after: 100 },
        }),
      );
    }

    if (branding.logo) {
      const dims = this.imageSize(
        branding.logo.buffer,
        branding.logo.docxType === 'png',
      );
      const box = dims
        ? this.fitBox(dims.width, dims.height, 130, 52)
        : { width: 104, height: 52 };
      const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
      const cellBorders = {
        top: noBorder,
        bottom: noBorder,
        left: noBorder,
        right: noBorder,
      };
      header.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: noBorder,
            bottom: noBorder,
            left: noBorder,
            right: noBorder,
            insideHorizontal: noBorder,
            insideVertical: noBorder,
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  borders: cellBorders,
                  verticalAlign: VerticalAlign.CENTER,
                  width: { size: 25, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      children: [
                        new ImageRun({
                          type: branding.logo.docxType,
                          data: branding.logo.buffer,
                          transformation: {
                            width: box.width,
                            height: box.height,
                          },
                        }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  borders: cellBorders,
                  verticalAlign: VerticalAlign.CENTER,
                  width: { size: 75, type: WidthType.PERCENTAGE },
                  children: nameParas.length ? nameParas : [new Paragraph({})],
                }),
              ],
            }),
          ],
        }),
      );
      header.push(new Paragraph({ spacing: { after: 100 } }));
    } else {
      header.push(...nameParas);
    }

    // Invoice title
    header.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'INVOICE', bold: true, size: 40, font: 'Arial' }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
      }),
    );

    // Invoice details
    const detailLines = [
      `Invoice Number: ${invoice.invoiceNumber}`,
      `Issue Date: ${this.formatDate(invoice.issueDate)}`,
      `Due Date: ${this.formatDate(invoice.dueDate)}`,
      `Status: ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}`,
    ];

    for (const line of detailLines) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line, size: 20, font: 'Arial' })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 40 },
        }),
      );
    }

    children.push(new Paragraph({ spacing: { after: 200 } }));

    // Bill To
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Bill To:',
            bold: true,
            size: 22,
            font: 'Arial',
          }),
        ],
        spacing: { after: 80 },
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: invoice.client.name, size: 22, font: 'Arial' }),
        ],
        spacing: { after: 40 },
      }),
    );
    if (invoice.client.taxId) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Tax ID: ${invoice.client.taxId}`,
              size: 18,
              color: '666666',
              font: 'Arial',
            }),
          ],
          spacing: { after: 40 },
        }),
      );
    }
    const billingAddress =
      invoice.client.addresses?.find((a) => a.label === 'Billing') ||
      invoice.client.addresses?.[0];
    if (billingAddress) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: billingAddress.address,
              size: 18,
              color: '666666',
              font: 'Arial',
            }),
          ],
          spacing: { after: 40 },
        }),
      );
    }
    const primaryEmail =
      invoice.client.emails?.find((e) => e.isPrimary) ||
      invoice.client.emails?.[0];
    if (primaryEmail) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: primaryEmail.email,
              size: 18,
              color: '666666',
              font: 'Arial',
            }),
          ],
          spacing: { after: 40 },
        }),
      );
    }

    children.push(new Paragraph({ spacing: { after: 300 } }));

    // Line items table
    const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
    const borders = {
      top: borderStyle,
      bottom: borderStyle,
      left: borderStyle,
      right: borderStyle,
    };

    const headerRow = new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Description',
                  bold: true,
                  size: 18,
                  font: 'Arial',
                }),
              ],
              spacing: { before: 60, after: 60 },
            }),
          ],
          borders,
          width: { size: 45, type: WidthType.PERCENTAGE },
          shading: { fill: 'F3F4F6' },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Qty',
                  bold: true,
                  size: 18,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
            }),
          ],
          borders,
          width: { size: 10, type: WidthType.PERCENTAGE },
          shading: { fill: 'F3F4F6' },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Unit Price',
                  bold: true,
                  size: 18,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 60, after: 60 },
            }),
          ],
          borders,
          width: { size: 20, type: WidthType.PERCENTAGE },
          shading: { fill: 'F3F4F6' },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Total',
                  bold: true,
                  size: 18,
                  font: 'Arial',
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 60, after: 60 },
            }),
          ],
          borders,
          width: { size: 25, type: WidthType.PERCENTAGE },
          shading: { fill: 'F3F4F6' },
        }),
      ],
    });

    const itemRows = invoice.items.map(
      (item) =>
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: item.description,
                      size: 18,
                      font: 'Arial',
                    }),
                  ],
                  spacing: { before: 60, after: 60 },
                }),
              ],
              borders,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: String(Number(item.quantity)),
                      size: 18,
                      font: 'Arial',
                    }),
                  ],
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 60, after: 60 },
                }),
              ],
              borders,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${invoice.currency} ${Number(item.unitPrice).toFixed(2)}`,
                      size: 18,
                      font: 'Arial',
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60, after: 60 },
                }),
              ],
              borders,
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `${invoice.currency} ${Number(item.lineTotal).toFixed(2)}`,
                      size: 18,
                      font: 'Arial',
                    }),
                  ],
                  alignment: AlignmentType.RIGHT,
                  spacing: { before: 60, after: 60 },
                }),
              ],
              borders,
            }),
          ],
        }),
    );

    const table = new Table({
      rows: [headerRow, ...itemRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    });

    children.push(new Paragraph({ spacing: { after: 100 } }));

    // Totals
    const totalsChildren: Paragraph[] = [];
    totalsChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Subtotal: ${invoice.currency} ${Number(invoice.subtotal).toFixed(2)}`,
            size: 20,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 60 },
      }),
    );
    if (Number(invoice.taxRate) > 0) {
      totalsChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Tax (${invoice.taxRate}%): ${invoice.currency} ${Number(invoice.taxAmount).toFixed(2)}`,
              size: 20,
              font: 'Arial',
            }),
          ],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
        }),
      );
    }
    totalsChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Total: ${invoice.currency} ${Number(invoice.total).toFixed(2)}`,
            bold: true,
            size: 24,
            font: 'Arial',
          }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { before: 100, after: 100 },
      }),
    );

    if (invoice.paidAmount !== null) {
      totalsChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Paid: ${invoice.currency} ${Number(invoice.paidAmount).toFixed(2)}`,
              size: 20,
              color: '16A34A',
              font: 'Arial',
            }),
          ],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60 },
        }),
      );
    }

    // Notes
    const notesChildren: Paragraph[] = [];
    if (invoice.notes) {
      notesChildren.push(new Paragraph({ spacing: { after: 200 } }));
      notesChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Notes:',
              bold: true,
              size: 20,
              font: 'Arial',
            }),
          ],
          spacing: { after: 80 },
        }),
      );
      notesChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: invoice.notes,
              size: 18,
              color: '666666',
              font: 'Arial',
            }),
          ],
        }),
      );
    }

    const doc = new DocxDocument({
      sections: [
        {
          children: [
            ...header,
            ...children,
            table,
            ...totalsChildren,
            ...notesChildren,
          ],
        },
      ],
    });

    const dir = this.ensureExportDir();
    const fileName = `${invoice.invoiceNumber}.docx`;
    const filePath = join(dir, `${randomUUID()}.docx`);
    const buffer = await Packer.toBuffer(doc);
    writeFileSync(filePath, buffer);

    return { filePath, fileName };
  }

  // ── PDF Export ──

  async exportPdf(id: string): Promise<{ filePath: string; fileName: string }> {
    const invoice = await this.getInvoice(id);
    const branding = await this.getBranding(invoice);

    const dir = this.ensureExportDir();
    const fileName = `${invoice.invoiceNumber}.pdf`;
    const filePath = join(dir, `${randomUUID()}.pdf`);

    return new Promise((resolve, reject) => {
      // bufferPages: page numbers are written once the page count is known.
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        try {
          writeFileSync(filePath, Buffer.concat(chunks));
          resolve({ filePath, fileName });
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      });
      doc.on('error', reject);

      try {
        this.drawPdf(doc, invoice, branding);
        doc.end();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private drawPdf(
    doc: PDFKit.PDFDocument,
    invoice: Invoice,
    branding: InvoiceBranding,
  ): void {
    const t = new PdfText(doc);
    const left = 50;
    const pageWidth = doc.page.width - 100; // margins
    const top = 50;
    const bottom = doc.page.height - 60; // room for the page-number footer
    const money = (n: unknown) => `${invoice.currency} ${Number(n).toFixed(2)}`;
    const muted = '#666666';

    // Company header — per-user branding, logo beside the business name.
    let textX = left;
    if (branding.logo) {
      try {
        doc.image(branding.logo.buffer, left, 45, { fit: [110, 46] });
        textX = left + 110 + 14;
      } catch {
        textX = left; // corrupt image → fall back to text-only header
      }
    }
    let headerY = top;
    if (branding.businessName) {
      headerY = t.draw(
        branding.businessName,
        textX,
        headerY,
        260,
        {
          size: 16,
          bold: true,
          color: '#000000',
        },
        'left',
      );
    }
    if (branding.businessAddress) {
      headerY = t.draw(
        branding.businessAddress,
        textX,
        headerY + 2,
        240,
        {
          size: 9,
          color: muted,
        },
        'left',
      );
    }

    // INVOICE title + details (right side)
    t.drawLine(
      'INVOICE',
      left,
      top,
      pageWidth,
      { size: 28, bold: true, color: '#000000' },
      'end',
    );
    let detailsY = 90;
    for (const line of [
      `Invoice #: ${invoice.invoiceNumber}`,
      `Issue Date: ${this.formatDate(invoice.issueDate)}`,
      `Due Date: ${this.formatDate(invoice.dueDate)}`,
      `Status: ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}`,
    ]) {
      t.drawLine(
        line,
        left,
        detailsY,
        pageWidth,
        { size: 9, color: '#333333' },
        'end',
      );
      detailsY += 13;
    }

    // Bill To
    let y = Math.max(160, headerY + 16, detailsY + 16);
    y =
      t.draw(
        'Bill To:',
        left,
        y,
        300,
        {
          size: 10,
          bold: true,
          color: '#000000',
        },
        'left',
      ) + 2;
    y = t.draw(
      invoice.client.name,
      left,
      y,
      300,
      { size: 11, bold: true },
      'left',
    );
    const small = { size: 9, color: muted };
    if (invoice.client.taxId)
      y = t.draw(
        `Tax ID: ${invoice.client.taxId}`,
        left,
        y,
        300,
        small,
        'left',
      );
    const billingAddr =
      invoice.client.addresses?.find((a) => a.label === 'Billing') ||
      invoice.client.addresses?.[0];
    if (billingAddr)
      y = t.draw(billingAddr.address, left, y, 300, small, 'left');
    const email =
      invoice.client.emails?.find((e) => e.isPrimary) ||
      invoice.client.emails?.[0];
    if (email) y = t.draw(email.email, left, y, 300, small, 'left');

    // Line items table
    y += 24;
    const colWidths = [
      pageWidth * 0.45,
      pageWidth * 0.1,
      pageWidth * 0.2,
      pageWidth * 0.25,
    ];
    const colX = [
      left,
      left + colWidths[0],
      left + colWidths[0] + colWidths[1],
      left + colWidths[0] + colWidths[1] + colWidths[2],
    ];
    const cellPad = 6;
    const headStyle = { size: 8, bold: true, color: '#374151' };
    const cellStyle = { size: 9, color: '#333333' };

    const rule = (atY: number, color = '#E5E7EB', width = 0.5) => {
      doc
        .moveTo(left, atY)
        .lineTo(left + pageWidth, atY)
        .strokeColor(color)
        .lineWidth(width)
        .stroke();
    };
    const tableHeader = () => {
      doc.rect(left, y, pageWidth, 22).fill('#F3F4F6');
      const cells: [string, number, TextAlign][] = [
        ['Description', 0, 'start'],
        ['Qty', 1, 'center'],
        ['Unit Price', 2, 'end'],
        ['Total', 3, 'end'],
      ];
      for (const [label, c, align] of cells) {
        t.drawLine(
          label,
          colX[c] + cellPad,
          y + 6,
          colWidths[c] - 2 * cellPad,
          headStyle,
          align,
        );
      }
      y += 22;
    };
    // New page when `h` more points won't fit; repeats the table header if asked.
    const ensure = (h: number, repeatHeader = false) => {
      if (y + h <= bottom) return;
      doc.addPage();
      y = top;
      if (repeatHeader) tableHeader();
    };

    tableHeader();
    const lineH = t.lineHeight(cellStyle);
    for (const item of invoice.items) {
      const descLines = t.lines(
        item.description,
        colWidths[0] - 2 * cellPad,
        cellStyle,
      );
      const rowH = Math.max(descLines.length * lineH, lineH) + 2 * cellPad;
      ensure(rowH, true);
      rule(y);
      descLines.forEach((line, i) =>
        t.drawLine(
          line,
          colX[0] + cellPad,
          y + cellPad + i * lineH,
          colWidths[0] - 2 * cellPad,
          cellStyle,
        ),
      );
      const cells: [string, number, TextAlign][] = [
        [String(Number(item.quantity)), 1, 'center'],
        [money(item.unitPrice), 2, 'end'],
        [money(item.lineTotal), 3, 'end'],
      ];
      for (const [text, c, align] of cells) {
        t.drawLine(
          text,
          colX[c] + cellPad,
          y + cellPad,
          colWidths[c] - 2 * cellPad,
          cellStyle,
          align,
        );
      }
      y += rowH;
    }
    rule(y);

    // Totals — kept together on one page
    const totalsX = colX[2];
    const totalsW = colWidths[2] + colWidths[3];
    const half = totalsW * 0.5;
    ensure(20 + 16 * 2 + 30 + (invoice.paidAmount !== null ? 20 : 0));
    y += 20;
    const totalRow = (label: string, value: string, style: TextStyle) => {
      t.drawLine(label, totalsX, y, half, style);
      t.drawLine(value, totalsX + half, y, half, style, 'end');
    };
    totalRow('Subtotal', money(invoice.subtotal), { size: 9, color: muted });
    y += 16;
    if (Number(invoice.taxRate) > 0) {
      totalRow(`Tax (${Number(invoice.taxRate)}%)`, money(invoice.taxAmount), {
        size: 9,
        color: muted,
      });
      y += 16;
    }
    doc
      .moveTo(totalsX, y)
      .lineTo(totalsX + totalsW, y)
      .strokeColor('#000000')
      .lineWidth(1)
      .stroke();
    y += 6;
    totalRow('Total', money(invoice.total), {
      size: 12,
      bold: true,
      color: '#000000',
    });
    y += 24;
    if (invoice.paidAmount !== null) {
      totalRow('Paid', money(invoice.paidAmount), {
        size: 10,
        bold: true,
        color: '#16A34A',
      });
      y += 20;
    }

    // Notes — may run over several pages
    if (invoice.notes) {
      const notesStyle = { size: 9, color: muted };
      const notesLH = t.lineHeight(notesStyle);
      y += 20;
      ensure(16 + notesLH);
      t.drawLine('Notes:', left, y, pageWidth, {
        size: 10,
        bold: true,
        color: '#000000',
      });
      y += 16;
      for (const line of t.lines(invoice.notes, pageWidth, notesStyle)) {
        ensure(notesLH);
        t.drawLine(line, left, y, pageWidth, notesStyle);
        y += notesLH;
      }
    }

    // Page numbers (only when there is more than one page)
    const range = doc.bufferedPageRange();
    if (range.count > 1) {
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(range.start + i);
        // Writing inside the bottom margin would make pdfkit add a page.
        const margin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        t.drawLine(
          `${invoice.invoiceNumber} — page ${i + 1} of ${range.count}`,
          left,
          doc.page.height - 35,
          pageWidth,
          { size: 8, color: '#999999' },
          'center',
        );
        doc.page.margins.bottom = margin;
      }
    }
  }
}
