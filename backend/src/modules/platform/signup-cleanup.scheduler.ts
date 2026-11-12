import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { PlatformService } from './platform.service.js';

/** Sign-ups whose email was never confirmed are removed after this long. */
const UNCONFIRMED_SIGNUP_DAYS = 7;

/**
 * Daily: removes pending sign-ups nobody confirmed (typos, bots), so the
 * approval list only holds real requests. Confirmed-but-pending ones stay
 * until the platform admin decides.
 */
@Injectable()
export class SignupCleanupScheduler {
  private readonly logger = new Logger('SignupCleanup');
  private running = false;

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly platformService: PlatformService,
  ) {}

  @Cron('30 3 * * *')
  async removeStaleSignups(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let removed = 0;
    try {
      const cutoff = new Date(
        Date.now() - UNCONFIRMED_SIGNUP_DAYS * 86_400_000,
      );
      const stale = await this.tenantRepository.find({
        where: {
          status: 'pending',
          source: 'signup',
          createdAt: LessThan(cutoff),
        },
      });
      for (const t of stale) {
        const confirmed = await this.userRepository.count({
          where: { tenantId: t.id, emailVerified: true },
        });
        if (confirmed) continue;
        await this.platformService.reject(t.id);
        removed++;
      }
      if (removed) this.logger.log(`Removed ${removed} unconfirmed sign-up(s)`);
    } catch (err) {
      this.logger.error(
        'Sign-up cleanup failed',
        err instanceof Error ? err.stack : err,
      );
    } finally {
      this.running = false;
    }
    return removed;
  }
}
