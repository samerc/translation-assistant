import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, Res, NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { InvoicesService } from './invoices.service.js';
import { InvoiceExportService } from './invoice-export.service.js';
import { CreateInvoiceDto, UpdateInvoiceDto, UpdateInvoiceStatusDto, RecordPaymentDto } from './dto/invoice.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('invoices')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly exportService: InvoiceExportService,
  ) {}

  private isAdmin(user: User): boolean {
    return user.role?.name === 'Admin';
  }

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
      search, status, sortBy, sortOrder,
      clientId: clientId || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      userId: user.id,
      isAdmin: this.isAdmin(user),
    });
  }

  @Get('by-job/:jobId')
  @RequirePermissions('invoices:read')
  findByJob(@Param('jobId') jobId: string) {
    return this.invoicesService.findByJob(jobId);
  }

  @Get(':id')
  @RequirePermissions('invoices:read')
  async findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
  }

  @Post()
  @RequirePermissions('invoices:create')
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: User) {
    return this.invoicesService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('invoices:update')
  async update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: User) {
    await this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
    return this.invoicesService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('invoices:update')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateInvoiceStatusDto, @CurrentUser() user: User) {
    await this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
    return this.invoicesService.updateStatus(id, dto.status);
  }

  @Post(':id/record-payment')
  @RequirePermissions('invoices:update')
  async recordPayment(@Param('id') id: string, @Body() dto: RecordPaymentDto, @CurrentUser() user: User) {
    await this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
    return this.invoicesService.recordPayment(id, dto);
  }

  @Post(':id/export-pdf')
  @RequirePermissions('invoices:read')
  async exportPdf(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: User) {
    await this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
    const { filePath, fileName } = await this.exportService.exportPdf(id);
    if (!existsSync(filePath)) throw new NotFoundException('Export file not found');
    const safeFileName = fileName.replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    createReadStream(filePath).pipe(res);
  }

  @Post(':id/export-word')
  @RequirePermissions('invoices:read')
  async exportWord(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: User) {
    await this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
    const { filePath, fileName } = await this.exportService.exportWord(id);
    if (!existsSync(filePath)) throw new NotFoundException('Export file not found');
    const safeFileName = fileName.replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    createReadStream(filePath).pipe(res);
  }

  @Delete(':id')
  @RequirePermissions('invoices:delete')
  async remove(@Param('id') id: string, @CurrentUser() user: User) {
    await this.invoicesService.verifyInvoiceAccess(id, user.id, this.isAdmin(user));
    return this.invoicesService.remove(id);
  }
}
