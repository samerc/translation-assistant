import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from './entities/user.entity.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { Audited } from '../audit/audited.decorator.js';

@Controller('users')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  @AdminOnly()
  findAll(@CurrentActor() actor: Actor) {
    return this.usersService.findAll(actor.tenantId);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    // Non-admins can only view their own profile via this endpoint
    if (!actor.isAdmin && id !== actor.userId) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.usersService.findInTenant(id, actor.tenantId);
  }

  @Post()
  @Audited('user.created', {
    target: 'user',
    body: ['email'],
    refs: [{ key: 'role', type: 'role', from: 'body', name: 'roleId' }],
  })
  @RequirePermissions('users:create')
  @AdminOnly()
  create(@Body() dto: CreateUserDto, @CurrentActor() actor: Actor) {
    return this.usersService.create(dto, actor.tenantId);
  }

  @Patch(':id')
  @Audited('user.updated', {
    target: 'user',
    bodyKeys: true,
    refs: [{ key: 'role', type: 'role', from: 'body', name: 'roleId' }],
  })
  @RequirePermissions('users:update')
  @AdminOnly()
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentActor() actor: Actor,
  ) {
    // Same rule as /deactivate: an admin can't lock themselves out (and since
    // every caller is an admin, this also keeps at least one active admin).
    if (id === actor.userId && (dto.isActive !== undefined || dto.roleId)) {
      throw new ForbiddenException(
        'You cannot change your own role or active status',
      );
    }
    return this.usersService.update(id, dto, { tenantId: actor.tenantId });
  }

  // Any authenticated user can read their own profile — no users:read needed
  // (Translators don't have it).
  @Get('profile/me')
  getProfile(@CurrentUser() user: User) {
    return this.usersService.findOne(user.id);
  }

  @Patch('profile/me')
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
    // Any authenticated user can update their own profile (limited fields)
    const { roleId, isActive, ...safeDto } = dto;
    return this.usersService.updateSelf(user.id, safeDto);
  }

  @Post('change-password')
  @Audited('user.password_changed')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Patch(':id/activate')
  @Audited('user.activated', { target: 'user' })
  @RequirePermissions('users:update')
  @AdminOnly()
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    return this.usersService.activate(id, { tenantId: actor.tenantId });
  }

  @Patch(':id/deactivate')
  @Audited('user.deactivated', { target: 'user' })
  @RequirePermissions('users:update')
  @AdminOnly()
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    if (id === actor.userId) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    return this.usersService.deactivate(id, { tenantId: actor.tenantId });
  }

  @Post(':id/reset-password')
  @Audited('user.password_reset', { target: 'user' })
  @RequirePermissions('users:update')
  @AdminOnly()
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: Actor,
  ) {
    if (id === actor.userId) {
      throw new ForbiddenException('Use Change password for your own account');
    }
    return this.usersService.resetPasswordByAdmin(id, {
      tenantId: actor.tenantId,
    });
  }

  @Delete(':id')
  @Audited('user.deleted', { target: 'user' })
  @RequirePermissions('users:delete')
  @AdminOnly()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    if (id === actor.userId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    return this.usersService.remove(id, actor.tenantId);
  }
}
