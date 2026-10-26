import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { unlink } from 'fs/promises';
import { Observable, catchError, throwError } from 'rxjs';

/**
 * diskStorage writes an upload before pipes, access checks and the handler run,
 * so any failure after that (validation 400, 403, 404, DB error) would leave the
 * file orphaned on disk. Registered globally: on error, delete whatever multer
 * stored for this request, then rethrow.
 */
@Injectable()
export class UploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      catchError((err: unknown) => {
        const files = [
          req.file,
          ...(Array.isArray(req.files)
            ? req.files
            : Object.values(req.files ?? {}).flat()),
        ];
        for (const file of files) {
          if (file?.path) unlink(file.path).catch(() => undefined);
        }
        return throwError(() => err);
      }),
    );
  }
}
