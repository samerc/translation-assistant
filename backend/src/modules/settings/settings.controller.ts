import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto.js';
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
}
