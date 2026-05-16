import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoicesService } from './invoices.service.js';
import { InvoiceExportService } from './invoice-export.service.js';
import { InvoicesController } from './invoices.controller.js';
import { Invoice } from './entities/invoice.entity.js';
import { InvoiceItem } from './entities/invoice-item.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceItem, Job, JobUser, Client, AppSettings])],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceExportService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
