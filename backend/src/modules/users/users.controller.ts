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

@Controller('users')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  @AdminOnly()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  @RequirePermissions('users:read')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    // Non-admins can only view their own profile via this endpoint
    if (user.role?.name !== 'Admin' && id !== user.id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermissions('users:create')
  @AdminOnly()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  @AdminOnly()
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch('profile/me')
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateUserDto) {
    // Any authenticated user can update their own profile (limited fields)
    const { roleId, isActive, ...safeDto } = dto;
    return this.usersService.update(user.id, safeDto);
  }

  @Post('change-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  changePassword(@CurrentUser() user: User, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Patch(':id/activate')
  @RequirePermissions('users:update')
  @AdminOnly()
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.activate(id);
  }

  @Patch(':id/deactivate')
  @RequirePermissions('users:update')
  @AdminOnly()
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (id === user.id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    return this.usersService.deactivate(id);
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @AdminOnly()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    if (id === user.id) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    return this.usersService.remove(id);
  }
}
