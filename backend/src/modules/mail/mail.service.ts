import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service.js';

interface ResolvedMailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  baseUrl: string;
}

/**
 * SMTP mail sender. Config is read from AppSettings (editable in the Settings > Email
 * tab) with env-var overrides. Defaults target smtp4dev (localhost:25) for local testing.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService');

  constructor(private readonly settingsService: SettingsService) {}

  private async resolveConfig(): Promise<ResolvedMailConfig> {
    const s = await this.settingsService.getSettings().catch(() => null);
    return {
      host: process.env.SMTP_HOST || s?.smtpHost || 'localhost',
      port: Number(process.env.SMTP_PORT || s?.smtpPort || 25),
      secure:
        process.env.SMTP_SECURE !== undefined
          ? process.env.SMTP_SECURE === 'true'
          : Boolean(s?.smtpSecure),
      user: process.env.SMTP_USER || s?.smtpUser || '',
      pass: process.env.SMTP_PASS || s?.smtpPass || '',
      from:
        process.env.SMTP_FROM ||
        s?.smtpFrom ||
        'Translation Assistant <no-reply@translation-assistant.local>',
      baseUrl:
        process.env.APP_BASE_URL ||
        s?.appBaseUrl ||
        process.env.CORS_ORIGIN ||
        'http://localhost:3080',
    };
  }

  private buildTransport(cfg: ResolvedMailConfig) {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  async sendMail(to: string, subject: string, html: string): Promise<void> {
    const cfg = await this.resolveConfig();
    const transporter = this.buildTransport(cfg);
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    this.logger.log(`[MAIL_SENT] to=${to} subject="${subject}" via ${cfg.host}:${cfg.port}`);
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    const url = `${baseUrl}/reset-password?token=${token}`;
    await this.sendMail(
      to,
      'Reset your password',
      `<p>We received a request to reset your password.</p>
       <p><a href="${url}">Click here to choose a new password</a>. This link expires in 30 minutes.</p>
       <p>If you didn't request this, you can ignore this email.</p>`,
    );
  }

  async sendInvite(to: string, token: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    const url = `${baseUrl}/register?token=${token}`;
    await this.sendMail(
      to,
      "You've been invited to Translation Assistant",
      `<p>You've been invited to join Translation Assistant.</p>
       <p><a href="${url}">Click here to create your account</a>. This invite expires in 7 days.</p>`,
    );
  }

  async sendTestEmail(to: string): Promise<void> {
    await this.sendMail(
      to,
      'SMTP test — Translation Assistant',
      `<p>✅ Your SMTP settings are working. This is a test message.</p>`,
    );
  }
}
