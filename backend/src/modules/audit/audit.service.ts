import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, LessThan, Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity.js';
import type { AuditTargetType } from './audited.decorator.js';
import { likeContains } from '../../common/utils/like.js';

/** How long entries are kept. */
export const AUDIT_RETENTION_DAYS = 730;

/** Where each kind of target lives: its label and (if any) its tenant column. Fixed strings only. */
const TARGETS: Record<
  AuditTargetType,
  { table: string; label: string; tenant: string | null }
> = {
  client: { table: 'clients', label: 'x.name', tenant: 'x.tenant_id' },
  job: {
    table: 'jobs',
    label: "CONCAT(x.jobNumber, ' · ', x.title)",
    tenant: 'x.tenant_id',
  },
  invoice: {
    table: 'invoices',
    label: 'x.invoiceNumber',
    tenant: 'x.tenant_id',
  },
  template: { table: 'templates', label: 'x.name', tenant: 'x.tenant_id' },
  document: {
    table: 'documents',
    label:
      "(SELECT CONCAT(j.jobNumber, ' · ', t.name) FROM jobs j JOIN templates t ON t.id = x.template_id WHERE j.id = x.job_id)",
    tenant: 'x.tenant_id',
  },
  user: {
    table: 'users',
    label: "CONCAT(x.firstName, ' ', x.lastName, ' (', x.email, ')')",
    tenant: 'x.tenant_id',
  },
  invite: { table: 'invite_tokens', label: 'x.email', tenant: 'x.tenant_id' },
  freeformType: {
    table: 'freeform_job_types',
    label: 'x.name',
    tenant: 'x.tenant_id',
  },
  tenant: { table: 'tenants', label: 'x.name', tenant: 'x.id' },
  role: { table: 'roles', label: 'x.name', tenant: 'x.tenant_id' },
  jobStatus: {
    table: 'job_statuses',
    label: 'x.name',
    tenant: 'x.tenant_id',
  },
  language: { table: 'languages', label: 'x.name', tenant: 'x.tenant_id' },
  label: { table: 'label_options', label: 'x.value', tenant: 'x.tenant_id' },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditEntryInput {
  tenantId: string | null;
  actorUserId: string | null;
  actorName: string;
  actorRole: string | null;
  byPlatform: boolean;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

export interface AuditListQuery {
  page?: number;
  limit?: number;
  /** Prefix of the action, e.g. `invoice` or `user.role_changed`. */
  action?: string;
  actorUserId?: string;
  search?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  private cleaning = false;

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** The record's label and tenant, or null when it doesn't exist. */
  async describe(
    type: AuditTargetType,
    id: unknown,
  ): Promise<{ label: string | null; tenantId: string | null } | null> {
    if (typeof id !== 'string' || !UUID.test(id)) return null;
    const t = TARGETS[type];
    const rows: { label: string | null; tenantId: string | null }[] =
      await this.dataSource.query(
        `SELECT ${t.label} AS label, ${t.tenant ?? 'NULL'} AS tenantId FROM ${t.table} x WHERE x.id = ? LIMIT 1`,
        [id],
      );
    return rows[0] ?? null;
  }

  async record(entry: AuditEntryInput): Promise<void> {
    await this.repo.save(
      this.repo.create({
        ...entry,
        actorName: entry.actorName.slice(0, 200),
        targetLabel: entry.targetLabel?.slice(0, 255) ?? null,
      }),
    );
  }

  /** An organization's log, newest first (its Admin). */
  listForTenant(tenantId: string, q: AuditListQuery) {
    return this.list(q, (qb) =>
      qb.where('a.tenantId = :tenantId', { tenantId }),
    );
  }

  /** What platform admins did (platform-wide and on organizations). */
  listForPlatform(q: AuditListQuery) {
    return this.list(q, (qb) => qb.where('a.byPlatform = true'));
  }

  private async list(
    q: AuditListQuery,
    scope: (qb: ReturnType<Repository<AuditLog>['createQueryBuilder']>) => void,
  ) {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    const qb = this.repo.createQueryBuilder('a');
    scope(qb);
    if (q.action)
      qb.andWhere('a.action LIKE :action', {
        action: `${q.action.replace(/[%_\\]/g, '')}%`,
      });
    if (q.actorUserId)
      qb.andWhere('a.actorUserId = :actor', { actor: q.actorUserId });
    if (q.search && q.search.trim()) {
      const term = likeContains(q.search.trim());
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('a.targetLabel LIKE :term', { term })
            .orWhere('a.actorName LIKE :term', { term }),
        ),
      );
    }
    const [data, total] = await qb
      .orderBy('a.createdAt', 'DESC')
      .addOrderBy('a.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, total, page, limit };
  }

  /** People who appear in an organization's log (for the "who" filter). */
  async actorsForTenant(tenantId: string) {
    const rows = await this.repo
      .createQueryBuilder('a')
      .select('a.actorUserId', 'id')
      .addSelect('MAX(a.actorName)', 'name')
      .addSelect('MAX(a.byPlatform)', 'byPlatform')
      .where('a.tenantId = :tenantId', { tenantId })
      .andWhere('a.actorUserId IS NOT NULL')
      .groupBy('a.actorUserId')
      .getRawMany<{ id: string; name: string; byPlatform: number | string }>();
    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        byPlatform: Number(r.byPlatform) === 1,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  @Cron('15 4 * * *')
  async removeOld(): Promise<number> {
    if (this.cleaning) return 0;
    this.cleaning = true;
    try {
      const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 86_400_000);
      const res = await this.repo.delete({ createdAt: LessThan(cutoff) });
      if (res.affected)
        this.logger.log(
          `Removed ${res.affected} audit entries older than ${AUDIT_RETENTION_DAYS} days`,
        );
      return res.affected ?? 0;
    } catch (err) {
      this.logger.error(
        'Audit cleanup failed',
        err instanceof Error ? err.stack : String(err),
      );
      return 0;
    } finally {
      this.cleaning = false;
    }
  }
}
