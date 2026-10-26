import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';
import { AppSettings } from '../settings/entities/app-settings.entity.js';
import { InvoicePayment } from '../invoices/entities/invoice-payment.entity.js';
import { Client } from '../clients/entities/client.entity.js';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async getDashboardStats(userId: string, isAdmin: boolean) {
    // Active jobs
    const activeJobsQb = this.jobRepository
      .createQueryBuilder('job')
      .where('job.status IN (:...statuses)', {
        statuses: ['quote', 'accepted', 'in_progress'],
      });
    if (!isAdmin) {
      activeJobsQb.innerJoin(
        'job.assignedUsers',
        'ju',
        'ju.user_id = :userId',
        { userId },
      );
    }
    const activeJobs = await activeJobsQb.getCount();

    // Monthly revenue: payments received this month
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

    const revenueQb = this.paymentsQuery()
      .select('COALESCE(SUM(p.amount), 0)', 'revenue')
      .where('p.paidAt BETWEEN :start AND :end', {
        start: monthStart,
        end: monthEnd,
      });
    if (!isAdmin) {
      revenueQb.andWhere('inv.created_by_user_id = :userId', { userId });
    }
    const revenueResult = await revenueQb.getRawOne<{
      revenue: string | number | null;
    }>();
    const monthlyRevenue = Number(revenueResult?.revenue || 0);

    // Pending invoices
    const pendingQb = this.invoiceRepository
      .createQueryBuilder('inv')
      .where('inv.status IN (:...statuses)', { statuses: ['sent', 'overdue'] });
    if (!isAdmin) {
      pendingQb.andWhere('inv.created_by_user_id = :userId', { userId });
    }
    const pendingInvoices = await pendingQb.getCount();

    // Due this week
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const todayStr = now.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const dueQb = this.jobRepository
      .createQueryBuilder('job')
      .where('job.deadline BETWEEN :today AND :weekEnd', {
        today: todayStr,
        weekEnd: weekEndStr,
      })
      .andWhere('job.status NOT IN (:...excluded)', {
        excluded: ['paid', 'cancelled', 'lost'],
      });
    if (!isAdmin) {
      dueQb.innerJoin('job.assignedUsers', 'ju2', 'ju2.user_id = :userId', {
        userId,
      });
    }
    const dueThisWeek = await dueQb.getCount();

    // Revenue is shown in the app's base currency (Settings > General).
    const settings = await this.invoiceRepository.manager.find(AppSettings, {
      take: 1,
    });

    return {
      activeJobs,
      monthlyRevenue,
      pendingInvoices,
      dueThisWeek,
      currency: settings[0]?.baseCurrency || 'USD',
    };
  }

  /** Payments joined to their invoice (for the per-user creator filter). */
  private paymentsQuery() {
    return this.invoiceRepository.manager
      .createQueryBuilder(InvoicePayment, 'p')
      .innerJoin(Invoice, 'inv', 'inv.id = p.invoice_id');
  }

  async getRevenue(
    userId: string,
    isAdmin: boolean,
    period: string,
    from?: string,
    to?: string,
  ) {
    const qb = this.paymentsQuery().where('1 = 1');

    if (!isAdmin) {
      qb.andWhere('inv.created_by_user_id = :userId', { userId });
    }

    if (from) qb.andWhere('p.paidAt >= :from', { from });
    if (to) qb.andWhere('p.paidAt <= :to', { to });

    if (period === 'weekly') {
      qb.select('YEARWEEK(p.paidAt, 1)', 'period')
        .addSelect('SUM(p.amount)', 'revenue')
        .groupBy('YEARWEEK(p.paidAt, 1)')
        .orderBy('period', 'ASC');
    } else {
      qb.select("DATE_FORMAT(p.paidAt, '%Y-%m')", 'period')
        .addSelect('SUM(p.amount)', 'revenue')
        .groupBy("DATE_FORMAT(p.paidAt, '%Y-%m')")
        .orderBy('period', 'ASC');
    }

    const results = await qb.getRawMany<{
      period: string;
      revenue: string | null;
    }>();
    return results.map((r) => ({
      period: r.period,
      revenue: Number(r.revenue || 0),
    }));
  }

  async getByClient(userId: string, isAdmin: boolean) {
    const qb = this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoin('inv.client', 'client')
      .select('client.id', 'clientId')
      .addSelect('client.name', 'clientName')
      .addSelect('COUNT(DISTINCT inv.id)', 'invoiceCount')
      // paidAmount = payments received so far, partial ones included
      .addSelect('COALESCE(SUM(inv.paidAmount), 0)', 'totalRevenue')
      .groupBy('client.id')
      .addGroupBy('client.name')
      .orderBy('totalRevenue', 'DESC');

    if (!isAdmin) {
      qb.andWhere('inv.created_by_user_id = :userId', { userId });
    }

    const results = await qb.getRawMany<{
      clientId: string;
      clientName: string;
      invoiceCount: string | number;
      totalRevenue: string | number;
    }>();
    return results.map((r) => ({
      clientId: r.clientId,
      clientName: r.clientName,
      invoiceCount: Number(r.invoiceCount),
      totalRevenue: Number(r.totalRevenue),
    }));
  }

  async getJobStatus(userId: string, isAdmin: boolean) {
    const qb = this.jobRepository
      .createQueryBuilder('job')
      .select('job.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('job.status');

    if (!isAdmin) {
      qb.innerJoin('job.assignedUsers', 'ju', 'ju.user_id = :userId', {
        userId,
      });
    }

    const results = await qb.getRawMany<{
      status: string;
      count: string | number;
    }>();
    return results.map((r) => ({
      status: r.status,
      count: Number(r.count),
    }));
  }
}
