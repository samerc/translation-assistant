import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';
import { Client } from '../clients/entities/client.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Job, JobUser, Template, Invoice])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
