import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { writeFileSync, mkdirSync, existsSync, createReadStream } from 'fs';
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
  HeadingLevel,
} from 'docx';
import PDFDocument from 'pdfkit';
import { Invoice } from './entities/invoice.entity.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';

@Injectable()
export class InvoiceExportService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  private async getInvoice(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({
      where: { id },
      relations: ['client', 'client.emails', 'client.addresses', 'items', 'items.job'],
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
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

  async exportWord(id: string): Promise<{ filePath: string; fileName: string }> {
    const invoice = await this.getInvoice(id);
    const settings = await this.getSettings();

    const companyName = settings?.companyName || 'Company';
    const companyAddress = settings?.companyAddress || '';

    const children: Paragraph[] = [];

    // Header - Company info
    children.push(new Paragraph({
      children: [new TextRun({ text: companyName, bold: true, size: 32, font: 'Arial' })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 100 },
    }));

    if (companyAddress) {
      children.push(new Paragraph({
        children: [new TextRun({ text: companyAddress, size: 18, color: '666666', font: 'Arial' })],
        spacing: { after: 200 },
      }));
    }

    // Invoice title
    children.push(new Paragraph({
      children: [new TextRun({ text: 'INVOICE', bold: true, size: 40, font: 'Arial' })],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 200 },
    }));

    // Invoice details
    const detailLines = [
      `Invoice Number: ${invoice.invoiceNumber}`,
      `Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`,
      `Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`,
      `Status: ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}`,
    ];

    for (const line of detailLines) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line, size: 20, font: 'Arial' })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 40 },
      }));
    }

    children.push(new Paragraph({ spacing: { after: 200 } }));

    // Bill To
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Bill To:', bold: true, size: 22, font: 'Arial' })],
      spacing: { after: 80 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: invoice.client.name, size: 22, font: 'Arial' })],
      spacing: { after: 40 },
    }));
    if (invoice.client.taxId) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Tax ID: ${invoice.client.taxId}`, size: 18, color: '666666', font: 'Arial' })],
        spacing: { after: 40 },
      }));
    }
    const billingAddress = invoice.client.addresses?.find((a) => a.label === 'Billing') || invoice.client.addresses?.[0];
    if (billingAddress) {
      children.push(new Paragraph({
        children: [new TextRun({ text: billingAddress.address, size: 18, color: '666666', font: 'Arial' })],
        spacing: { after: 40 },
      }));
    }
    const primaryEmail = invoice.client.emails?.find((e) => e.isPrimary) || invoice.client.emails?.[0];
    if (primaryEmail) {
      children.push(new Paragraph({
        children: [new TextRun({ text: primaryEmail.email, size: 18, color: '666666', font: 'Arial' })],
        spacing: { after: 40 },
      }));
    }

    children.push(new Paragraph({ spacing: { after: 300 } }));

    // Line items table
    const borderStyle = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
    const borders = { top: borderStyle, bottom: borderStyle, left: borderStyle, right: borderStyle };

    const headerRow = new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Description', bold: true, size: 18, font: 'Arial' })], spacing: { before: 60, after: 60 } })], borders, width: { size: 45, type: WidthType.PERCENTAGE }, shading: { fill: 'F3F4F6' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Qty', bold: true, size: 18, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } })], borders, width: { size: 10, type: WidthType.PERCENTAGE }, shading: { fill: 'F3F4F6' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Unit Price', bold: true, size: 18, font: 'Arial' })], alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 60 } })], borders, width: { size: 20, type: WidthType.PERCENTAGE }, shading: { fill: 'F3F4F6' } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Total', bold: true, size: 18, font: 'Arial' })], alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 60 } })], borders, width: { size: 25, type: WidthType.PERCENTAGE }, shading: { fill: 'F3F4F6' } }),
      ],
    });

    const itemRows = invoice.items.map((item) =>
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: item.description, size: 18, font: 'Arial' })], spacing: { before: 60, after: 60 } })], borders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(Number(item.quantity)), size: 18, font: 'Arial' })], alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 } })], borders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${invoice.currency} ${Number(item.unitPrice).toFixed(2)}`, size: 18, font: 'Arial' })], alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 60 } })], borders }),
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${invoice.currency} ${Number(item.lineTotal).toFixed(2)}`, size: 18, font: 'Arial' })], alignment: AlignmentType.RIGHT, spacing: { before: 60, after: 60 } })], borders }),
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
    totalsChildren.push(new Paragraph({
      children: [new TextRun({ text: `Subtotal: ${invoice.currency} ${Number(invoice.subtotal).toFixed(2)}`, size: 20, font: 'Arial' })],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
    }));
    if (Number(invoice.taxRate) > 0) {
      totalsChildren.push(new Paragraph({
        children: [new TextRun({ text: `Tax (${invoice.taxRate}%): ${invoice.currency} ${Number(invoice.taxAmount).toFixed(2)}`, size: 20, font: 'Arial' })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 60 },
      }));
    }
    totalsChildren.push(new Paragraph({
      children: [new TextRun({ text: `Total: ${invoice.currency} ${Number(invoice.total).toFixed(2)}`, bold: true, size: 24, font: 'Arial' })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100, after: 100 },
    }));

    if (invoice.paidAmount !== null) {
      totalsChildren.push(new Paragraph({
        children: [new TextRun({ text: `Paid: ${invoice.currency} ${Number(invoice.paidAmount).toFixed(2)}`, size: 20, color: '16A34A', font: 'Arial' })],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 60 },
      }));
    }

    // Notes
    const notesChildren: Paragraph[] = [];
    if (invoice.notes) {
      notesChildren.push(new Paragraph({ spacing: { after: 200 } }));
      notesChildren.push(new Paragraph({
        children: [new TextRun({ text: 'Notes:', bold: true, size: 20, font: 'Arial' })],
        spacing: { after: 80 },
      }));
      notesChildren.push(new Paragraph({
        children: [new TextRun({ text: invoice.notes, size: 18, color: '666666', font: 'Arial' })],
      }));
    }

    const doc = new DocxDocument({
      sections: [{
        children: [...children, table, ...totalsChildren, ...notesChildren],
      }],
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
    const settings = await this.getSettings();

    const companyName = settings?.companyName || 'Company';
    const companyAddress = settings?.companyAddress || '';

    const dir = this.ensureExportDir();
    const fileName = `${invoice.invoiceNumber}.pdf`;
    const filePath = join(dir, `${randomUUID()}.pdf`);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        const buffer = Buffer.concat(chunks);
        writeFileSync(filePath, buffer);
        resolve({ filePath, fileName });
      });
      doc.on('error', reject);

      const pageWidth = doc.page.width - 100; // margins

      // Company header
      doc.fontSize(18).font('Helvetica-Bold').text(companyName, 50, 50);
      if (companyAddress) {
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(companyAddress, 50, 72);
      }

      // INVOICE title
      doc.fontSize(28).font('Helvetica-Bold').fillColor('#000000').text('INVOICE', 50, 50, { align: 'right' });

      // Invoice details (right side)
      const detailsY = 90;
      doc.fontSize(9).font('Helvetica').fillColor('#333333');
      doc.text(`Invoice #: ${invoice.invoiceNumber}`, 350, detailsY, { align: 'right', width: pageWidth - 300 });
      doc.text(`Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}`, { align: 'right' });
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, { align: 'right' });
      doc.text(`Status: ${invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}`, { align: 'right' });

      // Bill To
      let y = 160;
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Bill To:', 50, y);
      y += 16;
      doc.fontSize(11).font('Helvetica-Bold').text(invoice.client.name, 50, y);
      y += 16;
      if (invoice.client.taxId) {
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(`Tax ID: ${invoice.client.taxId}`, 50, y);
        y += 14;
      }
      const billingAddr = invoice.client.addresses?.find((a) => a.label === 'Billing') || invoice.client.addresses?.[0];
      if (billingAddr) {
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(billingAddr.address, 50, y);
        y += 14;
      }
      const email = invoice.client.emails?.find((e) => e.isPrimary) || invoice.client.emails?.[0];
      if (email) {
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(email.email, 50, y);
        y += 14;
      }

      // Line items table
      y += 30;
      const colWidths = [pageWidth * 0.45, pageWidth * 0.1, pageWidth * 0.2, pageWidth * 0.25];
      const colX = [50, 50 + colWidths[0], 50 + colWidths[0] + colWidths[1], 50 + colWidths[0] + colWidths[1] + colWidths[2]];

      // Table header
      doc.rect(50, y, pageWidth, 22).fill('#F3F4F6');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
      doc.text('Description', colX[0] + 6, y + 6, { width: colWidths[0] - 12 });
      doc.text('Qty', colX[1] + 6, y + 6, { width: colWidths[1] - 12, align: 'center' });
      doc.text('Unit Price', colX[2] + 6, y + 6, { width: colWidths[2] - 12, align: 'right' });
      doc.text('Total', colX[3] + 6, y + 6, { width: colWidths[3] - 12, align: 'right' });
      y += 22;

      // Table rows
      doc.font('Helvetica').fillColor('#333333').fontSize(9);
      for (const item of invoice.items) {
        // Draw border line
        doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();

        doc.fillColor('#333333');
        doc.text(item.description, colX[0] + 6, y + 6, { width: colWidths[0] - 12 });
        doc.text(String(Number(item.quantity)), colX[1] + 6, y + 6, { width: colWidths[1] - 12, align: 'center' });
        doc.text(`${invoice.currency} ${Number(item.unitPrice).toFixed(2)}`, colX[2] + 6, y + 6, { width: colWidths[2] - 12, align: 'right' });
        doc.text(`${invoice.currency} ${Number(item.lineTotal).toFixed(2)}`, colX[3] + 6, y + 6, { width: colWidths[3] - 12, align: 'right' });
        y += 22;
      }

      // Bottom border
      doc.moveTo(50, y).lineTo(50 + pageWidth, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();

      // Totals
      y += 20;
      const totalsX = colX[2];
      const totalsW = colWidths[2] + colWidths[3];

      doc.fontSize(9).font('Helvetica').fillColor('#666666');
      doc.text('Subtotal', totalsX, y, { width: totalsW * 0.5 });
      doc.text(`${invoice.currency} ${Number(invoice.subtotal).toFixed(2)}`, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
      y += 16;

      if (Number(invoice.taxRate) > 0) {
        doc.text(`Tax (${invoice.taxRate}%)`, totalsX, y, { width: totalsW * 0.5 });
        doc.text(`${invoice.currency} ${Number(invoice.taxAmount).toFixed(2)}`, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
        y += 16;
      }

      // Total line
      doc.moveTo(totalsX, y).lineTo(totalsX + totalsW, y).strokeColor('#000000').lineWidth(1).stroke();
      y += 6;
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000');
      doc.text('Total', totalsX, y, { width: totalsW * 0.5 });
      doc.text(`${invoice.currency} ${Number(invoice.total).toFixed(2)}`, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
      y += 24;

      if (invoice.paidAmount !== null) {
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#16A34A');
        doc.text('Paid', totalsX, y, { width: totalsW * 0.5 });
        doc.text(`${invoice.currency} ${Number(invoice.paidAmount).toFixed(2)}`, totalsX + totalsW * 0.5, y, { width: totalsW * 0.5, align: 'right' });
        y += 20;
      }

      // Notes
      if (invoice.notes) {
        y += 30;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#000000').text('Notes:', 50, y);
        y += 16;
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(invoice.notes, 50, y, { width: pageWidth });
      }

      doc.end();
    });
  }
}
