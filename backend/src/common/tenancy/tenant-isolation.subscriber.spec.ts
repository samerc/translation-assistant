import { NotFoundException } from '@nestjs/common';
import { TenantIsolationSubscriber } from './tenant-isolation.subscriber.js';
import {
  TenantContextMiddleware,
  bindRequestTenant,
  requestTenantId,
} from './tenant-context.js';

/** Runs `fn` inside a request context bound to `tenantId`, like a real request. */
function inRequest<T>(tenantId: string | null, fn: () => T): T {
  let result!: T;
  new TenantContextMiddleware().use(null, null, () => {
    bindRequestTenant(tenantId);
    result = fn();
  });
  return result;
}

describe('TenantIsolationSubscriber', () => {
  const sub = new TenantIsolationSubscriber();
  // Keep the expected violation log out of the test output.
  beforeAll(() =>
    jest
      .spyOn(
        (sub as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => {}),
  );

  it('binds the tenant per request and forgets it afterwards', () => {
    expect(inRequest('t1', () => requestTenantId())).toBe('t1');
    expect(requestTenantId()).toBeUndefined();
  });

  it('lets a tenant load its own rows and global rows', () => {
    inRequest('t1', () => {
      expect(() => sub.afterLoad({ id: 'a', tenantId: 't1' })).not.toThrow();
      expect(() => sub.afterLoad({ id: 'g', tenantId: null })).not.toThrow();
      expect(() => sub.afterLoad({ id: 'x' })).not.toThrow(); // not tenant-owned
    });
  });

  it("refuses another tenant's row inside a tenant request", () => {
    inRequest('t1', () => {
      expect(() => sub.afterLoad({ id: 'b', tenantId: 't2' })).toThrow(
        NotFoundException,
      );
    });
  });

  it('does not interfere outside tenant requests (platform admin, public, cron)', () => {
    expect(() => sub.afterLoad({ id: 'b', tenantId: 't2' })).not.toThrow();
    inRequest(null, () => {
      expect(() => sub.afterLoad({ id: 'b', tenantId: 't2' })).not.toThrow();
    });
  });

  it('keeps the context across awaits', async () => {
    let seen: string | undefined;
    await new Promise<void>((resolve) => {
      new TenantContextMiddleware().use(null, null, () => {
        bindRequestTenant('t9');
        void (async () => {
          await new Promise((r) => setTimeout(r, 5));
          seen = requestTenantId();
          resolve();
        })();
      });
    });
    expect(seen).toBe('t9');
  });
});
