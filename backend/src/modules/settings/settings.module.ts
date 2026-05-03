import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { AppSettings } from './entities/app-settings.entity.js';
import { Language } from './entities/language.entity.js';
import { LabelOption } from './entities/label-option.entity.js';
import { FreeformJobType } from './entities/freeform-job-type.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettings, Language, LabelOption, FreeformJobType])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
