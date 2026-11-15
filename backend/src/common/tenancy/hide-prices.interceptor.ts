import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';
import { TenantsService } from '../../modules/tenants/tenants.service.js';
import type { MaybeAuthenticatedRequest } from '../types/authenticated-request.js';

/** Every money field a job, line item, template or freeform type carries. */
export const PRICE_KEYS = new Set([
  'pricePerPage',
  'discountedPricePerPage',
  'useDiscountedPrice',
  'lineTotal',
  'calculatedTotal',
  'finalPrice',
  'paymentAmount',
  'paymentCurrency',
]);

/** Removes PRICE_KEYS from a response, at any depth (entities, lists, pages). */
export function stripPrices<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object' || value instanceof Date)
    return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) stripPrices(item, seen);
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (PRICE_KEYS.has(key)) delete record[key];
    else stripPrices(record[key], seen);
  }
  return value;
}

/**
 * On controllers that return jobs, templates or job types: when the
 * organization hides prices from Translators, a Translator's responses carry
 * no price at all (the UI only hides what is already absent).
 */
@Injectable()
export class HidePricesInterceptor implements NestInterceptor {
  constructor(private readonly tenantsService: TenantsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>().user;
    return next.handle().pipe(
      switchMap((body: unknown) =>
        from(
          (async () => {
            if (!user?.tenantId) return body;
            const hide = await this.tenantsService.hidesPrices({
              tenantId: user.tenantId,
              role: user.role?.name,
            });
            return hide ? stripPrices(body) : body;
          })(),
        ),
      ),
    );
  }
}
