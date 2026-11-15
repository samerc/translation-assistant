import { RolesModule } from '../roles/roles.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { User } from './entities/user.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { Role } from '../roles/entities/role.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session, Role]), RolesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
