import { BadRequestException, Injectable, Logger } from '@nestjs/common';

/**
 * Cloudflare Turnstile ("are you human") check for the public sign-up form.
 * Active when TURNSTILE_SECRET_KEY is set (the frontend renders the widget when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is set). Without a key the check is skipped —
 * with a warning in production, where it should always be configured.
 */
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger('Turnstile');
  private warned = false;

  async verify(token: string | undefined, ip: string): Promise<void> {
    const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
    if (!secret) {
      if (process.env.NODE_ENV === 'production' && !this.warned) {
        this.logger.warn(
          'TURNSTILE_SECRET_KEY is not set — sign-ups are not bot-checked',
        );
        this.warned = true;
      }
      return;
    }
    if (!token) {
      throw new BadRequestException('Please complete the human check');
    }
    let success = false;
    try {
      const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          body: new URLSearchParams({ secret, response: token, remoteip: ip }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      const data = (await res.json()) as { success?: boolean };
      success = data.success === true;
    } catch (err) {
      this.logger.error(
        `Turnstile verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!success) {
      throw new BadRequestException(
        'The human check failed — please try again',
      );
    }
  }
}
