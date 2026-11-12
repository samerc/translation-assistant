import { Logger, NotFoundException } from '@nestjs/common';
import { EntitySubscriberInterface } from 'typeorm';
import { requestTenantId } from './tenant-context.js';

/**
 * Safety net under the explicit tenant filters: during a tenant user's request,
 * loading any entity that carries a `tenantId` of ANOTHER tenant aborts the
 * request (logged as a violation, answered as a plain 404).
 *
 * The services still scope every query themselves — this only catches a filter
 * someone forgot. Not covered: raw/aggregate queries (no entities are built) and
 * partial selects that leave out tenantId. Global rows (tenantId null), platform
 * admin requests, public endpoints and cron jobs (no tenant bound) pass.
 */
export class TenantIsolationSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger('TenantIsolation');

  afterLoad(entity: unknown): void {
    const tenantId = requestTenantId();
    if (!tenantId || !entity || typeof entity !== 'object') return;
    const owner = (entity as { tenantId?: unknown }).tenantId;
    if (typeof owner !== 'string' || owner === tenantId) return;
    this.logger.error(
      `[TENANT_ISOLATION_VIOLATION] ${entity.constructor?.name} ` +
        `${(entity as { id?: string }).id} of tenant ${owner} loaded in a request of tenant ${tenantId}`,
    );
    throw new NotFoundException('Not found');
  }
}
