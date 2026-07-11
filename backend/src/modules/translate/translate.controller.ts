import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';

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

@Controller('translate')
@UseGuards(AuthGuard('jwt'))
export class TranslateController {
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async translate(@Body() body: TranslateDto) {
    // Validate language codes (ISO 639-1 pattern)
    const langPattern = /^[a-z]{2,3}(-[A-Z]{2})?$/;
    if (!langPattern.test(body.from) || !langPattern.test(body.to)) {
      throw new BadRequestException('Invalid language code format');
    }

    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

    if (!apiKey || apiKey === 'your-google-translate-api-key') {
      return {
        translatedText: `[GT: ${body.text}]`,
        note: 'Translation service is not configured',
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
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

      clearTimeout(timeoutId);

      const data = await res.json();
      const translatedText = data?.data?.translations?.[0]?.translatedText || body.text;
      return { translatedText };
    } catch {
      return { translatedText: body.text, error: 'Translation service unavailable' };
    }
  }
}
