import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';

interface TenantStore {
  /** Set once the caller is authenticated: their tenant, or undefined (platform admin / public). */
  tenantId?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Opens a per-request store. Registered as Nest module middleware (after the
 * body parsers, whose stream callbacks would otherwise lose the context), so
 * guards, pipes, handlers and TypeORM all run inside it.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(_req: unknown, _res: unknown, next: () => void): void {
    storage.run({}, next);
  }
}

/** Called by JwtStrategy once the user is loaded. */
export function bindRequestTenant(tenantId: string | null | undefined): void {
  const store = storage.getStore();
  if (store) store.tenantId = tenantId ?? undefined;
}

/** The authenticated caller's tenant, if this code runs inside a tenant request. */
export function requestTenantId(): string | undefined {
  return storage.getStore()?.tenantId;
}
