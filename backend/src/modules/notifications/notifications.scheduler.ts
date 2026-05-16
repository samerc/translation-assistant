import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service.js';

@Injectable()
export class NotificationsScheduler {
  constructor(private readonly notificationsService: NotificationsService) {}

  // Run daily at 8:00 AM
  @Cron('0 8 * * *')
  async handleDailyChecks() {
    await this.notificationsService.checkDeadlines();
    await this.notificationsService.checkOverdueInvoices();
  }
}
