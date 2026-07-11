import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_WRITES = 120;   // 120 write operations per window

/**
 * Rate-limits write operations (POST/PATCH/PUT/DELETE) to 10 per minute
 * per authenticated user (by user ID) or by IP for anonymous requests.
 *
 * This is separate from the global ThrottlerGuard (100 req/min for all requests)
 * and the per-endpoint @Throttle decorators (login, register, etc.).
 * This guard specifically targets form submissions / data mutations.
 */
@Injectable()
export class WriteThrottleGuard implements CanActivate {
  private readonly logger = new Logger('WriteThrottle');
  private readonly buckets = new Map<string, BucketEntry>();

  // Clean up stale entries every 5 minutes
  private lastCleanup = Date.now();
  private readonly cleanupInterval = 5 * 60_000;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only throttle write operations
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
      return true;
    }

    // Use user ID if authenticated, otherwise IP
    const userId = request.user?.id;
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const key = `write:${userId || ip}`;

    const now = Date.now();

    // Periodic cleanup of expired entries
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanup(now);
      this.lastCleanup = now;
    }

    const entry = this.buckets.get(key);

    if (!entry || now >= entry.resetAt) {
      // Start new window
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    entry.count++;

    if (entry.count > MAX_WRITES) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      this.logger.warn(
        `[WRITE_THROTTLED] key=${key} count=${entry.count} url=${request.originalUrl || request.url}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many submissions. Try again in ${retryAfter} seconds.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.buckets) {
      if (now >= entry.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}
