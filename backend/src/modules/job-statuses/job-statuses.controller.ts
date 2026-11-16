import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JobStatusesService } from './job-statuses.service.js';
import {
  CreateJobStatusDto,
  StageToneDto,
  UpdateJobStatusDefDto,
} from './dto/job-status.dto.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AdminGuard } from '../../common/guards/admin.guard.js';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { AdminOnly } from '../../common/decorators/admin-only.decorator.js';
import { CurrentActor, type Actor } from '../../common/tenancy/actor.js';
import { Audited } from '../audit/audited.decorator.js';
import { JOB_STAGES } from '../../common/tenancy/job-stages.js';

const STAGE_ENUM = Object.fromEntries(JOB_STAGES.map((s) => [s, s]));

/** The organization's job statuses: everyone with jobs access reads; its Admin edits. */
@Controller('job-statuses')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, AdminGuard)
export class JobStatusesController {
  constructor(private readonly statuses: JobStatusesService) {}

  @Get()
  @RequirePermissions('jobs:read')
  findAll(@CurrentActor() actor: Actor) {
    return this.statuses.catalogueForTenant(actor.tenantId);
  }

  @Post()
  @AdminOnly()
  @RequirePermissions('settings:update')
  @Audited('jobStatus.created', {
    target: 'jobStatus',
    body: ['stage', 'name', 'tone', 'notify'],
  })
  create(@Body() dto: CreateJobStatusDto, @CurrentActor() actor: Actor) {
    return this.statuses.createForTenant(actor.tenantId, dto);
  }

  @Patch('stages/:stage')
  @AdminOnly()
  @RequirePermissions('settings:update')
  @Audited('jobStatus.stage_colour', { body: ['tone'] })
  setStageTone(
    @Param('stage', new ParseEnumPipe(STAGE_ENUM)) stage: string,
    @Body() dto: StageToneDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.statuses.setStageTone(actor.tenantId, stage, dto.tone);
  }

  @Patch(':id')
  @AdminOnly()
  @RequirePermissions('settings:update')
  @Audited('jobStatus.updated', {
    target: 'jobStatus',
    body: ['name', 'tone', 'notify', 'hidden'],
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobStatusDefDto,
    @CurrentActor() actor: Actor,
  ) {
    return this.statuses.updateForTenant(actor.tenantId, id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @RequirePermissions('settings:update')
  @Audited('jobStatus.deleted', { target: 'jobStatus' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentActor() actor: Actor) {
    return this.statuses.removeForTenant(actor.tenantId, id);
  }
}

/** The default statuses every organization gets (platform admin). */
@Controller('platform/job-statuses')
@UseGuards(AuthGuard('jwt'), PermissionsGuard, PlatformAdminGuard)
export class PlatformJobStatusesController {
  constructor(private readonly statuses: JobStatusesService) {}

  @Get()
  @RequirePermissions('platform:read')
  findAll() {
    return this.statuses.findDefaults();
  }

  @Post()
  @RequirePermissions('platform:update')
  @Audited('jobStatus.created', {
    target: 'jobStatus',
    body: ['stage', 'name', 'tone', 'notify'],
  })
  create(@Body() dto: CreateJobStatusDto) {
    return this.statuses.createDefault(dto);
  }

  @Patch(':id')
  @RequirePermissions('platform:update')
  @Audited('jobStatus.updated', {
    target: 'jobStatus',
    body: ['name', 'tone', 'notify', 'hidden'],
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobStatusDefDto,
  ) {
    return this.statuses.updateDefault(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('platform:update')
  @Audited('jobStatus.deleted', { target: 'jobStatus' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.statuses.removeDefault(id);
  }
}
