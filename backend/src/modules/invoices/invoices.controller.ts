import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  NotFoundException,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync, unlinkSync } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { streamThenDelete } from '../../common/utils/stream-then-delete.js';
import { InvoicesService } from './invoices.service.js';
import { InvoiceExportService } from './invoice-export.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  UpdateInvoiceStatusDto,
  RecordPaymentDto,
  SendInvoiceEmailDto,
} from './dto/invoice.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';
import { actorOf } from '../../common/tenancy/actor.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';

@Controller('invoices')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly exportService: InvoiceExportService,
    private readonly mailService: MailService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Get()
  @RequirePermissions('invoices:read')
  findAll(
    @CurrentUser() user: User,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.invoicesService.findAll({
      search,
      status,
      sortBy,
      sortOrder,
      clientId: clientId || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      actor: actorOf(user),
    });
  }

  @Get('by-job/:jobId')
  @RequirePermissions('invoices:read')
  async findByJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyJobAccess(jobId, actor);
    return this.invoicesService.findByJob(jobId);
  }

  @Get(':id')
  @RequirePermissions('invoices:read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    return this.invoicesService.verifyInvoiceAccess(id, actor);
  }

  @Post()
  @RequirePermissions('invoices:create')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: User) {
    return this.invoicesService.create(dto, actorOf(user));
  }

  @Patch(':id')
  @RequirePermissions('invoices:update')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor, 'edit');
    return this.invoicesService.update(id, dto, actor);
  }

  @Patch(':id/status')
  @RequirePermissions('invoices:update')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceStatusDto,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor, 'edit');
    return this.invoicesService.updateStatus(id, dto.status);
  }

  @Post(':id/record-payment')
  @RequirePermissions('invoices:update')
  async recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPaymentDto,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor, 'edit');
    return this.invoicesService.recordPayment(id, dto, actor.userId);
  }

  @Delete(':id/payments/:paymentId')
  @RequirePermissions('invoices:update')
  async removePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor, 'edit');
    return this.invoicesService.removePayment(id, paymentId);
  }

  @Post(':id/export-pdf')
  @RequirePermissions('invoices:read')
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor);
    const { filePath, fileName } = await this.exportService.exportPdf(id);
    if (!existsSync(filePath))
      throw new NotFoundException('Export file not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    streamThenDelete(filePath, res);
  }

  @Post(':id/export-word')
  @RequirePermissions('invoices:read')
  async exportWord(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor);
    const { filePath, fileName } = await this.exportService.exportWord(id);
    if (!existsSync(filePath))
      throw new NotFoundException('Export file not found');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', contentDisposition(fileName));
    streamThenDelete(filePath, res);
  }

  // Sends company-branded mail to any address — a write, and rate-limited so it
  // cannot be used as a relay.
  @Post(':id/email')
  @RequirePermissions('invoices:update')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  async emailInvoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendInvoiceEmailDto,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    const invoice = await this.invoicesService.verifyInvoiceAccess(
      id,
      actor,
      'edit',
    );
    const recipient =
      dto.email || (await this.invoicesService.getClientEmail(id));
    if (!recipient) {
      throw new BadRequestException(
        'No recipient email — the client has no email on file. Provide one to send.',
      );
    }
    const { filePath } = await this.exportService.exportPdf(id);
    // Sent from the platform's mailbox under the sender's business name (My
    // Business, else the organization); replies go to the sender.
    const settings = await this.tenantsService.getSettings(actor.tenantId);
    try {
      await this.mailService.sendInvoiceEmail(
        recipient,
        invoice.invoiceNumber,
        filePath,
        dto.message,
        {
          name: user.businessName || settings.companyName,
          replyTo: user.email,
        },
      );
    } finally {
      try {
        unlinkSync(filePath);
      } catch {
        // temp file already removed
      }
    }
    return { sent: true, to: recipient };
  }

  @Delete(':id')
  @RequirePermissions('invoices:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const actor = actorOf(user);
    await this.invoicesService.verifyInvoiceAccess(id, actor, 'edit');
    return this.invoicesService.remove(id);
  }
}
