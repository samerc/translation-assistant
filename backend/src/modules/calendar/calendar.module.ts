import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarService } from './calendar.service.js';
import { CalendarController } from './calendar.controller.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobUser, Invoice])],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
