import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { AppSettings } from './entities/app-settings.entity.js';
import { Language } from './entities/language.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettings, Language])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
