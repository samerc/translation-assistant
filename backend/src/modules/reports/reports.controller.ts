import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('reports')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-stats')
  @RequirePermissions('reports:read')
  getDashboardStats(@CurrentUser() user: User) {
    return this.reportsService.getDashboardStats(user.id, user.role?.name === 'Admin');
  }

  @Get('revenue')
  @RequirePermissions('reports:read')
  getRevenue(
    @CurrentUser() user: User,
    @Query('period') period?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.getRevenue(
      user.id, user.role?.name === 'Admin',
      period || 'monthly', from, to,
    );
  }

  @Get('by-client')
  @RequirePermissions('reports:read')
  getByClient(@CurrentUser() user: User) {
    return this.reportsService.getByClient(user.id, user.role?.name === 'Admin');
  }

  @Get('job-status')
  @RequirePermissions('reports:read')
  getJobStatus(@CurrentUser() user: User) {
    return this.reportsService.getJobStatus(user.id, user.role?.name === 'Admin');
  }
}
