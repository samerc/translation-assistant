import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatesService } from './templates.service.js';
import { TemplatesController } from './templates.controller.js';
import { Template } from './entities/template.entity.js';
import { TemplateField } from './entities/template-field.entity.js';
import { TemplateFieldLabel } from './entities/template-field-label.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, TemplateField, TemplateFieldLabel]),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
