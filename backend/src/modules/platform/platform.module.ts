import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformController } from './platform.controller.js';
import { PlatformService } from './platform.service.js';
import { User } from '../users/entities/user.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { MailModule } from '../mail/mail.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session]),
    AuthModule,
    MailModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
