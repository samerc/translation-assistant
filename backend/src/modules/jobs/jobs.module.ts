import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobsService } from './jobs.service.js';
import { JobsController } from './jobs.controller.js';
import { Job } from './entities/job.entity.js';
import { JobUser } from './entities/job-user.entity.js';
import { JobFile } from './entities/job-file.entity.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobUser, JobFile, AppSettings])],
  controllers: [JobsController],
  providers: [JobsService, FileValidationPipe],
  exports: [JobsService],
})
export class JobsModule {}
