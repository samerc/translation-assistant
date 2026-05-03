import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobUser } from '../../modules/jobs/entities/job-user.entity.js';

@Injectable()
export class JobAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(JobUser)
    private readonly jobUserRepository: Repository<JobUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;

    // Admins have full access
    const isAdmin = user.role?.name === 'Admin';
    if (isAdmin) return true;

    // Get job ID from params (could be :id or :jobId)
    const jobId = request.params.id || request.params.jobId;
    if (!jobId) return true; // No job context, let other guards handle

    // Check if user is assigned to this job
    const assignment = await this.jobUserRepository.findOne({
      where: { jobId, userId: user.id },
    });

    if (!assignment) {
      throw new ForbiddenException('You do not have access to this job');
    }

    // For edit operations, check permission level
    const method = request.method;
    if (['PATCH', 'POST', 'DELETE'].includes(method) && assignment.permissionLevel === 'view') {
      throw new ForbiddenException('You have view-only access to this job');
    }

    return true;
  }
}
