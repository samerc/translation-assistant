import { Injectable, PipeTransform, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname } from 'path';
import { AppSettings } from '../../modules/settings/entities/app-settings.entity.js';
import {
  readHeaderBytes,
  sniffType,
  VERIFIABLE_TYPES,
  ALWAYS_BLOCKED_EXTENSIONS,
} from '../utils/file-signature.js';

/** Hard multer cap for disk uploads — the highest maxUploadSizeMb the settings
 *  allow (100). The configured, usually lower, limit is enforced below. */
export const UPLOAD_HARD_LIMIT_BYTES = 100 * 1024 * 1024;

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  async transform(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const settings = await this.settingsRepository
      .find({ take: 1 })
      .then((r) => r[0] ?? null);

    // Check file size
    const maxSizeMb = settings?.maxUploadSizeMb || 5;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the maximum allowed size of ${maxSizeMb}MB`,
      );
    }

    const fileExt = extname(file.originalname).toLowerCase();

    // Executable/script/markup types are never accepted — even if the admin left
    // the allow-list empty (which otherwise means "any type").
    if (ALWAYS_BLOCKED_EXTENSIONS.includes(fileExt)) {
      throw new BadRequestException(`File type "${fileExt}" is not allowed`);
    }

    // Check the configurable allow-list (when set).
    const allowedTypes = settings?.allowedFileTypes;
    if (
      allowedTypes &&
      allowedTypes.length > 0 &&
      !allowedTypes.includes(fileExt)
    ) {
      throw new BadRequestException(
        `File type "${fileExt}" is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      );
    }

    // For content-verifiable types, confirm the bytes match the claimed extension
    // (defeats polyglots / renamed files like shell.php.jpg).
    const expected = VERIFIABLE_TYPES[fileExt];
    if (expected) {
      const header = readHeaderBytes({ buffer: file.buffer, path: file.path });
      if (!header || sniffType(header) !== expected) {
        throw new BadRequestException(
          `File content does not match its "${fileExt}" extension`,
        );
      }
    }

    return file;
  }
}
