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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { TemplatesService } from './templates.service.js';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/template.dto.js';
import {
  CreateTemplateFieldDto,
  UpdateTemplateFieldDto,
} from './dto/template-field.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

const templateStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'templates'),
  filename: (_req, file, cb) => {
    const uniqueName = `${randomUUID()}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

@Controller('templates')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  // ── Templates ──

  @Get()
  @RequirePermissions('templates:read')
  findAll(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    return this.templatesService.findAll({
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  @RequirePermissions('templates:read')
  findOne(@Param('id') id: string) {
    return this.templatesService.findOne(id);
  }

  @Post()
  @RequirePermissions('templates:create')
  create(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('templates:update')
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('templates:delete')
  remove(@Param('id') id: string) {
    return this.templatesService.remove(id);
  }

  // ── Word Template ──

  @Post(':id/upload-word')
  @RequirePermissions('templates:update')
  @UseInterceptors(FileInterceptor('file', { storage: templateStorage }))
  uploadWord(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.templatesService.uploadWordFile(id, file);
  }

  @Get(':id/word-preview')
  @RequirePermissions('templates:read')
  getWordPreview(@Param('id') id: string) {
    return this.templatesService.getWordPreview(id);
  }

  @Post(':id/word-placeholders')
  @RequirePermissions('templates:update')
  setWordPlaceholders(
    @Param('id') id: string,
    @Body() body: { placeholders: { find: string; fieldKey: string }[] },
  ) {
    return this.templatesService.setWordPlaceholders(id, body.placeholders);
  }

  // ── Fields ──

  @Post(':id/fields')
  @RequirePermissions('templates:update')
  addField(
    @Param('id') id: string,
    @Body() dto: CreateTemplateFieldDto,
  ) {
    return this.templatesService.addField(id, dto);
  }

  @Patch(':id/fields/:fieldId')
  @RequirePermissions('templates:update')
  updateField(
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateTemplateFieldDto,
  ) {
    return this.templatesService.updateField(id, fieldId, dto);
  }

  @Delete(':id/fields/:fieldId')
  @RequirePermissions('templates:update')
  removeField(
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.templatesService.removeField(id, fieldId);
  }

  @Patch(':id/fields/reorder')
  @RequirePermissions('templates:update')
  reorderFields(
    @Param('id') id: string,
    @Body('fieldIds') fieldIds: string[],
  ) {
    return this.templatesService.reorderFields(id, fieldIds);
  }
}
