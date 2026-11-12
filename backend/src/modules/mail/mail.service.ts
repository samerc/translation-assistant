import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service.js';

/** Escape user-provided text before embedding it in an HTML email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    const s = await this.settingsService
      .getPlatformSettings()
      .catch(() => null);
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
      text: html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    });
    this.logger.log(
      `[MAIL_SENT] to=${to} subject="${subject}" via ${cfg.host}:${cfg.port}`,
    );
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

  /** `"Business name" <platform address>`: the platform mailbox, the sender name. */
  private fromAs(cfg: ResolvedMailConfig, displayName?: string): string {
    const name = displayName?.replace(/["<>\r\n]/g, '').trim();
    if (!name) return cfg.from;
    const address = /<([^>]+)>/.exec(cfg.from)?.[1] ?? cfg.from;
    return `"${name.slice(0, 100)}" <${address}>`;
  }

  async sendInvoiceEmail(
    to: string,
    invoiceNumber: string,
    pdfPath: string,
    note?: string,
    sender?: { name?: string; replyTo?: string },
  ): Promise<void> {
    const cfg = await this.resolveConfig();
    const transporter = this.buildTransport(cfg);
    const intro = note?.trim()
      ? `<p>${escapeHtml(note.trim())}</p>`
      : `<p>Please find attached invoice <strong>${escapeHtml(invoiceNumber)}</strong>.</p>`;
    await transporter.sendMail({
      // Sent through the platform's mailbox under the tenant's name; replies go
      // to the person who sent it.
      from: this.fromAs(cfg, sender?.name),
      replyTo: sender?.replyTo,
      to,
      subject: `Invoice ${invoiceNumber}`,
      html: `${intro}<p>Thank you.</p>`,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          path: pdfPath,
          contentType: 'application/pdf',
        },
      ],
    });
    this.logger.log(
      `[INVOICE_EMAIL_SENT] to=${to} invoice=${invoiceNumber} via ${cfg.host}:${cfg.port}`,
    );
  }

  // ── Sign-up ──

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    const url = `${baseUrl}/verify-email?token=${token}`;
    await this.sendMail(
      to,
      'Confirm your email address',
      `<p>Thanks for signing up for Translation Assistant.</p>
       <p><a href="${url}">Click here to confirm your email address</a>. This link expires in 24 hours.</p>
       <p>After that, we review new organizations and email you as soon as your account is ready.</p>
       <p>If you didn't sign up, you can ignore this email.</p>`,
    );
  }

  /** Someone tried to sign up with an address that already has an account. */
  async sendSignupExistingAccount(to: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      'You already have an account',
      `<p>Someone (probably you) tried to sign up for Translation Assistant with this email address, but it already has an account.</p>
       <p><a href="${baseUrl}/login">Log in</a>, or <a href="${baseUrl}/forgot-password">reset your password</a> if you forgot it.</p>
       <p>If this wasn't you, you can ignore this email.</p>`,
    );
  }

  async sendTenantApproved(to: string, organization: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      'Your Translation Assistant account is ready',
      `<p>Good news: <strong>${escapeHtml(organization)}</strong> has been approved.</p>
       <p><a href="${baseUrl}/login">Log in to get started</a>.</p>`,
    );
  }

  /** Tells the platform admins a confirmed sign-up is waiting for approval. */
  async sendSignupAwaitingApproval(
    to: string,
    organization: string,
    email: string,
  ): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      `New sign-up waiting for approval: ${organization}`,
      `<p><strong>${escapeHtml(organization)}</strong> (${escapeHtml(email)}) signed up and confirmed their email.</p>
       <p><a href="${baseUrl}/platform">Review it in the platform area</a>.</p>`,
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
