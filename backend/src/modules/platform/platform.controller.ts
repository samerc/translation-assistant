import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { PlatformService } from './platform.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { UsersService } from '../users/users.service.js';
import {
  CreateTenantDto,
  ListTenantsQuery,
  TenantInviteDto,
  UpdateTenantDto,
} from './dto/platform.dto.js';
import { UpdatePlatformSettingsDto } from '../settings/dto/update-platform-settings.dto.js';
import {
  CreateLanguageDto,
  UpdateLanguageDto,
} from '../settings/dto/language.dto.js';
import {
  CreateLabelOptionDto,
  UpdateLabelOptionDto,
} from '../settings/dto/label-option.dto.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';

/**
 * Platform administration: organizations (tenants), their accounts, and the
 * platform-wide settings and global lists. Platform admins only — they have
 * no tenant, so every tenant endpoint refuses them, and these refuse tenants.
 */
@Controller('platform')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, PlatformAdminGuard)
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly settingsService: SettingsService,
    private readonly usersService: UsersService,
  ) {}

  // ── Organizations ──

  @Get('tenants')
  @RequirePermissions('platform:read')
  listTenants(@Query() query: ListTenantsQuery) {
    return this.platformService.listTenants(query);
  }

  @Get('tenants/:id')
  @RequirePermissions('platform:read')
  getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.getTenant(id);
  }

  @Post('tenants')
  @RequirePermissions('platform:create')
  createTenant(@Body() dto: CreateTenantDto) {
    return this.platformService.createTenant(dto);
  }

  @Patch('tenants/:id')
  @RequirePermissions('platform:update')
  updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.platformService.updateTenant(id, dto);
  }

  @Post('tenants/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('platform:update')
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.approve(id);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('platform:update')
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.suspend(id);
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('platform:update')
  reactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.reactivate(id);
  }

  @Post('tenants/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('platform:delete')
  async reject(@Param('id', ParseUUIDPipe) id: string) {
    await this.platformService.reject(id);
    return { message: 'Sign-up rejected and removed' };
  }

  @Post('tenants/:id/invite')
  @RequirePermissions('platform:create')
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  invite(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TenantInviteDto) {
    return this.platformService.inviteToTenant(id, dto.email, dto.roleId);
  }

  // ── Accounts of tenant users (support: lockouts, offboarding) ──

  @Post('users/:id/reset-password')
  @RequirePermissions('platform:update')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  resetPassword(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.resetPasswordByAdmin(id, 'platform');
  }

  @Patch('users/:id/activate')
  @RequirePermissions('platform:update')
  activateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.activate(id, 'platform');
  }

  @Patch('users/:id/deactivate')
  @RequirePermissions('platform:update')
  deactivateUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deactivate(id, 'platform');
  }

  // ── Platform settings ──

  @Get('settings')
  @RequirePermissions('platform:read')
  async getSettings() {
    return this.present(await this.settingsService.getPlatformSettings());
  }

  @Patch('settings')
  @RequirePermissions('platform:update')
  async updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.present(await this.settingsService.updatePlatformSettings(dto));
  }

  private present(settings: AppSettings) {
    // Never expose the stored SMTP password; signal only whether one is set.
    const { smtpPass, ...safe } = settings;
    return { ...safe, smtpPassSet: Boolean(smtpPass) };
  }

  // ── Global languages ──

  @Get('languages')
  @RequirePermissions('platform:read')
  languages() {
    return this.settingsService.findGlobalLanguages();
  }

  @Post('languages')
  @RequirePermissions('platform:create')
  createLanguage(@Body() dto: CreateLanguageDto) {
    return this.settingsService.createGlobalLanguage(dto);
  }

  @Patch('languages/:id')
  @RequirePermissions('platform:update')
  updateLanguage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.settingsService.updateGlobalLanguage(id, dto);
  }

  @Delete('languages/:id')
  @RequirePermissions('platform:delete')
  removeLanguage(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.removeGlobalLanguage(id);
  }

  // ── Global contact labels ──

  @Get('labels')
  @RequirePermissions('platform:read')
  labels() {
    return this.settingsService.findGlobalLabels();
  }

  @Post('labels')
  @RequirePermissions('platform:create')
  createLabel(@Body() dto: CreateLabelOptionDto) {
    return this.settingsService.createGlobalLabel(dto);
  }

  @Patch('labels/:id')
  @RequirePermissions('platform:update')
  updateLabel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLabelOptionDto,
  ) {
    return this.settingsService.updateGlobalLabel(id, dto);
  }

  @Delete('labels/:id')
  @RequirePermissions('platform:delete')
  removeLabel(@Param('id', ParseUUIDPipe) id: string) {
    return this.settingsService.removeGlobalLabel(id);
  }
}
