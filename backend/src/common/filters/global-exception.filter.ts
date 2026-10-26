import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { Sentry } from '../../instrument.js';
import type { MaybeAuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * Global exception filter that:
 * 1. Logs full technical details server-side (stack, query, path)
 * 2. Returns sanitized messages to the client (no stack traces, no file paths, no SQL)
 *
 * NestJS's default handler leaks stack traces and internal details in development mode.
 * This filter replaces it entirely.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<MaybeAuthenticatedRequest>();

    const { status, body } = this.buildResponse(exception);

    // Log full details server-side only
    this.logException(exception, request, status);

    response.status(status).json(body);
  }

  private buildResponse(exception: unknown): {
    status: number;
    body: Record<string, unknown>;
  } {
    // NestJS HttpException (BadRequest, NotFound, Forbidden, Unauthorized, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Preserve validation error details (class-validator messages are user-facing)
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        return {
          status,
          body: {
            statusCode: status,
            message: resp.message || exception.message,
            error: resp.error || HttpStatus[status],
          },
        };
      }

      let message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : exception.message;
      // The throttler's own text is "ThrottlerException: Too Many Requests".
      if (message.startsWith('ThrottlerException')) {
        message = 'Too many requests. Please wait a minute and try again.';
      }
      return {
        status,
        body: {
          statusCode: status,
          message,
          error: HttpStatus[status],
        },
      };
    }

    // TypeORM query errors (constraint violations, bad queries)
    if (exception instanceof QueryFailedError) {
      // Check for unique constraint violation
      const message = exception.message || '';
      if (
        message.includes('Duplicate entry') ||
        message.includes('UNIQUE constraint')
      ) {
        // MariaDB: "Duplicate entry 'en' for key '...'" — the value is the
        // caller's own input, so naming it is safe and far more useful.
        const dup = /Duplicate entry '(.{1,60}?)' for key/.exec(message)?.[1];
        return {
          status: HttpStatus.CONFLICT,
          body: {
            statusCode: HttpStatus.CONFLICT,
            message: dup
              ? `"${dup}" is already in use. Please choose a different value.`
              : 'A record with this value already exists',
            error: 'Conflict',
          },
        };
      }

      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'The request could not be processed',
          error: 'Bad Request',
        },
      };
    }

    // TypeORM entity not found
    if (exception instanceof EntityNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        body: {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Resource not found',
          error: 'Not Found',
        },
      };
    }

    // Anything else — generic 500
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected error occurred',
        error: 'Internal Server Error',
      },
    };
  }

  private logException(
    exception: unknown,
    request: MaybeAuthenticatedRequest,
    status: number,
  ): void {
    const method = request.method;
    const url = request.originalUrl || request.url;
    const userId = request.user?.id || 'anonymous';
    const ip = request.ip || 'unknown';

    // A database error mapped to 400 (FK violation, data too long, deadlock…) is
    // a server-side problem the client can't see — always log it. Duplicate-key
    // 409s are ordinary conflicts.
    if (
      exception instanceof QueryFailedError &&
      status !== Number(HttpStatus.CONFLICT)
    ) {
      this.logger.error(
        `${method} ${url} → ${status} (database) | user=${userId} ip=${ip} | ${exception.message}`,
      );
      return;
    }

    // Don't log 4xx client errors at error level (they're expected)
    if (status < 500) {
      // Only log 4xx at debug level, skip validation errors entirely
      if (status !== 400) {
        this.logger.warn(
          `${method} ${url} → ${status} | user=${userId} ip=${ip} | ${this.getExceptionMessage(exception)}`,
        );
      }
      return;
    }

    // 5xx errors — log full details for debugging
    const stack =
      exception instanceof Error ? exception.stack : String(exception);
    this.logger.error(
      `${method} ${url} → ${status} | user=${userId} ip=${ip}`,
      stack,
    );

    // Report server errors to Sentry (no-op unless SENTRY_DSN is configured).
    Sentry.captureException(exception, {
      extra: { method, url, userId, ip, status },
    });
  }

  private getExceptionMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        const msg = (response as { message?: unknown }).message;
        return Array.isArray(msg) ? msg.join('; ') : String(msg);
      }
      return exception.message;
    }
    if (exception instanceof Error) {
      return exception.message;
    }
    return String(exception);
  }
}
