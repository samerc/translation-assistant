import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DocumentsService } from './documents.service.js';
import { CreateDocumentDto, SaveFieldValuesDto, UpdateDocumentStatusDto } from './dto/document.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

@Controller('documents')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

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

  @Delete(':id')
  @RequirePermissions('documents:delete')
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
