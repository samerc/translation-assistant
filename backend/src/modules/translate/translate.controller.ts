import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('translate')
@UseGuards(AuthGuard('jwt'))
export class TranslateController {
  @Post()
  async translate(@Body() body: { text: string; from: string; to: string }) {
    // Google Translate API integration
    // For now, return a placeholder — replace with actual API call when key is configured
    const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

    if (!apiKey || apiKey === 'your-google-translate-api-key') {
      return {
        translatedText: `[GT: ${body.text}]`,
        note: 'Google Translate API key not configured. Set GOOGLE_TRANSLATE_API_KEY in .env',
      };
    }

    try {
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
        },
      );

      const data = await res.json();
      const translatedText = data?.data?.translations?.[0]?.translatedText || body.text;
      return { translatedText };
    } catch {
      return { translatedText: body.text, error: 'Translation service unavailable' };
    }
  }
}
