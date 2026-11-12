import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Tenant, TenantStatus } from './entities/tenant.entity.js';
import { TenantSettings } from './entities/tenant-settings.entity.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantSettings)
    private readonly settingsRepository: Repository<TenantSettings>,
  ) {}

  /** A tenant and its settings row, in the caller's transaction. */
  async create(
    manager: EntityManager,
    input: {
      name: string;
      status: TenantStatus;
      source: 'platform' | 'signup';
    },
  ): Promise<Tenant> {
    const tenant = await manager.save(
      manager.create(Tenant, {
        name: input.name,
        status: input.status,
        source: input.source,
        approvedAt: input.status === 'active' ? new Date() : null,
      }),
    );
    await manager.save(
      manager.create(TenantSettings, {
        tenantId: tenant.id,
        companyName: input.name,
      }),
    );
    return tenant;
  }

  async findOne(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Organization not found');
    return tenant;
  }

  /** The tenant's settings row (created on first use if it is missing). */
  async getSettings(tenantId: string): Promise<TenantSettings> {
    const existing = await this.settingsRepository.findOne({
      where: { tenantId },
    });
    if (existing) return existing;
    await this.settingsRepository
      .createQueryBuilder()
      .insert()
      .values({ tenantId })
      .orIgnore()
      .execute();
    return this.settingsRepository.findOneOrFail({ where: { tenantId } });
  }

  async updateSettings(
    tenantId: string,
    patch: Partial<TenantSettings>,
  ): Promise<TenantSettings> {
    const settings = await this.getSettings(tenantId);
    // Never let a patch move the row to another tenant.
    const { id: _id, tenantId: _t, ...safe } = patch;
    Object.assign(settings, safe);
    return this.settingsRepository.save(settings);
  }

  /** This tenant's Google Translate key — each tenant uses (and pays for) its own. */
  async getTranslateApiKey(tenantId: string): Promise<string | null> {
    const settings = await this.getSettings(tenantId);
    return settings.googleTranslateApiKey || null;
  }
}
