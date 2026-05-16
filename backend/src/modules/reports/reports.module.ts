import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';
import { Client } from '../clients/entities/client.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Job, JobUser, Invoice, Client])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
