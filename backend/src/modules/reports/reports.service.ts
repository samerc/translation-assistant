import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';
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
      .where('job.status IN (:...statuses)', { statuses: ['quote', 'accepted', 'in_progress'] });
    if (!isAdmin) {
      activeJobsQb.innerJoin('job.assignedUsers', 'ju', 'ju.user_id = :userId', { userId });
    }
    const activeJobs = await activeJobsQb.getCount();

    // Monthly revenue (paid invoices this month)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;

    const revenueQb = this.invoiceRepository
      .createQueryBuilder('inv')
      .select('COALESCE(SUM(inv.paidAmount), 0)', 'revenue')
      .where('inv.status = :status', { status: 'paid' })
      .andWhere('inv.paidAt BETWEEN :start AND :end', { start: monthStart, end: monthEnd + ' 23:59:59' });
    if (!isAdmin) {
      revenueQb.andWhere('inv.created_by_user_id = :userId', { userId });
    }
    const revenueResult = await revenueQb.getRawOne();
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
      .where('job.deadline BETWEEN :today AND :weekEnd', { today: todayStr, weekEnd: weekEndStr })
      .andWhere('job.status NOT IN (:...excluded)', { excluded: ['paid', 'cancelled', 'lost'] });
    if (!isAdmin) {
      dueQb.innerJoin('job.assignedUsers', 'ju2', 'ju2.user_id = :userId', { userId });
    }
    const dueThisWeek = await dueQb.getCount();

    // Get currency from first paid invoice or default
    const currencyResult = await this.invoiceRepository
      .createQueryBuilder('inv')
      .select('inv.currency', 'currency')
      .limit(1)
      .getRawOne();

    return {
      activeJobs,
      monthlyRevenue,
      pendingInvoices,
      dueThisWeek,
      currency: currencyResult?.currency || 'USD',
    };
  }

  async getRevenue(userId: string, isAdmin: boolean, period: string, from?: string, to?: string) {
    const qb = this.invoiceRepository
      .createQueryBuilder('inv')
      .where('inv.status = :status', { status: 'paid' });

    if (!isAdmin) {
      qb.andWhere('inv.created_by_user_id = :userId', { userId });
    }

    if (from) qb.andWhere('inv.paidAt >= :from', { from });
    if (to) qb.andWhere('inv.paidAt <= :to', { to: to + ' 23:59:59' });

    if (period === 'weekly') {
      qb.select('YEARWEEK(inv.paidAt, 1)', 'period')
        .addSelect('SUM(inv.paidAmount)', 'revenue')
        .groupBy('YEARWEEK(inv.paidAt, 1)')
        .orderBy('period', 'ASC');
    } else {
      qb.select("DATE_FORMAT(inv.paidAt, '%Y-%m')", 'period')
        .addSelect('SUM(inv.paidAmount)', 'revenue')
        .groupBy("DATE_FORMAT(inv.paidAt, '%Y-%m')")
        .orderBy('period', 'ASC');
    }

    const results = await qb.getRawMany();
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
      .addSelect('COALESCE(SUM(CASE WHEN inv.status = :paid THEN inv.paidAmount ELSE 0 END), 0)', 'totalRevenue')
      .setParameter('paid', 'paid')
      .groupBy('client.id')
      .addGroupBy('client.name')
      .orderBy('totalRevenue', 'DESC');

    if (!isAdmin) {
      qb.andWhere('inv.created_by_user_id = :userId', { userId });
    }

    const results = await qb.getRawMany();
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
      qb.innerJoin('job.assignedUsers', 'ju', 'ju.user_id = :userId', { userId });
    }

    const results = await qb.getRawMany();
    return results.map((r) => ({
      status: r.status,
      count: Number(r.count),
    }));
  }
}
