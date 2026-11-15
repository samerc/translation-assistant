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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesService } from './roles.service.js';
import { CreateRoleDto, UpdateRoleDto } from './dto/role.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { Audited } from '../audit/audited.decorator.js';

/**
 * The organization's roles (its Admin): the platform defaults, its customized
 * copies of them and its own roles.
 */
@Controller('roles')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
@AdminOnly()
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  findAll(@CurrentActor() actor: Actor) {
    return this.roles.findForTenant(actor.tenantId);
  }

  /** Areas and actions a role can be given. */
  @Get('permissions')
  @RequirePermissions('roles:read')
  catalogue() {
    return this.roles.catalogue();
  }

  @Post()
  @RequirePermissions('roles:create')
  @Audited('role.created', {
    target: 'role',
    body: ['name', 'jobScope', 'seesPrices'],
  })
  create(@Body() dto: CreateRoleDto, @CurrentActor() actor: Actor) {
    return this.roles.createForTenant(actor.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('roles:update')
  @Audited('role.updated', {
    target: 'role',
    body: ['name', 'jobScope', 'seesPrices'],
    bodyKeys: true,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.roles.updateForTenant(actor.tenantId, id, dto);
  }

  /** Back to the platform default (for a customized default). */
  @Post(':id/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('roles:update')
  @Audited('role.reset', { target: 'role' })
  reset(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.roles.resetForTenant(actor.tenantId, id);
  }

  @Delete(':id')
  @RequirePermissions('roles:delete')
  @Audited('role.deleted', { target: 'role' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.roles.removeForTenant(actor.tenantId, id);
  }
}

/** The default roles every organization starts with (platform admin). */
@Controller('platform/roles')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, PlatformAdminGuard)
export class PlatformRolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('platform:read')
  findAll() {
    return this.roles.findDefaults();
  }

  @Get('permissions')
  @RequirePermissions('platform:read')
  catalogue() {
    return this.roles.catalogue();
  }

  @Post()
  @RequirePermissions('platform:update')
  @Audited('role.created', {
    target: 'role',
    body: ['name', 'jobScope', 'seesPrices'],
  })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.createDefault(dto);
  }

  @Patch(':id')
  @RequirePermissions('platform:update')
  @Audited('role.updated', {
    target: 'role',
    body: ['name', 'jobScope', 'seesPrices'],
    bodyKeys: true,
  })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.updateDefault(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('platform:update')
  @Audited('role.deleted', { target: 'role' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.removeDefault(id);
  }
}
