import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { sniffImageMime } from '../../common/utils/file-signature.js';
import { AuthGuard } from '@nestjs/passport';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { TenantSettings } from '../tenants/entities/tenant-settings.entity.js';
import type { LabelCategory } from './dto/label-option.dto.js';
import {
  CreateFreeformJobTypeDto,
  UpdateFreeformJobTypeDto,
} from './dto/freeform-job-type.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';

/**
 * The caller's tenant settings. Languages and labels are read here (global +
 * the tenant's own); the global lists are managed under /platform.
 */
@Controller('settings')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // ── Tenant settings ──

  @Get()
  @RequirePermissions('settings:read')
  async getSettings(@CurrentActor() actor: Actor) {
    return this.present(
      await this.settingsService.getTenantSettings(actor.tenantId),
      actor,
    );
  }

  @Patch()
  @RequirePermissions('settings:update')
  @AdminOnly()
  async updateSettings(
    @Body() dto: UpdateSettingsDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.present(
      await this.settingsService.updateTenantSettings(actor.tenantId, dto),
      actor,
    );
  }

  // ── Organization logo (printed on invoices) ──
  // Stored inline as a base64 data URL; PNG/JPEG only (the formats both the PDF
  // and Word exporters embed), max 1 MB.
  @Patch('logo')
  @RequirePermissions('settings:update')
  @AdminOnly()
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: { fileSize: 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (['image/png', 'image/jpeg'].includes(file.mimetype)) cb(null, true);
        else
          cb(
            new BadRequestException('Logo must be a PNG or JPEG image'),
            false,
          );
      },
    }),
  )
  async uploadLogo(
    @CurrentActor() actor: Actor,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Logo file is required');
    // Build the data URL from the real content (magic bytes), never the
    // client-declared type (guards against spoofed/SVG payloads).
    const mime = sniffImageMime(file.buffer);
    if (!mime)
      throw new BadRequestException('Logo must be a valid PNG or JPEG image');
    const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
    return this.present(
      await this.settingsService.setLogo(actor.tenantId, dataUrl),
      actor,
    );
  }

  @Delete('logo')
  @RequirePermissions('settings:update')
  @AdminOnly()
  async removeLogo(@CurrentActor() actor: Actor) {
    return this.present(
      await this.settingsService.setLogo(actor.tenantId, null),
      actor,
    );
  }

  private present(settings: TenantSettings, actor: Actor) {
    // Never expose the stored Translate key; admins learn only whether one is set.
    const { googleTranslateApiKey, tenantId: _t, ...safe } = settings;
    if (actor.isAdmin) {
      return { ...safe, googleTranslateKeySet: Boolean(googleTranslateApiKey) };
    }
    return safe;
  }

  // ── Languages & labels (read: global + the tenant's own) ──

  @Get('languages')
  @RequirePermissions('settings:read')
  findAllLanguages(@CurrentActor() actor: Actor) {
    return this.settingsService.findLanguagesForTenant(actor.tenantId);
  }

  @Get('labels')
  @RequirePermissions('settings:read')
  findAllLabels(@CurrentActor() actor: Actor) {
    return this.settingsService.findAllLabels(actor.tenantId);
  }

  @Get('labels/:category')
  @RequirePermissions('settings:read')
  async findLabelsByCategory(
    @Param('category') category: LabelCategory,
    @CurrentActor() actor: Actor,
  ) {
    const all = await this.settingsService.findAllLabels(actor.tenantId);
    return (all[category] ?? []).map((value, sortOrder) => ({
      category,
      value,
      sortOrder,
    }));
  }

  // ── Freeform job types (per tenant) ──

  @Get('freeform-job-types')
  @RequirePermissions('settings:read')
  findAllFreeformJobTypes(@CurrentActor() actor: Actor) {
    return this.settingsService.findAllFreeformJobTypes(actor.tenantId);
  }

  @Post('freeform-job-types')
  @RequirePermissions('settings:create')
  @AdminOnly()
  createFreeformJobType(
    @Body() dto: CreateFreeformJobTypeDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.settingsService.createFreeformJobType(actor.tenantId, dto);
  }

  @Patch('freeform-job-types/:id')
  @RequirePermissions('settings:update')
  @AdminOnly()
  updateFreeformJobType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFreeformJobTypeDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.settingsService.updateFreeformJobType(actor.tenantId, id, dto);
  }

  @Delete('freeform-job-types/:id')
  @RequirePermissions('settings:delete')
  @AdminOnly()
  removeFreeformJobType(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.settingsService.removeFreeformJobType(actor.tenantId, id);
  }
}
