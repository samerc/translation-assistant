import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(Template)
    private readonly templateRepository: Repository<Template>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async search(q: string, userId: string, isAdmin: boolean) {
    const like = `%${q}%`;

    // Build client query - non-admins can only see clients they have jobs with
    const clientQb = this.clientRepository
      .createQueryBuilder('c')
      .select(['c.id', 'c.name', 'c.type'])
      .where('(c.name LIKE :q OR c.taxId LIKE :q)', { q: like });
    if (!isAdmin) {
      clientQb.andWhere(
        `EXISTS (SELECT 1 FROM jobs j INNER JOIN job_users ju ON ju.job_id = j.id AND ju.user_id = :userId WHERE j.client_id = c.id)`,
        { userId },
      );
    }

    const clientCountQb = this.clientRepository
      .createQueryBuilder('c')
      .where('(c.name LIKE :q OR c.taxId LIKE :q)', { q: like });
    if (!isAdmin) {
      clientCountQb.andWhere(
        `EXISTS (SELECT 1 FROM jobs j INNER JOIN job_users ju ON ju.job_id = j.id AND ju.user_id = :userId WHERE j.client_id = c.id)`,
        { userId },
      );
    }

    // Build job query
    const jobQb = this.jobRepository
      .createQueryBuilder('j')
      .leftJoinAndSelect('j.client', 'client')
      .where('(j.title LIKE :q OR j.jobNumber LIKE :q)', { q: like });
    if (!isAdmin) {
      jobQb.innerJoin('j.assignedUsers', 'ju', 'ju.user_id = :userId', { userId });
    }

    const jobCountQb = this.jobRepository
      .createQueryBuilder('j')
      .where('(j.title LIKE :q OR j.jobNumber LIKE :q)', { q: like });
    if (!isAdmin) {
      jobCountQb.innerJoin('j.assignedUsers', 'ju', 'ju.user_id = :userId', { userId });
    }

    // Templates - visible to all with templates:read permission (they need it to do their work)
    const templateQb = this.templateRepository
      .createQueryBuilder('t')
      .select(['t.id', 't.name', 't.type'])
      .where('t.name LIKE :q AND t.isActive = true', { q: like });

    const templateCountQb = this.templateRepository
      .createQueryBuilder('t')
      .where('t.name LIKE :q AND t.isActive = true', { q: like });

    // Build invoice query
    const invoiceQb = this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .where('(inv.invoiceNumber LIKE :q OR client.name LIKE :q)', { q: like });
    if (!isAdmin) {
      invoiceQb.andWhere(
        `(inv.created_by_user_id = :userId OR EXISTS (
          SELECT 1 FROM invoice_items ii
          INNER JOIN job_users juu ON juu.job_id = ii.job_id AND juu.user_id = :userId
          WHERE ii.invoice_id = inv.id
        ))`,
        { userId },
      );
    }

    const invoiceCountQb = this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoin('inv.client', 'client')
      .where('(inv.invoiceNumber LIKE :q OR client.name LIKE :q)', { q: like });
    if (!isAdmin) {
      invoiceCountQb.andWhere(
        `(inv.created_by_user_id = :userId OR EXISTS (
          SELECT 1 FROM invoice_items ii
          INNER JOIN job_users juu ON juu.job_id = ii.job_id AND juu.user_id = :userId
          WHERE ii.invoice_id = inv.id
        ))`,
        { userId },
      );
    }

    const [clients, clientCount, jobs, jobCount, templates, templateCount, invoices, invoiceCount] =
      await Promise.all([
        clientQb.take(5).getMany(),
        clientCountQb.getCount(),
        jobQb.take(5).getMany(),
        jobCountQb.getCount(),
        templateQb.take(5).getMany(),
        templateCountQb.getCount(),
        invoiceQb.take(5).getMany(),
        invoiceCountQb.getCount(),
      ]);

    return {
      clients: clients.map((c) => ({ id: c.id, name: c.name, type: c.type })),
      jobs: jobs.map((j) => ({ id: j.id, jobNumber: j.jobNumber, title: j.title, status: j.status, clientName: j.client?.name })),
      templates: templates.map((t) => ({ id: t.id, name: t.name, type: t.type })),
      invoices: invoices.map((inv) => ({ id: inv.id, invoiceNumber: inv.invoiceNumber, clientName: inv.client?.name, status: inv.status })),
      counts: {
        clients: clientCount,
        jobs: jobCount,
        templates: templateCount,
        invoices: invoiceCount,
      },
    };
  }
}
