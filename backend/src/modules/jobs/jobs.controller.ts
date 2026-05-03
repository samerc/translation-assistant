import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  ParseIntPipe, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import { JobsService } from './jobs.service.js';
import { CreateJobDto, UpdateJobDto } from './dto/job.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';
import { FileValidationPipe } from '../../common/pipes/file-validation.pipe.js';

const jobFileStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'jobs'),
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${extname(file.originalname)}`);
  },
});

@Controller('jobs')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @RequirePermissions('jobs:read')
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('clientId') clientId?: string,
    @Query('type') type?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.findAll({
      search, status, type, sortBy, sortOrder,
      clientId: clientId ? parseInt(clientId, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermissions('jobs:read')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.jobsService.findOne(id);
  }

  @Post()
  @RequirePermissions('jobs:create')
  create(@Body() dto: CreateJobDto, @CurrentUser() user: User) {
    return this.jobsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('jobs:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateJobDto) {
    return this.jobsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('jobs:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.jobsService.remove(id);
  }

  @Patch(':id/status')
  @RequirePermissions('jobs:update')
  updateStatus(@Param('id', ParseIntPipe) id: number, @Body('status') status: string) {
    return this.jobsService.updateStatus(id, status);
  }

  @Post(':id/reopen')
  @RequirePermissions('jobs:update')
  reopenJob(@Param('id', ParseIntPipe) id: number) {
    return this.jobsService.reopenJob(id);
  }

  // ── Users ──

  @Post(':id/users')
  @RequirePermissions('jobs:update')
  assignUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userId: number; permissionLevel?: 'view' | 'edit' },
  ) {
    return this.jobsService.assignUser(id, body.userId, body.permissionLevel);
  }

  @Delete(':id/users/:userId')
  @RequirePermissions('jobs:update')
  removeUser(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    return this.jobsService.removeUser(id, userId);
  }

  // ── Files ──

  @Post(':id/files')
  @RequirePermissions('jobs:update')
  @UseInterceptors(FileInterceptor('file', { storage: jobFileStorage }))
  uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @Body('category') category: 'source' | 'translated',
    @UploadedFile(FileValidationPipe) file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    return this.jobsService.uploadFile(id, category || 'source', file, user.id);
  }

  @Post(':id/files/link')
  @RequirePermissions('jobs:update')
  linkFile(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { sourceJobId: number; fileId: number },
  ) {
    return this.jobsService.linkFile(id, body.sourceJobId, body.fileId);
  }

  @Delete(':id/files/:fileId')
  @RequirePermissions('jobs:update')
  removeFile(@Param('id', ParseIntPipe) id: number, @Param('fileId', ParseIntPipe) fileId: number) {
    return this.jobsService.removeFile(id, fileId);
  }
}
