import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { TenantDeletionService } from './tenant-deletion.service.js';
import { RequestDeletionDto } from './dto/platform.dto.js';

/**
 * The caller's own organization (its Admin): asking the platform admin to
 * delete it. Nothing is removed until the platform admin approves.
 */
@Controller('organization')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
export class OrganizationController {
  constructor(private readonly deletion: TenantDeletionService) {}

  @Get('deletion-request')
  @RequirePermissions('settings:update')
  @AdminOnly()
  getRequest(@CurrentActor() actor: Actor) {
    return this.deletion.getRequest(actor.tenantId);
  }

  @Post('deletion-request')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('settings:update')
  @AdminOnly()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  request(@Body() dto: RequestDeletionDto, @CurrentActor() actor: Actor) {
    return this.deletion.request(actor.tenantId, actor.userId, dto);
  }

  @Delete('deletion-request')
  @RequirePermissions('settings:update')
  @AdminOnly()
  withdraw(@CurrentActor() actor: Actor) {
    return this.deletion.withdraw(actor.tenantId);
  }
}
