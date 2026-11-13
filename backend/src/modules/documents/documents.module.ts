import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service.js';
import { ExportService } from './export.service.js';
import { TemplateTestController } from './template-test.controller.js';
import { DocumentsController } from './documents.controller.js';
import { Document } from './entities/document.entity.js';
import { DocumentFieldValue } from './entities/document-field-value.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { Language } from '../settings/entities/language.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentFieldValue,
      JobUser,
      Template,
      Language,
    ]),
  ],
  controllers: [DocumentsController, TemplateTestController],
  providers: [DocumentsService, ExportService],
  exports: [DocumentsService, ExportService],
})
export class DocumentsModule {}
