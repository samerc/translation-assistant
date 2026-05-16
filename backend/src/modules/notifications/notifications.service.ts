import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between, In } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  async findAll(userId: string, query: { isRead?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(Math.max(1, query.limit || 20), 100);

    const where: Record<string, unknown> = { userId };
    if (query.isRead === 'true') where.isRead = true;
    if (query.isRead === 'false') where.isRead = false;

    const [data, total] = await this.notificationRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
  }

  // ── Notification creators (called by other services) ──

  async notifyJobStatusChange(
    job: { id: string; jobNumber: string; title: string },
    oldStatus: string,
    newStatus: string,
    changedByUserId: string,
  ): Promise<void> {
    const assignments = await this.jobUserRepository.find({ where: { jobId: job.id } });
    const notifications = assignments
      .filter((a) => a.userId !== changedByUserId)
      .map((a) =>
        this.notificationRepository.create({
          userId: a.userId,
          type: 'job_status_change',
          title: `Job status updated`,
          message: `${job.jobNumber} "${job.title}" changed from ${oldStatus} to ${newStatus}`,
          link: `/jobs/${job.id}`,
        }),
      );
    if (notifications.length > 0) {
      await this.notificationRepository.save(notifications);
    }
  }

  async notifyJobAssigned(
    jobId: string,
    jobNumber: string,
    jobTitle: string,
    assignedUserId: string,
  ): Promise<void> {
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: assignedUserId,
        type: 'job_assigned',
        title: 'Assigned to job',
        message: `You have been assigned to ${jobNumber} "${jobTitle}"`,
        link: `/jobs/${jobId}`,
      }),
    );
  }

  async notifyInvoiceOverdue(invoice: {
    id: string;
    invoiceNumber: string;
    createdByUserId: string;
  }): Promise<void> {
    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: invoice.createdByUserId,
        type: 'invoice_overdue',
        title: 'Invoice overdue',
        message: `Invoice ${invoice.invoiceNumber} is past due`,
        link: `/invoices/${invoice.id}`,
      }),
    );
  }

  // ── Scheduled checks ──

  async checkDeadlines(): Promise<void> {
    const now = new Date();
    const threeDaysLater = new Date(now);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const nowStr = now.toISOString().split('T')[0];
    const futureStr = threeDaysLater.toISOString().split('T')[0];

    // Find jobs with deadline in next 3 days that are still active
    const jobs = await this.jobRepository.find({
      where: {
        deadline: Between(nowStr, futureStr),
        status: In(['quote', 'accepted', 'in_progress']),
      },
    });

    for (const job of jobs) {
      const assignments = await this.jobUserRepository.find({ where: { jobId: job.id } });

      for (const assignment of assignments) {
        // Check if we already sent a deadline notification for this job+user in last 24 hours
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const existing = await this.notificationRepository
          .createQueryBuilder('n')
          .where('n.user_id = :userId', { userId: assignment.userId })
          .andWhere('n.type = :type', { type: 'deadline_approaching' })
          .andWhere('n.link = :link', { link: `/jobs/${job.id}` })
          .andWhere('n.createdAt > :since', { since: oneDayAgo })
          .getCount();

        if (existing === 0) {
          await this.notificationRepository.save(
            this.notificationRepository.create({
              userId: assignment.userId,
              type: 'deadline_approaching',
              title: 'Deadline approaching',
              message: `${job.jobNumber} "${job.title}" is due on ${job.deadline}`,
              link: `/jobs/${job.id}`,
            }),
          );
        }
      }
    }
  }

  async checkOverdueInvoices(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    const overdueInvoices = await this.invoiceRepository.find({
      where: {
        status: 'sent',
        dueDate: LessThan(today),
      },
    });

    for (const invoice of overdueInvoices) {
      invoice.status = 'overdue';
      await this.invoiceRepository.save(invoice);

      if (invoice.createdByUserId) {
        await this.notifyInvoiceOverdue(invoice);
      }
    }
  }
}
