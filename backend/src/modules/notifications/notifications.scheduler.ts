import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationsService } from './notifications.service.js';

@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name);
  private running = false;

  constructor(private readonly notificationsService: NotificationsService) {}

  // Run daily at 8:00 AM
  @Cron('0 8 * * *')
  async handleDailyChecks() {
    if (this.running) {
      this.logger.warn('Previous daily check still running, skipping this run');
      return;
    }

    this.running = true;
    const start = Date.now();

    try {
      this.logger.log('Starting daily checks...');
      await this.notificationsService.checkDeadlines();
      await this.notificationsService.checkOverdueInvoices();
      this.logger.log(`Daily checks completed in ${Date.now() - start}ms`);
    } catch (error) {
      this.logger.error('Daily checks failed', error instanceof Error ? error.stack : error);
    } finally {
      this.running = false;
    }
  }
}
