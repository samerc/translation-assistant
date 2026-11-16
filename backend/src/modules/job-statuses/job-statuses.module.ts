import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobStatus } from './entities/job-status.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobStatusesService } from './job-statuses.service.js';
import {
  JobStatusesController,
  PlatformJobStatusesController,
} from './job-statuses.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([JobStatus, Job])],
  controllers: [JobStatusesController, PlatformJobStatusesController],
  providers: [JobStatusesService],
  exports: [JobStatusesService],
})
export class JobStatusesModule {}
