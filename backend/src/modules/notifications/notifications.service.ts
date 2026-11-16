import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between, In } from 'typeorm';
import { Notification } from './entities/notification.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { JobUser } from '../jobs/entities/job-user.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';
import { User } from '../users/entities/user.entity.js';
import { TenantSettings } from '../tenants/entities/tenant-settings.entity.js';
import { MailService } from '../mail/mail.service.js';
import { formatDateOnly } from '../../common/utils/display-format.js';
import { ROLE_ADMIN } from '../../common/tenancy/roles.js';

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
    private readonly mailService: MailService,
  ) {}

  private readonly logger = new Logger('Notifications');

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

  /**
   * A job moved to another status. `notify` comes from the new status: the job's
   * people, the organization's admins, both, or nobody (core stages: the job's
   * people). Organization statuses also email the recipients who keep
   * "Email me reminders" on.
   */
  async notifyJobStatusChange(
    job: { id: string; jobNumber: string; title: string; tenantId: string },
    from: { stage: string; name: string | null },
    to: { stage: string; name: string | null },
    notify: string,
    changedByUserId: string,
  ): Promise<void> {
    if (notify === 'none') return;
    const users = this.notificationRepository.manager.getRepository(User);
    const ids = new Set<string>();
    if (notify === 'assignees' || notify === 'both') {
      const assignments = await this.jobUserRepository.find({
        where: { jobId: job.id },
      });
      assignments.forEach((a) => ids.add(a.userId));
    }
    if (notify === 'admins' || notify === 'both') {
      const admins = await users.find({
        where: {
          tenantId: job.tenantId,
          isActive: true,
          role: { name: ROLE_ADMIN, isBuiltIn: true },
        },
        relations: { role: true },
      });
      admins.forEach((u) => ids.add(u.id));
    }
    ids.delete(changedByUserId);
    if (ids.size === 0) return;

    const recipients = await users.find({
      where: { id: In([...ids]), tenantId: job.tenantId, isActive: true },
    });
    if (recipients.length === 0) return;
    const changer = await users.findOne({ where: { id: changedByUserId } });
    const by = changer ? ` by ${changer.firstName} ${changer.lastName}` : '';
    const label = (x: { stage: string; name: string | null }) =>
      x.name ?? statusLabel(x.stage);
    const message = `${job.jobNumber} "${job.title}" moved from ${label(from)} to ${label(to)}${by}`;
    const link = `/jobs/${job.id}`;
    await this.notificationRepository.save(
      recipients.map((u) =>
        this.notificationRepository.create({
          userId: u.id,
          type: 'job_status_change',
          title: to.name ? `Job is now ${to.name}` : 'Job status updated',
          message,
          link,
        }),
      ),
    );
    if (!to.name) return;
    for (const u of recipients.filter((r) => r.emailReminders)) {
      this.mailService
        .sendJobStatusChange(u.email, u.firstName, {
          title: `${job.jobNumber} is now ${to.name}`,
          message,
          link,
        })
        .catch((err: Error) =>
          this.logger.warn(`Status email to ${u.id} failed: ${err.message}`),
        );
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

  /** Creates the deadline reminders; returns them (for the reminder email). */
  async checkDeadlines(): Promise<Notification[]> {
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

    if (jobs.length === 0) return [];

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

    // Dates in each organization's own format.
    const formats = new Map(
      (
        await this.notificationRepository.manager.find(TenantSettings, {
          where: { tenantId: In([...new Set(jobs.map((j) => j.tenantId))]) },
          select: { tenantId: true, dateFormat: true },
        })
      ).map((s) => [s.tenantId, s.dateFormat]),
    );

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
              message: `${job.jobNumber} "${job.title}" is due on ${formatDateOnly(job.deadline, formats.get(job.tenantId))}`,
              link: `/jobs/${job.id}`,
            }),
          );
        }
      }
    }

    if (notificationsToCreate.length > 0) {
      await this.notificationRepository.save(notificationsToCreate);
    }
    return notificationsToCreate;
  }

  /** Marks overdue invoices; returns the reminders it created. */
  async checkOverdueInvoices(): Promise<Notification[]> {
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

    if (overdueInvoices.length === 0) return [];

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
    return notifications;
  }

  /**
   * One email per person with the reminders just created — for those who keep
   * `emailReminders` on, are active, and whose organization is active. A failed
   * send is logged and skipped (the in-app notification is there either way).
   */
  async emailReminders(created: Notification[]): Promise<number> {
    const byUser = new Map<string, Notification[]>();
    for (const n of created) {
      byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
    }
    if (byUser.size === 0) return 0;
    const users = await this.notificationRepository.manager.find(User, {
      where: {
        id: In([...byUser.keys()]),
        isActive: true,
        emailReminders: true,
      },
      relations: { tenant: true },
    });
    let sent = 0;
    for (const user of users) {
      if (!user.tenant || user.tenant.status !== 'active') continue;
      const items = byUser.get(user.id) ?? [];
      try {
        await this.mailService.sendReminders(user.email, user.firstName, items);
        sent++;
      } catch (err) {
        this.logger.warn(
          `Reminder email to user ${user.id} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return sent;
  }
}
