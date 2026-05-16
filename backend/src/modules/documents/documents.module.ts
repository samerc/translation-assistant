import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service.js';
import { ExportService } from './export.service.js';
import { DocumentsController } from './documents.controller.js';
import { Document } from './entities/document.entity.js';
import { DocumentFieldValue } from './entities/document-field-value.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Document, DocumentFieldValue, JobUser])],
  controllers: [DocumentsController],
  providers: [DocumentsService, ExportService],
  exports: [DocumentsService, ExportService],
})
export class DocumentsModule {}
