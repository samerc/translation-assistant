import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsService } from './jobs.service.js';
import { JobsController } from './jobs.controller.js';
import { Job } from './entities/job.entity.js';
import { JobUser } from './entities/job-user.entity.js';
import { JobFile } from './entities/job-file.entity.js';
import { JobLineItem } from './entities/job-line-item.entity.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';
import { Document } from '../documents/entities/document.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe.js';
import { JobAccessGuard } from '../../common/guards/job-access.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobUser, JobFile, JobLineItem, AppSettings, Document, Template])],
  controllers: [JobsController],
  providers: [JobsService, FileValidationPipe, JobAccessGuard],
  exports: [JobsService],
})
export class JobsModule {}
