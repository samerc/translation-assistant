import { ForbiddenException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import type { MaybeAuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * Multer disk storage under uploads/<tenantId>/<folder>/ — each tenant's files
 * live apart on disk too. Multer runs after the guards, so req.user is set;
 * the tenant id is a UUID from the database, safe as a path segment.
 */
export function tenantDiskStorage(folder: 'jobs' | 'passports' | 'templates') {
  return diskStorage({
    destination: (req, _file, cb) => {
      const tenantId = (req as MaybeAuthenticatedRequest).user?.tenantId;
      if (!tenantId) {
        cb(new ForbiddenException('Uploads need an organization'), '');
        return;
      }
      const dir = join(process.cwd(), 'uploads', tenantId, folder);
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  });
}
