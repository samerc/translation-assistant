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
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { buildExampleDocx } from './word-example.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';
import { TemplatesService } from './templates.service.js';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  ReorderFieldsDto,
  WordPlaceholdersDto,
} from './dto/template.dto.js';
import {
  CreateTemplateFieldDto,
  UpdateTemplateFieldDto,
} from './dto/template-field.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { tenantDiskStorage } from '../../common/tenancy/tenant-upload-storage.js';

const templateStorage = tenantDiskStorage('templates');

@Controller('templates')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  // ── Templates ──

  @Get()
  @RequirePermissions('templates:read')
  findAll(
    @CurrentActor() actor: Actor,
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.templatesService.findAll({
      tenantId: actor.tenantId,
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      sortBy,
      sortOrder,
    });
  }

  /** A ready-made example Word template (the setup wizard links to it). */
  @Get('example-docx')
  @RequirePermissions('templates:read')
  async exampleDocx(@Res() res: Response) {
    const buf = await buildExampleDocx();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader(
      'Content-Disposition',
      contentDisposition('Example template.docx'),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  }

  @Get(':id')
  @RequirePermissions('templates:read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.findOne(id, actor.tenantId);
  }

  @Post()
  @RequirePermissions('templates:create')
  create(@Body() dto: CreateTemplateDto, @CurrentActor() actor: Actor) {
    return this.templatesService.create(dto, actor.tenantId);
  }

  @Patch(':id')
  @RequirePermissions('templates:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.update(id, dto, actor.tenantId);
  }

  @Delete(':id')
  @RequirePermissions('templates:delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.templatesService.remove(id, actor.tenantId);
  }

  // ── Word Template ──

  @Post(':id/upload-word')
  @RequirePermissions('templates:update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: templateStorage,
      limits: { fileSize: 15 * 1024 * 1024 }, // 15MB cap before parse
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() === '.docx')
          cb(null, true);
        else
          cb(new BadRequestException('Only .docx files are accepted'), false);
      },
    }),
  )
  uploadWord(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.uploadWordFile(id, file, actor.tenantId);
  }

  @Get(':id/word-preview')
  @RequirePermissions('templates:read')
  getWordPreview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.getWordPreview(id, actor.tenantId);
  }

  @Post(':id/word-placeholders')
  @RequirePermissions('templates:update')
  setWordPlaceholders(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WordPlaceholdersDto,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.setWordPlaceholders(
      id,
      dto.placeholders,
      actor.tenantId,
    );
  }

  // ── Fields ──

  @Post(':id/fields')
  @RequirePermissions('templates:update')
  addField(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTemplateFieldDto,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.addField(id, dto, actor.tenantId);
  }

  // Before ':id/fields/:fieldId' — or 'reorder' would be parsed as a field id.
  @Patch(':id/fields/reorder')
  @RequirePermissions('templates:update')
  reorderFields(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderFieldsDto,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.reorderFields(
      id,
      dto.fieldIds,
      actor.tenantId,
    );
  }

  @Patch(':id/fields/:fieldId')
  @RequirePermissions('templates:update')
  updateField(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,
    @Body() dto: UpdateTemplateFieldDto,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.updateField(id, fieldId, dto, actor.tenantId);
  }

  @Delete(':id/fields/:fieldId')
  @RequirePermissions('templates:update')
  removeField(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fieldId', ParseUUIDPipe) fieldId: string,

    @CurrentActor() actor: Actor,
  ) {
    return this.templatesService.removeField(id, fieldId, actor.tenantId);
  }
}
