import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { AuditService } from './audit.service.js';

export class AuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** `invoice`, `user`, … or a full action such as `invoice.deleted`. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z_.]{1,60}$/i)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** The organization's activity log (its Admin only). */
@Controller('audit-log')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('users:read')
  @AdminOnly()
  list(@Query() query: AuditQueryDto, @CurrentActor() actor: Actor) {
    return this.audit.listForTenant(actor.tenantId, query);
  }

  @Get('actors')
  @RequirePermissions('users:read')
  @AdminOnly()
  actors(@CurrentActor() actor: Actor) {
    return this.audit.actorsForTenant(actor.tenantId);
  }
}

/** What platform admins did. */
@Controller('platform/audit-log')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, PlatformAdminGuard)
export class PlatformAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('platform:read')
  list(@Query() query: AuditQueryDto) {
    return this.audit.listForPlatform(query);
  }
}
