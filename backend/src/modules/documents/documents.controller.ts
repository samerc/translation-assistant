import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Res,
  UseGuards, NotFoundException, ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync, unlinkSync } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { DocumentsService } from './documents.service.js';
import { ExportService } from './export.service.js';
import { CreateDocumentDto, SaveFieldValuesDto, UpdateDocumentStatusDto, CloneDocumentDto } from './dto/document.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('documents')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly exportService: ExportService,
  ) {}

  private isAdmin(user: User): boolean {
    return user.role?.name === 'Admin';
  }

  @Get('by-job/:jobId')
  @RequirePermissions('documents:read')
  async findByJob(@Param('jobId', ParseUUIDPipe) jobId: string, @CurrentUser() user: User) {
    await this.documentsService.verifyJobAccess(jobId, user.id, this.isAdmin(user));
    return this.documentsService.findByJob(jobId);
  }

  @Get('search-clone')
  @RequirePermissions('documents:read')
  searchForClone(
    @CurrentUser() user: User,
    @Query('templateId') templateId?: string,
    @Query('search') search?: string,
  ) {
    return this.documentsService.searchForClone({
      templateId: templateId || undefined,
      search,
      userId: user.id,
      isAdmin: this.isAdmin(user),
    });
  }

  @Get(':id')
  @RequirePermissions('documents:read')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.documentsService.verifyDocumentAccess(id, user.id, this.isAdmin(user));
  }

  @Post()
  @RequirePermissions('documents:create')
  async create(@Body() dto: CreateDocumentDto, @CurrentUser() user: User) {
    await this.documentsService.verifyJobAccess(dto.jobId, user.id, this.isAdmin(user));
    // Cloning copies field values from the source — require access to it too (IDOR guard).
    if (dto.clonedFromId) {
      await this.documentsService.verifyDocumentAccess(dto.clonedFromId, user.id, this.isAdmin(user));
    }
    return this.documentsService.create(dto);
  }

  @Post(':id/save-values')
  @RequirePermissions('documents:update')
  async saveFieldValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFieldValuesDto,
    @CurrentUser() user: User,
  ) {
    await this.documentsService.verifyDocumentAccess(id, user.id, this.isAdmin(user));
    return this.documentsService.saveFieldValues(id, dto.values);
  }

  @Patch(':id/status')
  @RequirePermissions('documents:update')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentStatusDto,
    @CurrentUser() user: User,
  ) {
    await this.documentsService.verifyDocumentAccess(id, user.id, this.isAdmin(user));
    return this.documentsService.updateStatus(id, dto.status);
  }

  @Post(':id/clone')
  @RequirePermissions('documents:create')
  async clone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneDocumentDto,
    @CurrentUser() user: User,
  ) {
    // Verify access to both source document's job AND target job
    await this.documentsService.verifyDocumentAccess(id, user.id, this.isAdmin(user));
    await this.documentsService.verifyJobAccess(dto.jobId, user.id, this.isAdmin(user));
    return this.documentsService.clone(id, dto.jobId);
  }

  @Post(':id/export')
  @RequirePermissions('documents:read')
  async exportDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @CurrentUser() user: User,
  ) {
    await this.documentsService.verifyDocumentAccess(id, user.id, this.isAdmin(user));
    const { filePath, fileName } = await this.exportService.exportDocument(id);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Export file not found');
    }

    const safeFileName = fileName.replace(/[^\w.\-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const stream = createReadStream(filePath);
    stream.pipe(res);
    stream.on('end', () => { try { unlinkSync(filePath); } catch {} });
  }

  @Delete(':id')
  @RequirePermissions('documents:delete')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.documentsService.verifyDocumentAccess(id, user.id, this.isAdmin(user));
    return this.documentsService.remove(id);
  }
}
