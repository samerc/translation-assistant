import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  BadGatewayException,
  GatewayTimeoutException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '../users/entities/user.entity.js';
import { SettingsService } from '../settings/settings.service.js';

class TranslateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;

  @IsString()
  @MinLength(2)
  @MaxLength(10)
  from: string;

  @IsString()
  @MinLength(2)
  @MaxLength(10)
  to: string;
}

// Per-user daily character budget — caps billed Google Translate usage on top of
// the 30/min throttle. In-memory (per-process; resets on restart) — matches the
// app's other in-memory limiters; move to a shared store if running clustered.
const DAILY_CHAR_LIMIT = 200_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const usage = new Map<string, { chars: number; resetAt: number }>();

@Controller('translate')
@UseGuards(AuthGuard('jwt'))
export class TranslateController {
  constructor(private readonly settingsService: SettingsService) {}

  /** Whether a Google Translate key is set — the document page shows a banner when not. */
  @Get('status')
  async status() {
    return {
      configured: Boolean(await this.settingsService.getTranslateApiKey()),
    };
  }

  @Post()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async translate(@Body() body: TranslateDto, @CurrentUser() user: User) {
    // Validate language codes (ISO 639-1 pattern)
    const langPattern = /^[a-z]{2,3}(-[A-Z]{2})?$/;
    if (!langPattern.test(body.from) || !langPattern.test(body.to)) {
      throw new BadRequestException('Invalid language code format');
    }

    const apiKey = await this.settingsService.getTranslateApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Google Translate is not set up. An admin can add an API key in Settings.',
      );
    }

    // Enforce the per-user daily character budget.
    const now = Date.now();
    const entry = usage.get(user.id);
    if (!entry || now >= entry.resetAt) {
      usage.set(user.id, { chars: body.text.length, resetAt: now + DAY_MS });
    } else {
      if (entry.chars + body.text.length > DAILY_CHAR_LIMIT) {
        throw new HttpException(
          'Daily translation limit reached. Please try again tomorrow.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      entry.chars += body.text.length;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            q: body.text,
            source: body.from,
            target: body.to,
            format: 'text',
          }),
          signal: controller.signal,
        },
      );
    } catch {
      throw controller.signal.aborted
        ? new GatewayTimeoutException(
            'Google Translate took too long to answer',
          )
        : new BadGatewayException('Google Translate could not be reached');
    } finally {
      clearTimeout(timeoutId);
    }

    const data = (await res.json().catch(() => null)) as {
      data?: { translations?: { translatedText?: string }[] };
      error?: { status?: string };
    } | null;
    const translatedText = data?.data?.translations?.[0]?.translatedText;
    if (!res.ok || !translatedText) {
      // 400/403 from Google almost always mean a bad or restricted key.
      const keyProblem = res.status === 400 || res.status === 403;
      throw new BadGatewayException(
        keyProblem
          ? 'Google Translate rejected the API key. Check it in Settings.'
          : 'Google Translate returned an error. Please try again.',
      );
    }
    return { translatedText };
  }
}
