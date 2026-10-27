import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between, In } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';
import { User } from '../users/entities/user.entity.js';

const JOB_STATUS_LABELS: Record<string, string> = {
  quote: 'Quote',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  lost: 'Lost',
  cancelled: 'Cancelled',
};
const statusLabel = (s: string) => JOB_STATUS_LABELS[s] ?? s;

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

  async findAll(
    userId: string,
    query: { isRead?: string; page?: number; limit?: number },
  ) {
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
    const assignments = await this.jobUserRepository.find({
      where: { jobId: job.id },
    });
    const recipients = assignments.filter((a) => a.userId !== changedByUserId);
    if (recipients.length === 0) return;
    const changer = changedByUserId
      ? await this.notificationRepository.manager
          .getRepository(User)
          .findOne({ where: { id: changedByUserId } })
      : null;
    const by = changer ? ` by ${changer.firstName} ${changer.lastName}` : '';
    const notifications = recipients.map((a) =>
      this.notificationRepository.create({
        userId: a.userId,
        type: 'job_status_change',
        title: `Job status updated`,
        message: `${job.jobNumber} "${job.title}" moved from ${statusLabel(oldStatus)} to ${statusLabel(newStatus)}${by}`,
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

    if (jobs.length === 0) return;

    const jobIds = jobs.map((j) => j.id);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Batch fetch all assignments and recent notifications
    const [allAssignments, recentNotifications] = await Promise.all([
      this.jobUserRepository.find({ where: { jobId: In(jobIds) } }),
      this.notificationRepository.find({
        where: {
          type: 'deadline_approaching',
          createdAt: Between(oneDayAgo, now),
        },
        select: {
          userId: true,
          link: true,
        },
      }),
    ]);

    // Build set of already-notified user+job pairs
    const notifiedSet = new Set(
      recentNotifications.map((n) => `${n.userId}:${n.link}`),
    );

    // Group assignments by job
    const assignmentsByJob = new Map<string, typeof allAssignments>();
    for (const a of allAssignments) {
      if (!assignmentsByJob.has(a.jobId)) assignmentsByJob.set(a.jobId, []);
      assignmentsByJob.get(a.jobId)!.push(a);
    }

    // Batch create notifications
    const notificationsToCreate: Notification[] = [];
    for (const job of jobs) {
      const assignments = assignmentsByJob.get(job.id) || [];
      for (const a of assignments) {
        const key = `${a.userId}:/jobs/${job.id}`;
        if (!notifiedSet.has(key)) {
          notificationsToCreate.push(
            this.notificationRepository.create({
              userId: a.userId,
              type: 'deadline_approaching',
              title: 'Deadline approaching',
              message: `${job.jobNumber} "${job.title}" is due on ${job.deadline}`,
              link: `/jobs/${job.id}`,
            }),
          );
        }
      }
    }

    if (notificationsToCreate.length > 0) {
      await this.notificationRepository.save(notificationsToCreate);
    }
  }

  async checkOverdueInvoices(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];

    // Find overdue invoices before updating (need IDs for notifications)
    const overdueInvoices = await this.invoiceRepository.find({
      where: { status: 'sent', dueDate: LessThan(today) },
      select: {
        id: true,
        invoiceNumber: true,
        createdByUserId: true,
      },
    });

    if (overdueInvoices.length === 0) return;

    // Batch update all to overdue in one query. Still require 'sent': an invoice
    // paid off since the find above must not be flipped back to overdue.
    await this.invoiceRepository.update(
      { id: In(overdueInvoices.map((i) => i.id)), status: 'sent' },
      { status: 'overdue' },
    );

    // Batch create notifications — only for creators that still exist: one
    // deleted user would fail the FK and drop every notification in the batch.
    const creatorIds = [
      ...new Set(overdueInvoices.map((i) => i.createdByUserId).filter(Boolean)),
    ];
    const existing = new Set(
      creatorIds.length
        ? (
            await this.notificationRepository.manager.find(User, {
              where: { id: In(creatorIds) },
              select: { id: true },
            })
          ).map((u) => u.id)
        : [],
    );
    const notifications = overdueInvoices
      .filter((inv) => existing.has(inv.createdByUserId))
      .map((inv) =>
        this.notificationRepository.create({
          userId: inv.createdByUserId,
          type: 'invoice_overdue',
          title: 'Invoice overdue',
          message: `Invoice ${inv.invoiceNumber} is past due`,
          link: `/invoices/${inv.id}`,
        }),
      );

    if (notifications.length > 0) {
      await this.notificationRepository.save(notifications);
    }
  }
}
