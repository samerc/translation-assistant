import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';

export interface CalendarEvent {
  id: string;
  type: 'job_deadline' | 'invoice_due';
  title: string;
  date: string;
  status: string;
  color: string;
  link: string;
}

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async getEvents(userId: string, isAdmin: boolean, month: number, year: number): Promise<CalendarEvent[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Job deadlines
    const jobQb = this.jobRepository
      .createQueryBuilder('job')
      .leftJoinAndSelect('job.client', 'client')
      .where('job.deadline BETWEEN :start AND :end', { start: startDate, end: endDate })
      .andWhere('job.status NOT IN (:...excluded)', { excluded: ['paid', 'cancelled', 'lost'] });

    if (!isAdmin) {
      jobQb.innerJoin('job.assignedUsers', 'ju', 'ju.user_id = :userId', { userId });
    }

    const jobs = await jobQb.getMany();

    const jobEvents: CalendarEvent[] = jobs.map((job) => ({
      id: job.id,
      type: 'job_deadline',
      title: `${job.jobNumber} — ${job.title}`,
      date: job.deadline,
      status: job.status,
      color: 'primary',
      link: `/jobs/${job.id}`,
    }));

    // Invoice due dates
    const invQb = this.invoiceRepository
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .where('inv.dueDate BETWEEN :start AND :end', { start: startDate, end: endDate })
      .andWhere('inv.status NOT IN (:...excluded)', { excluded: ['paid', 'cancelled'] });

    if (!isAdmin) {
      invQb.andWhere(
        `(inv.created_by_user_id = :userId OR EXISTS (
          SELECT 1 FROM invoice_items ii
          INNER JOIN job_users juu ON juu.job_id = ii.job_id AND juu.user_id = :userId
          WHERE ii.invoice_id = inv.id
        ))`,
        { userId },
      );
    }

    const invoices = await invQb.getMany();

    const invoiceEvents: CalendarEvent[] = invoices.map((inv) => ({
      id: inv.id,
      type: 'invoice_due',
      title: `${inv.invoiceNumber} — ${inv.client?.name || 'Invoice'}`,
      date: inv.dueDate,
      status: inv.status,
      color: inv.status === 'overdue' ? 'danger' : 'warning',
      link: `/invoices/${inv.id}`,
    }));

    return [...jobEvents, ...invoiceEvents].sort((a, b) => a.date.localeCompare(b.date));
  }
}
