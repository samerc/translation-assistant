import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesService } from './roles.service.js';
import {
  PlatformRolesController,
  RolesController,
} from './roles.controller.js';
import { Role } from './entities/role.entity.js';
import { Permission } from './entities/permission.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission])],
  controllers: [RolesController, PlatformRolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
