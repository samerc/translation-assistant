import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TenantDeletionService } from './tenant-deletion.service.js';

/** Daily: purges organizations whose deletion grace period has ended. */
@Injectable()
export class TenantPurgeScheduler {
  private readonly logger = new Logger('TenantPurge');
  private running = false;

  constructor(private readonly deletion: TenantDeletionService) {}

  @Cron('45 3 * * *')
  async purgeDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const n = await this.deletion.purgeDue();
      if (n) this.logger.log(`Purged ${n} organization(s)`);
      return n;
    } catch (err) {
      this.logger.error(
        'Organization purge failed',
        err instanceof Error ? err.stack : err,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
