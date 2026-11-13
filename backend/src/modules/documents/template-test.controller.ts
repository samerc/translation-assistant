import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';
import { streamThenDelete } from '../../common/utils/stream-then-delete.js';
import { ExportService } from './export.service.js';
import { TestExportDto } from '../templates/dto/template.dto.js';

/**
 * `POST /templates/:id/test-export` — the setup wizard's "Try it": renders the
 * template with sample values (lives here because the renderer does).
 */
@Controller('templates')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class TemplateTestController {
  constructor(private readonly exportService: ExportService) {}

  @Post(':id/test-export')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('templates:update')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async testExport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TestExportDto,
    @CurrentActor() actor: Actor,
    @Res() res: Response,
  ) {
    const { filePath, downloadName } = await this.exportService.exportTest(
      id,
      actor.tenantId,
      dto.values,
      dto.languageId,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    res.setHeader('Content-Disposition', contentDisposition(downloadName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    streamThenDelete(filePath, res);
  }
}
