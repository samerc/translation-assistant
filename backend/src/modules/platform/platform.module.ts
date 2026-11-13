import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { SignupCleanupScheduler } from './signup-cleanup.scheduler.js';
import { TenantDeletionService } from './tenant-deletion.service.js';
import { TenantPurgeScheduler } from './tenant-purge.scheduler.js';
import { OrganizationController } from './organization.controller.js';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Tenant]),
    AuthModule,
    MailModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [PlatformController, OrganizationController],
  providers: [
    PlatformService,
    SignupCleanupScheduler,
    TenantDeletionService,
    TenantPurgeScheduler,
  ],
})
export class PlatformModule {}
