import {
  Injectable,
  PipeTransform,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { extname } from 'path';
import { AppSettings } from '../../modules/settings/entities/app-settings.entity.js';

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

    const settings = await this.settingsRepository.findOne({ where: { id: 1 } });

    // Check file size
    const maxSizeMb = settings?.maxUploadSizeMb || 5;
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds the maximum allowed size of ${maxSizeMb}MB`,
      );
    }

    // Check allowed file types
    const allowedTypes = settings?.allowedFileTypes;
    if (allowedTypes && allowedTypes.length > 0) {
      const fileExt = extname(file.originalname).toLowerCase();
      if (!allowedTypes.includes(fileExt)) {
        throw new BadRequestException(
          `File type "${fileExt}" is not allowed. Allowed types: ${allowedTypes.join(', ')}`,
        );
      }
    }

    return file;
  }
}
