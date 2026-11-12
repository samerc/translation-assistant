import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesService } from './roles.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';

/** Read-only: the fixed roles a tenant admin assigns, and what each may do. */
@Controller('roles')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
@AdminOnly()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('roles:read')
  findAll() {
    return this.rolesService.findTenantRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles:read')
  findAllPermissions() {
    return this.rolesService.findTenantPermissions();
  }

  @Get(':id')
  @RequirePermissions('roles:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findTenantRole(id);
  }
}
