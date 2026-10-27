import { Module } from '@nestjs/common';
import { TranslateController } from './translate.controller.js';
import { SettingsModule } from '../settings/settings.module.js';

@Module({
  imports: [SettingsModule],
  controllers: [TranslateController],
})
export class TranslateModule {}
