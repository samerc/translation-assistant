import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';

// NOTE: This guard is a low-signal *tripwire*, NOT the app's SQLi/XSS defense.
// SQL injection is prevented by TypeORM parameterized queries; XSS by React output
// encoding + DOMPurify. These patterns are deliberately narrow — only strings that
// essentially never appear in legitimate translator content (names, notes,
// translated text with entities/prose) — to avoid false-positive rejections.
const SQL_PATTERNS = [
  /(\b|')union\s+(all\s+)?select\b/i,
  /\bxp_cmdshell\b/i,
  /\bwaitfor\s+delay\b/i,
  /\b(load_file\s*\(|into\s+(out|dump)file)\b/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /javascript\s*:/i,
  /<iframe[\s>]/i,
];

const MAX_FIELD_LENGTH = 50000;
const MAX_DEPTH = 20;        // reject pathologically nested bodies
const MAX_NODES = 1000;      // total values inspected per request (CPU bound)
const MAX_KEYS = 200;        // per-object key fan-out cap

@Injectable()
export class AbuseDetectionGuard implements CanActivate {
  private readonly logger = new Logger('AbuseDetection');

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only inspect write operations
    if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') {
      return true;
    }

    const body = request.body;
    if (!body || typeof body !== 'object') {
      return true;
    }

    this.inspectObject(body, '', request, 0, { count: 0 });
    return true;
  }

  private inspectObject(obj: any, path: string, request: any, depth: number, budget: { count: number }): void {
    if (obj === null || obj === undefined) return;
    // Bound total work per request (CPU DoS) and nesting depth (stack safety).
    if (depth > MAX_DEPTH || budget.count >= MAX_NODES) return;
    budget.count++;

    if (typeof obj === 'string') {
      this.inspectString(obj, path, request);
      return;
    }

    if (Array.isArray(obj)) {
      const limit = Math.min(obj.length, MAX_KEYS);
      for (let i = 0; i < limit && budget.count < MAX_NODES; i++) {
        this.inspectObject(obj[i], `${path}[${i}]`, request, depth + 1, budget);
      }
      return;
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj).slice(0, MAX_KEYS);
      for (const key of keys) {
        if (budget.count >= MAX_NODES) break;
        this.inspectObject(obj[key], path ? `${path}.${key}` : key, request, depth + 1, budget);
      }
    }
  }

  private inspectString(value: string, path: string, request: any): void {
    // Skip known safe fields that may legitimately contain long/complex content
    const safeFields = ['password', 'currentPassword', 'newPassword', 'accessToken', 'refreshToken', 'inviteToken', 'token', 'layoutJson'];
    const fieldName = path.split('.').pop() || path;
    if (safeFields.includes(fieldName)) return;

    // Check for extremely long strings (beyond what any DTO MaxLength allows)
    if (value.length > MAX_FIELD_LENGTH) {
      this.logAttempt('OVERSIZED_STRING', path, value.slice(0, 100), request);
      throw new BadRequestException('Request contains invalid data');
    }

    // Check for SQL injection patterns
    for (const pattern of SQL_PATTERNS) {
      if (pattern.test(value)) {
        this.logAttempt('SQL_INJECTION', path, value.slice(0, 200), request);
        throw new BadRequestException('Request contains invalid data');
      }
    }

    // Check for XSS patterns
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(value)) {
        this.logAttempt('XSS_ATTEMPT', path, value.slice(0, 200), request);
        throw new BadRequestException('Request contains invalid data');
      }
    }
  }

  private logAttempt(type: string, field: string, sample: string, request: any): void {
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const userId = request.user?.id || 'anonymous';
    const url = request.originalUrl || request.url;
    this.logger.warn(
      `[${type}] ip=${ip} user=${userId} url=${url} field=${field} sample="${sample.replace(/\n/g, '\\n')}"`,
    );
  }
}
