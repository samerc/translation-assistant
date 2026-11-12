import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobUser } from '../../modules/jobs/entities/job-user.entity.js';
import { Job } from '../../modules/jobs/entities/job.entity.js';
import type { MaybeAuthenticatedRequest } from '../types/authenticated-request.js';

@Injectable()
export class JobAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
    @InjectRepository(Job)
    private readonly jobRepository: Repository<Job>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>();
    const user = request.user;

    if (!user) return false;

    // Get job ID from params (could be :id or :jobId)
    const rawJobId = request.params.id || request.params.jobId;
    const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
    if (!jobId) return true; // No job context, let other guards handle

    // Everyone, admins included: the job must belong to the caller's tenant.
    // Another tenant's job answers like a job that doesn't exist.
    const inTenant =
      !!user.tenantId &&
      (await this.jobRepository.count({
        where: { id: jobId, tenantId: user.tenantId },
      }));
    if (!inTenant) throw new NotFoundException('Job not found');

    // Tenant admins have full access within their tenant
    const isAdmin = user.role?.name === 'Admin';
    if (isAdmin) return true;

    // Check if user is assigned to this job
    const assignment = await this.jobUserRepository.findOne({
      where: { jobId, userId: user.id },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have access to this job');
    }

    // For edit operations, check permission level
    const method = request.method;
    if (
      ['PATCH', 'POST', 'DELETE'].includes(method) &&
      assignment.permissionLevel === 'view'
    ) {
      throw new ForbiddenException('You have view-only access to this job');
    }

    return true;
  }
}
