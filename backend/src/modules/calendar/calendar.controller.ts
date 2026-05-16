import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CalendarService } from './calendar.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RequirePermissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';

@Controller('calendar')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  @RequirePermissions('calendar:read')
  getEvents(
    @CurrentUser() user: User,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const m = Math.min(12, Math.max(1, parseInt(month, 10) || new Date().getMonth() + 1));
    const y = Math.min(2100, Math.max(2000, parseInt(year, 10) || new Date().getFullYear()));
    return this.calendarService.getEvents(user.id, user.role?.name === 'Admin', m, y);
  }
}
