import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { RefreshRequest } from '../types/authenticated-request.js';

const WINDOW_MS = 60_000;
/** Refreshes per user per minute (all their tabs and devices). */
export const REFRESH_LIMIT_PER_SESSION = 30;

/**
 * The access token is kept in memory, so every page load and every new tab
 * refreshes. Counting that per IP would lock out an office whose people share
 * one address; this counts per user instead. It runs after the `jwt-refresh`
 * guard, so the user id comes from a verified refresh token (it rotates on
 * every refresh, so it can't be the key itself). The route's per-IP @Throttle
 * stays as a loose outer limit.
 */
@Injectable()
export class RefreshThrottleGuard implements CanActivate {
  private readonly logger = new Logger('RefreshThrottle');
  private readonly buckets = new Map<
    string,
    { count: number; resetAt: number }
  >();
  private lastCleanup = Date.now();

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RefreshRequest>();
    const key = req.user?.sub
      ? `u:${req.user.sub}`
      : `ip:${req.ip ?? 'unknown'}`;
    const now = Date.now();
    if (now - this.lastCleanup > 5 * WINDOW_MS) {
      for (const [k, v] of this.buckets)
        if (now >= v.resetAt) this.buckets.delete(k);
      this.lastCleanup = now;
    }
    const entry = this.buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }
    entry.count++;
    if (entry.count > REFRESH_LIMIT_PER_SESSION) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      this.logger.warn(`[REFRESH_THROTTLED] ${key} count=${entry.count}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many requests. Try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
