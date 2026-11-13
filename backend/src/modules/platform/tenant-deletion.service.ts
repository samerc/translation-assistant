import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { rm } from 'fs/promises';
import { join } from 'path';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { TenantSettings } from '../tenants/entities/tenant-settings.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { User } from '../users/entities/user.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { InviteToken } from '../auth/entities/invite-token.entity.js';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity.js';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity.js';
import { Client } from '../clients/entities/client.entity.js';
import { Job } from '../jobs/entities/job.entity.js';
import { Document } from '../documents/entities/document.entity.js';
import { Invoice } from '../invoices/entities/invoice.entity.js';
import { Template } from '../templates/entities/template.entity.js';
import { FreeformJobType } from '../settings/entities/freeform-job-type.entity.js';
import { LabelOption } from '../settings/entities/label-option.entity.js';
import { Language } from '../settings/entities/language.entity.js';
import { Notification } from '../notifications/entities/notification.entity.js';
import { SettingsService } from '../settings/settings.service.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { ROLE_ADMIN, ROLE_PLATFORM_ADMIN } from '../../common/tenancy/roles.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What an organization holds; "empty" = none of these. Users don't count. */
export interface TenantDataCounts {
  clients: number;
  jobs: number;
  documents: number;
  invoices: number;
  templates: number;
}

/**
 * Deleting an organization:
 *  1. Its admin *requests* deletion (password + typed name). Nothing changes yet.
 *  2. The platform admin approves (or declines). An empty organization is
 *     deleted at once; one with data becomes `closing` — nobody can sign in —
 *     and is purged after the platform's `deletionGraceDays`. Until then the
 *     platform admin can restore it (or purge it right away).
 *  3. A nightly job purges organizations whose `deleteAfter` has passed.
 *
 * Billing (not built yet): a request does not stop billing; approval
 * (→ closing) is where the subscription must be cancelled / not renewed, and
 * restoring resumes it. Add that here when plans arrive.
 */
@Injectable()
export class TenantDeletionService {
  private readonly logger = new Logger('TenantDeletion');

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly tenantsService: TenantsService,
    private readonly settingsService: SettingsService,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  async dataCounts(tenantId: string): Promise<TenantDataCounts> {
    const m = this.dataSource.manager;
    const where = { tenantId };
    const [clients, jobs, documents, invoices, templates] = await Promise.all([
      m.count(Client, { where }),
      m.count(Job, { where }),
      m.count(Document, { where }),
      m.count(Invoice, { where }),
      m.count(Template, { where }),
    ]);
    return { clients, jobs, documents, invoices, templates };
  }

  private static isEmpty(c: TenantDataCounts): boolean {
    return Object.values(c).every((n) => n === 0);
  }

  // ── The organization's admin ──

  async getRequest(tenantId: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant.deletionRequestedAt) return { requested: false as const };
    const by = tenant.deletionRequestedByUserId
      ? await this.userRepository.findOne({
          where: { id: tenant.deletionRequestedByUserId },
        })
      : null;
    return {
      requested: true as const,
      requestedAt: tenant.deletionRequestedAt,
      requestedBy: by ? `${by.firstName} ${by.lastName}`.trim() : null,
      reason: tenant.deletionReason,
    };
  }

  async request(
    tenantId: string,
    userId: string,
    dto: { confirmName: string; password: string; reason?: string },
  ) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (tenant.status !== 'active') {
      throw new BadRequestException('This organization can’t be deleted now');
    }
    if (tenant.deletionRequestedAt) {
      throw new BadRequestException('Deletion has already been requested');
    }
    if (dto.confirmName.trim() !== tenant.name.trim()) {
      throw new BadRequestException(
        'Type the organization name exactly as shown to confirm',
      );
    }
    if (!(await this.authService.verifyPassword(userId, dto.password))) {
      throw new UnauthorizedException('Wrong password');
    }
    const user = await this.userRepository.findOneOrFail({
      where: { id: userId },
    });
    tenant.deletionRequestedAt = new Date();
    tenant.deletionRequestedByUserId = userId;
    tenant.deletionReason = dto.reason?.trim() || null;
    await this.tenantRepository.save(tenant);
    this.logger.log(
      `[TENANT_DELETION_REQUESTED] tenantId=${tenantId} userId=${userId}`,
    );
    await this.notifyPlatformAdmins(
      tenant,
      `${user.firstName} ${user.lastName} (${user.email})`,
    );
    return this.getRequest(tenantId);
  }

  async withdraw(tenantId: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant.deletionRequestedAt || tenant.status !== 'active') {
      throw new BadRequestException('There is no deletion request to withdraw');
    }
    this.clearRequest(tenant);
    await this.tenantRepository.save(tenant);
    this.logger.log(`[TENANT_DELETION_WITHDRAWN] tenantId=${tenantId}`);
    return { requested: false as const };
  }

  // ── The platform admin ──

  /**
   * Approve deletion (whether or not the organization asked): empty → deleted
   * now; otherwise closing for the grace period.
   */
  async approve(
    tenantId: string,
  ): Promise<{ deleted: true } | { deleted: false; tenant: Tenant }> {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (tenant.status === 'closing') {
      throw new BadRequestException('Already scheduled for deletion');
    }
    if (tenant.status === 'pending') {
      throw new BadRequestException('Reject a sign-up instead of deleting it');
    }
    const admins = await this.adminEmails(tenantId);
    if (TenantDeletionService.isEmpty(await this.dataCounts(tenantId))) {
      await this.purge(tenantId);
      for (const email of admins) {
        this.send(this.mailService.sendTenantDeleted(email, tenant.name));
      }
      return { deleted: true };
    }
    const { deletionGraceDays } =
      await this.settingsService.getPlatformSettings();
    tenant.status = 'closing';
    tenant.deleteAfter = new Date(
      Date.now() + (deletionGraceDays || 30) * 86_400_000,
    );
    await this.tenantRepository.save(tenant);
    await this.revokeSessions(tenantId);
    this.logger.log(
      `[TENANT_CLOSING] tenantId=${tenantId} deleteAfter=${tenant.deleteAfter.toISOString()}`,
    );
    for (const email of admins) {
      this.send(
        this.mailService.sendDeletionScheduled(
          email,
          tenant.name,
          tenant.deleteAfter,
        ),
      );
    }
    return { deleted: false, tenant };
  }

  async decline(tenantId: string, message?: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (!tenant.deletionRequestedAt || tenant.status === 'closing') {
      throw new BadRequestException('There is no open deletion request');
    }
    const requester = tenant.deletionRequestedByUserId
      ? await this.userRepository.findOne({
          where: { id: tenant.deletionRequestedByUserId },
        })
      : null;
    this.clearRequest(tenant);
    await this.tenantRepository.save(tenant);
    this.logger.log(`[TENANT_DELETION_DECLINED] tenantId=${tenantId}`);
    if (requester) {
      this.send(
        this.mailService.sendDeletionDeclined(
          requester.email,
          tenant.name,
          message?.trim() || null,
        ),
      );
    }
    return tenant;
  }

  /** Undo an approved deletion during the grace period. */
  async restore(tenantId: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (tenant.status !== 'closing') {
      throw new BadRequestException(
        'Only organizations scheduled for deletion can be restored',
      );
    }
    tenant.status = 'active';
    tenant.deleteAfter = null;
    this.clearRequest(tenant);
    await this.tenantRepository.save(tenant);
    this.logger.log(`[TENANT_RESTORED] tenantId=${tenantId}`);
    for (const email of await this.adminEmails(tenantId)) {
      this.send(this.mailService.sendTenantRestored(email, tenant.name));
    }
    return tenant;
  }

  /** Skip the rest of the grace period. */
  async purgeNow(tenantId: string): Promise<void> {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (tenant.status !== 'closing') {
      throw new BadRequestException(
        'Schedule the organization for deletion first',
      );
    }
    await this.purge(tenantId);
  }

  /** Nightly: purge organizations whose grace period is over. */
  async purgeDue(): Promise<number> {
    const due = await this.tenantRepository.find({
      where: { status: 'closing', deleteAfter: LessThanOrEqual(new Date()) },
    });
    for (const t of due) await this.purge(t.id);
    return due.length;
  }

  /**
   * Permanently remove the organization: every row (children go by FK
   * cascade, in an order no restrictive FK blocks), then its upload folder.
   */
  private async purge(tenantId: string): Promise<void> {
    if (!UUID.test(tenantId)) throw new BadRequestException('Bad id');
    await this.dataSource.transaction(async (m) => {
      const where = { tenantId };
      await m.delete(Invoice, where); // items, payments
      await m.delete(Document, where); // field values
      await m.delete(Job, where); // line items, files, job_users
      await m.delete(Template, where); // fields, labels
      await m.delete(Client, where); // emails, phones, addresses, contacts, passports
      await m.delete(FreeformJobType, where);
      await m.delete(LabelOption, where);
      await m.delete(Language, where);
      await m.delete(InviteToken, where);
      const userIds = (await m.find(User, { where, select: { id: true } })).map(
        (u) => u.id,
      );
      if (userIds.length) {
        const mine = { userId: In(userIds) };
        await m.delete(EmailVerificationToken, mine);
        await m.delete(PasswordResetToken, mine);
        await m.delete(Session, mine);
        await m.delete(Notification, mine);
        await m.delete(User, { id: In(userIds) });
      }
      await m.delete(TenantSettings, where);
      await m.delete(Tenant, tenantId);
    });
    // Files only after the rows are gone (a failed transaction keeps both).
    await rm(join(process.cwd(), 'uploads', tenantId), {
      recursive: true,
      force: true,
    }).catch((err: unknown) =>
      this.logger.error(
        `[TENANT_FILES_DELETE_FAILED] tenantId=${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    this.logger.log(`[TENANT_PURGED] tenantId=${tenantId}`);
  }

  // ── helpers ──

  private clearRequest(tenant: Tenant) {
    tenant.deletionRequestedAt = null;
    tenant.deletionRequestedByUserId = null;
    tenant.deletionReason = null;
  }

  private async adminEmails(tenantId: string): Promise<string[]> {
    const admins = await this.userRepository.find({
      where: {
        tenantId,
        isActive: true,
        emailVerified: true,
        role: { name: ROLE_ADMIN },
      },
      relations: { role: true },
    });
    return admins.map((a) => a.email);
  }

  private async revokeSessions(tenantId: string) {
    const ids = (
      await this.userRepository.find({
        where: { tenantId },
        select: { id: true },
      })
    ).map((u) => u.id);
    if (ids.length) {
      await this.sessionRepository.update(
        { userId: In(ids), revoked: false },
        { revoked: true },
      );
    }
  }

  private async notifyPlatformAdmins(tenant: Tenant, requestedBy: string) {
    const admins = await this.userRepository.find({
      where: {
        tenantId: IsNull(),
        isActive: true,
        role: { name: ROLE_PLATFORM_ADMIN },
      },
      relations: { role: true },
    });
    if (!admins.length) return;
    const repo = this.dataSource.getRepository(Notification);
    await repo.save(
      admins.map((a) =>
        repo.create({
          userId: a.id,
          type: 'tenant_deletion_request',
          title: 'Deletion requested',
          message: `${tenant.name}: ${requestedBy} asked to delete the organization.`,
          link: `/platform/tenants/${tenant.id}`,
        }),
      ),
    );
    for (const a of admins) {
      this.send(
        this.mailService.sendDeletionRequested(
          a.email,
          tenant.name,
          requestedBy,
          tenant.deletionReason,
        ),
      );
    }
  }

  private send(p: Promise<void>) {
    p.catch((err: unknown) =>
      this.logger.error(
        `[TENANT_DELETION_EMAIL_FAILED]: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
