import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentsService } from './documents.service.js';
import { DocumentsController } from './documents.controller.js';
import { Document } from './entities/document.entity.js';
import { DocumentFieldValue } from './entities/document-field-value.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Document, DocumentFieldValue])],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
