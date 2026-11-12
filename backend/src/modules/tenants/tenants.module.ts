import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity.js';
import { TenantSettings } from './entities/tenant-settings.entity.js';
import { TenantsService } from './tenants.service.js';

// Global: tenant settings (branding, currency, upload limits, Translate key)
// are read across many modules.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantSettings])],
  providers: [TenantsService],
  exports: [TenantsService, TypeOrmModule],
})
export class TenantsModule {}
