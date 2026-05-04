import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Res,
  UseGuards, NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { AuthGuard } from '@nestjs/passport';
import { DocumentsService } from './documents.service.js';
import { ExportService } from './export.service.js';
import { CreateDocumentDto, SaveFieldValuesDto, UpdateDocumentStatusDto } from './dto/document.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

@Controller('documents')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly exportService: ExportService,
  ) {}

  @Get('by-job/:jobId')
  @RequirePermissions('documents:read')
  findByJob(@Param('jobId') jobId: string) {
    return this.documentsService.findByJob(jobId);
  }

  @Get('search-clone')
  @RequirePermissions('documents:read')
  searchForClone(
    @Query('templateId') templateId?: string,
    @Query('search') search?: string,
  ) {
    return this.documentsService.searchForClone({
      templateId: templateId || undefined,
      search,
    });
  }

  @Get(':id')
  @RequirePermissions('documents:read')
  findOne(@Param('id') id: string) {
    return this.documentsService.findOne(id);
  }

  @Post()
  @RequirePermissions('documents:create')
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }

  @Post(':id/save-values')
  @RequirePermissions('documents:update')
  saveFieldValues(
    @Param('id') id: string,
    @Body() dto: SaveFieldValuesDto,
  ) {
    return this.documentsService.saveFieldValues(id, dto.values);
  }

  @Patch(':id/status')
  @RequirePermissions('documents:update')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDocumentStatusDto,
  ) {
    return this.documentsService.updateStatus(id, dto.status);
  }

  @Post(':id/clone')
  @RequirePermissions('documents:create')
  clone(
    @Param('id') id: string,
    @Body('jobId') jobId: string,
  ) {
    return this.documentsService.clone(id, jobId);
  }

  @Post(':id/export')
  @RequirePermissions('documents:read')
  async exportDocument(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { filePath, fileName } = await this.exportService.exportDocument(id);

    if (!existsSync(filePath)) {
      throw new NotFoundException('Export file not found');
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = createReadStream(filePath);
    stream.pipe(res);
  }

  @Delete(':id')
  @RequirePermissions('documents:delete')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
