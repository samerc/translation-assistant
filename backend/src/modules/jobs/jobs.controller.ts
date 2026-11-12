import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { createReadStream } from 'fs';
import { pipeline } from 'stream';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { JobsService } from './jobs.service.js';
import {
  CreateJobDto,
  UpdateJobDto,
  UpdateJobStatusDto,
  CreateJobLineItemDto,
  UpdateJobLineItemDto,
  AssignJobUserDto,
  LinkFileDto,
} from './dto/job.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { JobAccessGuard } from '../../common/guards/job-access.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';
import {
  FileValidationPipe,
  UPLOAD_HARD_LIMIT_BYTES,
} from '../../common/pipes/file-validation.pipe.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { tenantDiskStorage } from '../../common/tenancy/tenant-upload-storage.js';

const jobFileStorage = tenantDiskStorage('jobs');

@Controller('jobs')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, JobAccessGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @RequirePermissions('jobs:read')
  findAll(
    @CurrentActor() actor: Actor,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('type') type?: string,
    @Query('hasDeadline') hasDeadline?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.findAll({
      search,
      status,
      type,
      hasDeadline: hasDeadline === 'true',
      sortBy,
      sortOrder,
      clientId: clientId || undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      actor,
    });
  }

  @Get(':id')
  @RequirePermissions('jobs:read')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.findOne(id);
  }

  @Post()
  @RequirePermissions('jobs:create')
  create(@Body() dto: CreateJobDto, @CurrentActor() actor: Actor) {
    return this.jobsService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('jobs:update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJobDto) {
    return this.jobsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('jobs:delete')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.remove(id);
  }

  @Patch(':id/status')
  @RequirePermissions('jobs:update')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobStatusDto,
    @CurrentUser() user: User,
  ) {
    return this.jobsService.updateStatus(id, dto.status, user.id);
  }

  @Post(':id/reopen')
  @RequirePermissions('jobs:update')
  reopenJob(@Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.reopenJob(id);
  }

  // ── Line Items ──

  @Post(':id/line-items')
  @RequirePermissions('jobs:update')
  addLineItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateJobLineItemDto,
  ) {
    return this.jobsService.addLineItem(id, dto);
  }

  @Patch(':id/line-items/:itemId')
  @RequirePermissions('jobs:update')
  updateLineItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateJobLineItemDto,
  ) {
    return this.jobsService.updateLineItem(id, itemId, dto);
  }

  @Delete(':id/line-items/:itemId')
  @RequirePermissions('jobs:update')
  removeLineItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.jobsService.removeLineItem(id, itemId);
  }

  // ── Users ──

  @Post(':id/users')
  @RequirePermissions('jobs:update')
  assignUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignJobUserDto,
  ) {
    return this.jobsService.assignUser(id, dto.userId, dto.permissionLevel);
  }

  @Delete(':id/users/:userId')
  @RequirePermissions('jobs:update')
  removeUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.jobsService.removeUser(id, userId);
  }

  // ── Files ──

  @Post(':id/files')
  @RequirePermissions('jobs:update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: jobFileStorage,
      limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES },
    }),
  )
  uploadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('category') category: 'source' | 'translated',
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    const validCategory = ['source', 'translated'].includes(category)
      ? category
      : 'source';
    return this.jobsService.uploadFile(id, validCategory, file, user.id);
  }

  @Post(':id/files/link')
  @RequirePermissions('jobs:update')
  async linkFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkFileDto,
    @CurrentActor() actor: Actor,
  ) {
    // JobAccessGuard checks the target job (:id). The source job must be in the
    // same tenant (service) and, for non-admins, assigned to the caller.
    if (!actor.isAdmin) {
      const assignment = await this.jobsService.checkUserAssignment(
        dto.sourceJobId,
        actor.userId,
      );
      if (!assignment) {
        throw new ForbiddenException(
          'You do not have access to the source job',
        );
      }
    }
    return this.jobsService.linkFile(id, dto.sourceJobId, dto.fileId);
  }

  // Download a source/translated file. JobAccessGuard (class-level) has already
  // checked the caller's assignment; view-only assignees may download.
  @Get(':id/files/:fileId/download')
  @RequirePermissions('jobs:read')
  async downloadFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.jobsService.getFileForDownload(id, fileId);
    // Always an attachment with a generic type: uploaded content is never
    // rendered inline by the browser.
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(file.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    pipeline(createReadStream(file.filePath), res, () => {
      /* client aborted or file vanished mid-stream — nothing to clean up */
    });
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions('jobs:update')
  removeFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
  ) {
    return this.jobsService.removeFile(id, fileId);
  }
}
