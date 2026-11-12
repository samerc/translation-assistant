import { EntityManager } from 'typeorm';
import { TenantSettings } from './entities/tenant-settings.entity.js';

/**
 * Lock this tenant's settings row for the rest of the transaction. Job and
 * invoice numbering (MAX()+1 within the tenant) and the "a job is billed once"
 * check take it first, so concurrent creates in one tenant are serialized —
 * other tenants are not blocked. The row always exists (created with the
 * tenant); without it the lock would lock nothing.
 */
export async function lockTenantSettings(
  manager: EntityManager,
  tenantId: string,
): Promise<TenantSettings> {
  const row = await manager
    .createQueryBuilder(TenantSettings, 's')
    .setLock('pessimistic_write')
    .where('s.tenant_id = :tenantId', { tenantId })
    .getOne();
  if (row) return row;
  // Self-heal a tenant created before its settings row existed.
  await manager
    .createQueryBuilder()
    .insert()
    .into(TenantSettings)
    .values({ tenantId })
    .orIgnore()
    .execute();
  return manager
    .createQueryBuilder(TenantSettings, 's')
    .setLock('pessimistic_write')
    .where('s.tenant_id = :tenantId', { tenantId })
    .getOneOrFail();
}
