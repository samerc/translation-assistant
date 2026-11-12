import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { AppSettings } from './entities/app-settings.entity.js';
import { Language } from './entities/language.entity.js';
import { LabelOption } from './entities/label-option.entity.js';
import { FreeformJobType } from './entities/freeform-job-type.entity.js';
import { TenantSettings } from '../tenants/entities/tenant-settings.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto.js';
import { CreateLanguageDto, UpdateLanguageDto } from './dto/language.dto.js';
import {
  CreateLabelOptionDto,
  UpdateLabelOptionDto,
  LabelCategory,
} from './dto/label-option.dto.js';
import {
  CreateFreeformJobTypeDto,
  UpdateFreeformJobTypeDto,
} from './dto/freeform-job-type.dto.js';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
    @InjectRepository(Language)
    private readonly languageRepository: Repository<Language>,
    @InjectRepository(LabelOption)
    private readonly labelOptionRepository: Repository<LabelOption>,
    @InjectRepository(FreeformJobType)
    private readonly freeformJobTypeRepository: Repository<FreeformJobType>,
    private readonly tenantsService: TenantsService,
  ) {}

  // ── Platform settings (single row) ──

  async getPlatformSettings(): Promise<AppSettings> {
    let settings = await this.settingsRepository
      .find({ take: 1 })
      .then((r) => r[0] ?? null);
    if (!settings) {
      settings = this.settingsRepository.create({});
      await this.settingsRepository.save(settings);
    }
    return settings;
  }

  async updatePlatformSettings(
    dto: UpdatePlatformSettingsDto,
  ): Promise<AppSettings> {
    const settings = await this.getPlatformSettings();
    // An empty SMTP password means "leave unchanged" (the GET response never returns it).
    const patch = { ...dto };
    if (patch.smtpPass === '' || patch.smtpPass === undefined) {
      delete patch.smtpPass;
    }
    Object.assign(settings, patch);
    return this.settingsRepository.save(settings);
  }

  // ── Tenant settings ──

  getTenantSettings(tenantId: string): Promise<TenantSettings> {
    return this.tenantsService.getSettings(tenantId);
  }

  async updateTenantSettings(
    tenantId: string,
    dto: UpdateSettingsDto,
  ): Promise<TenantSettings> {
    const patch: Partial<TenantSettings> = { ...dto };
    // '' = leave the stored key unchanged (GET never returns it); null = remove it.
    if (dto.googleTranslateApiKey === '') {
      delete patch.googleTranslateApiKey;
    } else if (typeof dto.googleTranslateApiKey === 'string') {
      patch.googleTranslateApiKey = dto.googleTranslateApiKey.trim();
    }
    return this.tenantsService.updateSettings(tenantId, patch);
  }

  /** The tenant's Google Translate key (no platform-wide fallback: each tenant pays its own). */
  getTranslateApiKey(tenantId: string): Promise<string | null> {
    return this.tenantsService.getTranslateApiKey(tenantId);
  }

  // ── Languages: global (tenant_id NULL) + a tenant's own ──

  /** Languages a tenant can use: the global list plus its own. */
  findLanguagesForTenant(tenantId: string): Promise<Language[]> {
    return this.languageRepository
      .createQueryBuilder('l')
      .where(
        new Brackets((w) =>
          w
            .where('l.tenant_id IS NULL')
            .orWhere('l.tenant_id = :tenantId', { tenantId }),
        ),
      )
      .orderBy('l.name', 'ASC')
      .getMany();
  }

  /** A language this tenant may reference (global or its own), or null. */
  findLanguageForTenant(
    id: string,
    tenantId: string,
  ): Promise<Language | null> {
    return this.languageRepository
      .createQueryBuilder('l')
      .where('l.id = :id', { id })
      .andWhere(
        new Brackets((w) =>
          w
            .where('l.tenant_id IS NULL')
            .orWhere('l.tenant_id = :tenantId', { tenantId }),
        ),
      )
      .getOne();
  }

  findGlobalLanguages(): Promise<Language[]> {
    return this.languageRepository.find({
      where: { tenantId: IsNull() },
      order: { name: 'ASC' },
    });
  }

  private async findGlobalLanguage(id: string): Promise<Language> {
    const language = await this.languageRepository.findOne({
      where: { id, tenantId: IsNull() },
    });
    if (!language) throw new NotFoundException('Language not found');
    return language;
  }

  async createGlobalLanguage(dto: CreateLanguageDto): Promise<Language> {
    // The unique (tenant_id, code) index can't see NULL duplicates.
    const clash = await this.languageRepository.count({
      where: { tenantId: IsNull(), code: dto.code },
    });
    if (clash) {
      throw new BadRequestException(
        `A language with code "${dto.code}" already exists`,
      );
    }
    return this.languageRepository.save(
      this.languageRepository.create({ ...dto, tenantId: null }),
    );
  }

  async updateGlobalLanguage(
    id: string,
    dto: UpdateLanguageDto,
  ): Promise<Language> {
    const language = await this.findGlobalLanguage(id);
    Object.assign(language, dto);
    return this.languageRepository.save(language);
  }

  async removeGlobalLanguage(id: string): Promise<void> {
    const language = await this.findGlobalLanguage(id);
    await this.languageRepository.remove(language);
  }

  // ── Label options: global + a tenant's own ──

  async findAllLabels(tenantId: string): Promise<Record<string, string[]>> {
    const labels = await this.labelOptionRepository
      .createQueryBuilder('o')
      .where(
        new Brackets((w) =>
          w
            .where('o.tenant_id IS NULL')
            .orWhere('o.tenant_id = :tenantId', { tenantId }),
        ),
      )
      .orderBy('o.category', 'ASC')
      .addOrderBy('o.sortOrder', 'ASC')
      .addOrderBy('o.value', 'ASC')
      .getMany();

    const grouped: Record<string, string[]> = {
      email: [],
      phone: [],
      address: [],
    };
    for (const label of labels) {
      if (!grouped[label.category]) grouped[label.category] = [];
      if (!grouped[label.category].includes(label.value)) {
        grouped[label.category].push(label.value);
      }
    }
    return grouped;
  }

  findGlobalLabels(category?: LabelCategory): Promise<LabelOption[]> {
    return this.labelOptionRepository.find({
      where: { tenantId: IsNull(), ...(category ? { category } : {}) },
      order: { category: 'ASC', sortOrder: 'ASC', value: 'ASC' },
    });
  }

  createGlobalLabel(dto: CreateLabelOptionDto): Promise<LabelOption> {
    return this.labelOptionRepository.save(
      this.labelOptionRepository.create({ ...dto, tenantId: null }),
    );
  }

  async updateGlobalLabel(
    id: string,
    dto: UpdateLabelOptionDto,
  ): Promise<LabelOption> {
    const label = await this.labelOptionRepository.findOne({
      where: { id, tenantId: IsNull() },
    });
    if (!label) throw new NotFoundException('Label option not found');
    Object.assign(label, dto);
    return this.labelOptionRepository.save(label);
  }

  async removeGlobalLabel(id: string): Promise<void> {
    const label = await this.labelOptionRepository.findOne({
      where: { id, tenantId: IsNull() },
    });
    if (!label) throw new NotFoundException('Label option not found');
    await this.labelOptionRepository.remove(label);
  }

  // ── Freeform job types (per tenant: they carry prices) ──

  findAllFreeformJobTypes(tenantId: string): Promise<FreeformJobType[]> {
    return this.freeformJobTypeRepository.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  createFreeformJobType(
    tenantId: string,
    dto: CreateFreeformJobTypeDto,
  ): Promise<FreeformJobType> {
    return this.freeformJobTypeRepository.save(
      this.freeformJobTypeRepository.create({ ...dto, tenantId }),
    );
  }

  private async findFreeformJobType(
    tenantId: string,
    id: string,
  ): Promise<FreeformJobType> {
    const type = await this.freeformJobTypeRepository.findOne({
      where: { id, tenantId },
    });
    if (!type) throw new NotFoundException('Freeform job type not found');
    return type;
  }

  async updateFreeformJobType(
    tenantId: string,
    id: string,
    dto: UpdateFreeformJobTypeDto,
  ): Promise<FreeformJobType> {
    const type = await this.findFreeformJobType(tenantId, id);
    Object.assign(type, dto);
    return this.freeformJobTypeRepository.save(type);
  }

  async removeFreeformJobType(tenantId: string, id: string): Promise<void> {
    const type = await this.findFreeformJobType(tenantId, id);
    await this.freeformJobTypeRepository.remove(type);
  }
}
