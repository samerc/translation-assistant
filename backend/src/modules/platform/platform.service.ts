import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Tenant, TenantStatus } from '../tenants/entities/tenant.entity.js';
import { TenantSettings } from '../tenants/entities/tenant-settings.entity.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { Session } from '../auth/entities/session.entity.js';
import { InviteToken } from '../auth/entities/invite-token.entity.js';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity.js';
import { PasswordResetToken } from '../auth/entities/password-reset-token.entity.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { attachRelationCount } from '../../common/utils/relation-count.js';
import { likeContains } from '../../common/utils/like.js';
import { ROLE_ADMIN } from '../../common/tenancy/roles.js';
import { CreateTenantDto, UpdateTenantDto } from './dto/platform.dto.js';

/**
 * What the platform admin can do: create, approve, rename, suspend and remove
 * organizations, and manage their user accounts. It reads users (names,
 * emails, roles) — never clients, jobs, documents or invoices.
 */
@Injectable()
export class PlatformService {
  private readonly logger = new Logger('Platform');

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly tenantsService: TenantsService,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly dataSource: DataSource,
  ) {}

  async listTenants(query: { search?: string; status?: TenantStatus }) {
    const qb = this.tenantRepository
      .createQueryBuilder('t')
      .orderBy('t.createdAt', 'DESC');
    if (query.status) qb.andWhere('t.status = :status', query);
    if (query.search) {
      qb.andWhere('t.name LIKE :search', {
        search: likeContains(query.search),
      });
    }
    const tenants = await qb.getMany();
    await attachRelationCount(
      tenants,
      this.userRepository,
      'tenantId',
      'userCount',
    );
    // Each organization's admins (contact for approval / support).
    const admins = tenants.length
      ? await this.userRepository
          .createQueryBuilder('u')
          .innerJoin('u.role', 'r', 'r.name = :admin', { admin: ROLE_ADMIN })
          .select([
            'u.id',
            'u.email',
            'u.firstName',
            'u.lastName',
            'u.tenantId',
          ])
          .where('u.tenant_id IN (:...ids)', { ids: tenants.map((t) => t.id) })
          .orderBy('u.createdAt', 'ASC')
          .getMany()
      : [];
    const counts = await this.tenantRepository
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('t.status')
      .getRawMany<{ status: TenantStatus; count: string | number }>();
    return {
      data: tenants.map((t) => ({
        ...t,
        admins: admins
          .filter((a) => a.tenantId === t.id)
          .map((a) => ({
            id: a.id,
            email: a.email,
            name: `${a.firstName} ${a.lastName}`.trim(),
          })),
      })),
      counts: Object.fromEntries(
        counts.map((c) => [c.status, Number(c.count)]),
      ) as Partial<Record<TenantStatus, number>>,
    };
  }

  async getTenant(id: string) {
    const tenant = await this.tenantsService.findOne(id);
    const users = await this.userRepository.find({
      where: { tenantId: id },
      relations: { role: true },
      order: { createdAt: 'ASC' },
    });
    return {
      ...tenant,
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role?.name,
        isActive: u.isActive,
        emailVerified: u.emailVerified,
        mustChangePassword: u.mustChangePassword,
        createdAt: u.createdAt,
      })),
    };
  }

  /** A new, active organization; its first admin gets an invite link by email. */
  async createTenant(dto: CreateTenantDto) {
    const email = dto.adminEmail.trim().toLowerCase();
    if (await this.userRepository.count({ where: { email } })) {
      throw new BadRequestException(
        'That email already has an account — use another address for the admin',
      );
    }
    const tenant = await this.dataSource.transaction((manager) =>
      this.tenantsService.create(manager, {
        name: dto.name.trim(),
        status: 'active',
        source: 'platform',
      }),
    );
    const invite = await this.inviteToTenant(tenant.id, email);
    this.logger.log(`[TENANT_CREATED] tenantId=${tenant.id}`);
    return { tenant, invite };
  }

  /** Invite someone into an organization — by default as its Admin. */
  async inviteToTenant(tenantId: string, email: string, roleId?: string) {
    const tenant = await this.tenantsService.findOne(tenantId);
    if (tenant.status !== 'active') {
      throw new BadRequestException(
        'Approve or reactivate the organization before inviting people to it',
      );
    }
    const role =
      roleId ??
      (
        await this.dataSource
          .getRepository(Role)
          .findOneOrFail({ where: { name: ROLE_ADMIN } })
      ).id;
    return this.authService.createInvite(email, role, tenantId);
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    const tenant = await this.tenantsService.findOne(id);
    if (dto.name) tenant.name = dto.name.trim();
    return this.tenantRepository.save(tenant);
  }

  async approve(id: string) {
    const tenant = await this.tenantsService.findOne(id);
    if (tenant.status !== 'pending') {
      throw new BadRequestException(
        'Only organizations waiting for approval can be approved',
      );
    }
    tenant.status = 'active';
    tenant.approvedAt = new Date();
    await this.tenantRepository.save(tenant);
    this.logger.log(`[TENANT_APPROVED] tenantId=${id}`);
    // Tell its (verified) admins they can log in now.
    const admins = await this.userRepository.find({
      where: { tenantId: id, emailVerified: true, role: { name: ROLE_ADMIN } },
      relations: { role: true },
    });
    for (const a of admins) {
      this.mailService
        .sendTenantApproved(a.email, tenant.name)
        .catch((err: unknown) =>
          this.logger.error(
            `[TENANT_APPROVED_EMAIL_FAILED]: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }
    return tenant;
  }

  /** Suspending blocks every user of the organization immediately. */
  async suspend(id: string) {
    const tenant = await this.tenantsService.findOne(id);
    if (tenant.status !== 'active') {
      throw new BadRequestException(
        'Only active organizations can be suspended',
      );
    }
    tenant.status = 'suspended';
    await this.tenantRepository.save(tenant);
    const userIds = (
      await this.userRepository.find({
        where: { tenantId: id },
        select: { id: true },
      })
    ).map((u) => u.id);
    if (userIds.length) {
      await this.sessionRepository.update(
        { userId: In(userIds), revoked: false },
        { revoked: true },
      );
    }
    this.logger.log(`[TENANT_SUSPENDED] tenantId=${id}`);
    return tenant;
  }

  async reactivate(id: string) {
    const tenant = await this.tenantsService.findOne(id);
    if (tenant.status !== 'suspended') {
      throw new BadRequestException(
        'Only suspended organizations can be reactivated',
      );
    }
    tenant.status = 'active';
    await this.tenantRepository.save(tenant);
    this.logger.log(`[TENANT_REACTIVATED] tenantId=${id}`);
    return tenant;
  }

  /**
   * Turn down a sign-up: removes the pending organization and its (only)
   * account. Pending organizations can't log in, so they hold no data.
   */
  async reject(id: string): Promise<void> {
    const tenant = await this.tenantsService.findOne(id);
    if (tenant.status !== 'pending') {
      throw new BadRequestException(
        'Only organizations waiting for approval can be rejected — suspend an active one instead',
      );
    }
    await this.dataSource.transaction(async (manager) => {
      const userIds = (
        await manager.find(User, {
          where: { tenantId: id },
          select: { id: true },
        })
      ).map((u) => u.id);
      if (userIds.length) {
        const mine = { userId: In(userIds) };
        await manager.delete(EmailVerificationToken, mine);
        await manager.delete(PasswordResetToken, mine);
        await manager.delete(Session, mine);
        await manager.delete(User, { id: In(userIds) });
      }
      await manager.delete(InviteToken, { tenantId: id });
      await manager.delete(TenantSettings, { tenantId: id });
      await manager.delete(Tenant, id);
    });
    this.logger.log(`[TENANT_REJECTED] tenantId=${id}`);
  }

  async getUser(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user || !user.tenantId) throw new NotFoundException('User not found');
    return user;
  }
}
