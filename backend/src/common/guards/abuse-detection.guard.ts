import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  Logger,
} from '@nestjs/common';

const SQL_PATTERNS = [
  /(\b|')union\s+(all\s+)?select\b/i,
  /\b(drop|alter|truncate)\s+table\b/i,
  /\b(insert\s+into|delete\s+from|update\s+\w+\s+set)\b/i,
  /;\s*--(.*)/,
  /\/\*[\s\S]*?\*\//,
  /\b(exec|execute)\s*\(/i,
  /\bxp_cmdshell\b/i,
  /\b(char|nchar|varchar)\s*\(\s*\d+\s*\)/i,
  /\bwaitfor\s+delay\b/i,
  /\bbenchmark\s*\(/i,
  /\bsleep\s*\(\s*\d/i,
  /\b(load_file|into\s+outfile|into\s+dumpfile)\b/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /\bon\w+\s*=/i,
  /javascript\s*:/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<form[\s>]/i,
  /<meta[\s>]/i,
  /\beval\s*\(/i,
  /\bdocument\s*\.\s*(cookie|write|location)/i,
  /\bwindow\s*\.\s*location/i,
  /\balert\s*\(/i,
  /&#x?[0-9a-f]+;/i,
  /\bString\.fromCharCode\s*\(/i,
];

const MAX_FIELD_LENGTH = 50000;

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

    this.inspectObject(body, '', request);
    return true;
  }

  private inspectObject(obj: any, path: string, request: any): void {
    if (obj === null || obj === undefined) return;

    if (typeof obj === 'string') {
      this.inspectString(obj, path, request);
      return;
    }

    if (Array.isArray(obj)) {
      // Limit array traversal depth
      const limit = Math.min(obj.length, 200);
      for (let i = 0; i < limit; i++) {
        this.inspectObject(obj[i], `${path}[${i}]`, request);
      }
      return;
    }

    if (typeof obj === 'object') {
      for (const key of Object.keys(obj)) {
        this.inspectObject(obj[key], path ? `${path}.${key}` : key, request);
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
