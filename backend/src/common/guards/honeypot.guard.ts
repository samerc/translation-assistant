import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';

/**
 * Rejects requests where a hidden honeypot field is filled.
 * Real users never see or fill the field; bots auto-fill everything.
 *
 * The frontend adds a hidden `_hp` field set to '' on all forms.
 * If a request is a write (POST/PATCH/PUT) and `_hp` is present and non-empty,
 * it's a bot — reject silently with a generic 400.
 */
@Injectable()
export class HoneypotGuard implements CanActivate {
  private readonly logger = new Logger('Honeypot');

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only check write operations
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD' || method === 'DELETE') {
      return true;
    }

    const body = request.body;
    if (!body || typeof body !== 'object') {
      return true;
    }

    // Check for filled honeypot field
    if (body._hp !== undefined && body._hp !== '' && body._hp !== null) {
      const ip = request.ip || request.connection?.remoteAddress || 'unknown';
      const url = request.originalUrl || request.url;
      this.logger.warn(`[BOT_DETECTED] ip=${ip} url=${url} honeypot_value="${String(body._hp).slice(0, 100)}"`);
      throw new BadRequestException('Request rejected');
    }

    // Remove the honeypot field so it doesn't hit DTO validation (forbidNonWhitelisted)
    if (body._hp !== undefined) {
      delete body._hp;
    }

    return true;
  }
}
