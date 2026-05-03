import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto.js';
import { CreateLabelOptionDto, UpdateLabelOptionDto } from './dto/label-option.dto.js';
import type { LabelCategory } from './dto/label-option.dto.js';
import { CreateFreeformJobTypeDto, UpdateFreeformJobTypeDto } from './dto/freeform-job-type.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';

@Controller('settings')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── App Settings ──

  @Get()
  @RequirePermissions('settings:read')
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  @RequirePermissions('settings:update')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }

  // ── Languages ──

  @Get('languages')
  @RequirePermissions('settings:read')
  findAllLanguages() {
    return this.settingsService.findAllLanguages();
  }

  @Post('languages')
  @RequirePermissions('settings:create')
  createLanguage(@Body() dto: CreateLanguageDto) {
    return this.settingsService.createLanguage(dto);
  }

  @Patch('languages/:id')
  @RequirePermissions('settings:update')
  updateLanguage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.settingsService.updateLanguage(id, dto);
  }

  @Delete('languages/:id')
  @RequirePermissions('settings:delete')
  removeLanguage(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.removeLanguage(id);
  }

  // ── Label Options ──

  @Get('labels')
  @RequirePermissions('settings:read')
  findAllLabels() {
    return this.settingsService.findAllLabels();
  }

  @Get('labels/:category')
  @RequirePermissions('settings:read')
  findLabelsByCategory(@Param('category') category: LabelCategory) {
    return this.settingsService.findLabelsByCategory(category);
  }

  @Post('labels')
  @RequirePermissions('settings:create')
  createLabel(@Body() dto: CreateLabelOptionDto) {
    return this.settingsService.createLabel(dto);
  }

  @Patch('labels/:id')
  @RequirePermissions('settings:update')
  updateLabel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLabelOptionDto,
  ) {
    return this.settingsService.updateLabel(id, dto);
  }

  @Delete('labels/:id')
  @RequirePermissions('settings:delete')
  removeLabel(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.removeLabel(id);
  }

  // ── Freeform Job Types ──

  @Get('freeform-job-types')
  @RequirePermissions('settings:read')
  findAllFreeformJobTypes() {
    return this.settingsService.findAllFreeformJobTypes();
  }

  @Post('freeform-job-types')
  @RequirePermissions('settings:create')
  createFreeformJobType(@Body() dto: CreateFreeformJobTypeDto) {
    return this.settingsService.createFreeformJobType(dto);
  }

  @Patch('freeform-job-types/:id')
  @RequirePermissions('settings:update')
  updateFreeformJobType(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFreeformJobTypeDto,
  ) {
    return this.settingsService.updateFreeformJobType(id, dto);
  }

  @Delete('freeform-job-types/:id')
  @RequirePermissions('settings:delete')
  removeFreeformJobType(@Param('id', ParseIntPipe) id: number) {
    return this.settingsService.removeFreeformJobType(id);
  }
}
