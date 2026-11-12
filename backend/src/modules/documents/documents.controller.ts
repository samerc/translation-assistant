import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  NotFoundException,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { existsSync } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { streamThenDelete } from '../../common/utils/stream-then-delete.js';
import { DocumentsService } from './documents.service.js';
import { ExportService } from './export.service.js';
import {
  CreateDocumentDto,
  SaveFieldValuesDto,
  UpdateDocumentStatusDto,
  CloneDocumentDto,
} from './dto/document.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';

@Controller('documents')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('by-job/:jobId')
  @RequirePermissions('documents:read')
  async findByJob(
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.documentsService.verifyJobAccess(jobId, actor);
    return this.documentsService.findByJob(jobId);
  }

  @Get('search-clone')
  @RequirePermissions('documents:read')
  searchForClone(
    @CurrentActor() actor: Actor,
    @Query('templateId') templateId?: string,
    @Query('search') search?: string,
  ) {
    return this.documentsService.searchForClone({
      templateId: templateId || undefined,
      search,
      actor,
    });
  }

  @Get(':id')
  @RequirePermissions('documents:read')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.documentsService.verifyDocumentAccess(id, actor);
  }

  @Post()
  @RequirePermissions('documents:create')
  async create(@Body() dto: CreateDocumentDto, @CurrentActor() actor: Actor) {
    await this.documentsService.verifyJobAccess(dto.jobId, actor, 'edit');
    // Cloning copies field values from the source — require access to it too (IDOR guard).
    if (dto.clonedFromId) {
      await this.documentsService.verifyDocumentAccess(dto.clonedFromId, actor);
    }
    return this.documentsService.create(dto, actor.tenantId);
  }

  @Post(':id/save-values')
  @RequirePermissions('documents:update')
  async saveFieldValues(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFieldValuesDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.documentsService.verifyDocumentAccess(id, actor, 'edit');
    return this.documentsService.saveFieldValues(id, dto.values);
  }

  @Patch(':id/status')
  @RequirePermissions('documents:update')
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentStatusDto,
    @CurrentActor() actor: Actor,
  ) {
    await this.documentsService.verifyDocumentAccess(id, actor, 'edit');
    return this.documentsService.updateStatus(id, dto.status);
  }

  @Post(':id/clone')
  @RequirePermissions('documents:create')
  async clone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloneDocumentDto,
    @CurrentActor() actor: Actor,
  ) {
    // Verify access to both source document's job AND target job
    await this.documentsService.verifyDocumentAccess(id, actor);
    await this.documentsService.verifyJobAccess(dto.jobId, actor, 'edit');
    return this.documentsService.clone(id, dto.jobId, actor.tenantId);
  }

  @Post(':id/export')
  @RequirePermissions('documents:read')
  async exportDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
    @CurrentActor() actor: Actor,
  ) {
    await this.documentsService.verifyDocumentAccess(id, actor);
    const { filePath, downloadName } =
      await this.exportService.exportDocument(id);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Export file not found');
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', contentDisposition(downloadName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    streamThenDelete(filePath, res);
  }

  @Delete(':id')
  @RequirePermissions('documents:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    await this.documentsService.verifyDocumentAccess(id, actor, 'edit');
    return this.documentsService.remove(id);
  }
}
