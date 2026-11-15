import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { SettingsService } from '../settings/settings.service.js';
import { formatDateOnly } from '../../common/utils/display-format.js';

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

// ── Layout ──
// Email clients ignore stylesheets: everything is inline, in tables, on a
// fixed light palette (readable in every client).

const BRAND = '#4F46E5';
const TEXT = '#1F1F2E';
const MUTED = '#5F5F73';

/** Subjects come from user data: never let one span lines. */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').trim();
}

/** Escaped text with its line breaks kept. */
function multiline(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, '<br>');
}

function heading(html: string): string {
  return `<h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:700;color:${TEXT}">${html}</h1>`;
}

function para(html: string, muted = false): string {
  const size = muted
    ? 'font-size:13px;line-height:20px'
    : 'font-size:15px;line-height:24px';
  return `<p style="margin:0 0 16px;${size};color:${muted ? MUTED : TEXT}">${html}</p>`;
}

/** A button, with the address spelled out for clients that block links. */
function button(url: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:${BRAND}">` +
    `<a href="${url}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${label}</a>` +
    `</td></tr></table>` +
    `<p data-fallback style="margin:0 0 16px;font-size:12px;line-height:18px;color:${MUTED};word-break:break-all">Or open this link: <a href="${url}" style="color:${BRAND}">${url}</a></p>`
  );
}

/** The whole message: brand line, white card with the body, footer. */
export function emailLayout(body: string, senderName?: string): string {
  const brand = senderName ? escapeHtml(senderName) : 'Translation Assistant';
  const footer = senderName
    ? `Sent by ${brand} with Translation Assistant.`
    : 'Translation Assistant: translation and job management.';
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F4F4F8;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F8"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 4px 16px;font-size:15px;font-weight:700;color:${BRAND}">${brand}</td></tr>
<tr><td style="background:#ffffff;border:1px solid #E4E4EC;border-radius:12px;padding:32px 28px">${body}</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:18px;color:${MUTED}">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** The plain-text part: links become "label: url", blocks become paragraphs. */
export function toPlainText(html: string): string {
  return html
    .replace(/<p data-fallback[\s\S]*?<\/p>/g, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, '$2: $1')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|h1|table)>/g, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  /**
   * Sends one email in the shared layout. `body` is HTML built by the methods
   * below — user text always goes through escapeHtml() first.
   */
  async sendMail(
    to: string,
    subject: string,
    body: string,
    opts: { replyTo?: string } = {},
  ): Promise<void> {
    const cfg = await this.resolveConfig();
    const transporter = this.buildTransport(cfg);
    await transporter.sendMail({
      from: cfg.from,
      replyTo: opts.replyTo,
      to,
      subject,
      html: emailLayout(body),
      text: toPlainText(body),
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
      heading('Reset your password') +
        para(
          'We received a request to reset the password of your Translation Assistant account.',
        ) +
        button(url, 'Choose a new password') +
        para(
          "This link expires in 30 minutes. If you didn't ask for it, you can ignore this email: your password stays the same.",
          true,
        ),
    );
  }

  async sendInvite(
    to: string,
    token: string,
    ctx: {
      firstName?: string;
      organizationName?: string;
      roleName?: string;
    } = {},
  ): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    const url = `${baseUrl}/register?token=${token}`;
    const org = ctx.organizationName
      ? `<strong>${escapeHtml(ctx.organizationName)}</strong> on Translation Assistant`
      : 'Translation Assistant';
    const role = ctx.roleName ? ` as ${escapeHtml(ctx.roleName)}` : '';
    await this.sendMail(
      to,
      ctx.organizationName
        ? `You've been invited to join ${oneLine(ctx.organizationName)}`
        : "You've been invited to Translation Assistant",
      heading(
        ctx.firstName ? `Hi ${escapeHtml(ctx.firstName)},` : "You're invited",
      ) +
        para(`You've been invited to join ${org}${role}.`) +
        button(url, 'Create your account') +
        para('This invitation expires in 7 days.', true),
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
    details: {
      clientName?: string;
      total?: string;
      dueDate?: string;
      paymentDetails?: string | null;
    } = {},
  ): Promise<void> {
    const cfg = await this.resolveConfig();
    const transporter = this.buildTransport(cfg);
    const org = sender?.name?.trim() || undefined;
    const facts = [
      details.total && `Amount: <strong>${escapeHtml(details.total)}</strong>`,
      details.dueDate && `Due: <strong>${escapeHtml(details.dueDate)}</strong>`,
    ].filter(Boolean);
    const body =
      heading(
        details.clientName
          ? `Hello ${escapeHtml(details.clientName)},`
          : 'Hello,',
      ) +
      para(
        `Please find attached invoice <strong>${escapeHtml(invoiceNumber)}</strong>${org ? ` from ${escapeHtml(org)}` : ''}.`,
      ) +
      (facts.length ? para(facts.join(' &nbsp;·&nbsp; ')) : '') +
      (note?.trim() ? para(multiline(note.trim())) : '') +
      (details.paymentDetails?.trim()
        ? para(
            '<strong>Payment details</strong><br>' +
              multiline(details.paymentDetails.trim()),
          )
        : '') +
      para(org ? `Thank you,<br>${escapeHtml(org)}` : 'Thank you.');
    await transporter.sendMail({
      // Sent through the platform's mailbox under the tenant's name; replies go
      // to the person who sent it.
      from: this.fromAs(cfg, org),
      replyTo: sender?.replyTo,
      to,
      subject: org
        ? `Invoice ${invoiceNumber} from ${oneLine(org)}`
        : `Invoice ${invoiceNumber}`,
      html: emailLayout(body, org),
      text: toPlainText(body),
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
      heading('Confirm your email address') +
        para('Thanks for signing up for Translation Assistant.') +
        button(url, 'Confirm my email') +
        para(
          'After that, we review new organizations and email you as soon as your account is ready.',
        ) +
        para(
          "This link expires in 24 hours. If you didn't sign up, you can ignore this email.",
          true,
        ),
    );
  }

  /** Someone tried to sign up with an address that already has an account. */
  async sendSignupExistingAccount(to: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      'You already have an account',
      heading('You already have an account') +
        para(
          'Someone (probably you) tried to sign up for Translation Assistant with this email address, but it already has an account.',
        ) +
        button(`${baseUrl}/login`, 'Log in') +
        para(
          `Forgot your password? <a href="${baseUrl}/forgot-password" style="color:${BRAND}">Reset it</a>. If this wasn't you, you can ignore this email.`,
          true,
        ),
    );
  }

  async sendTenantApproved(to: string, organization: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      'Your Translation Assistant account is ready',
      heading('Your account is ready') +
        para(
          `Good news: <strong>${escapeHtml(organization)}</strong> has been approved.`,
        ) +
        button(`${baseUrl}/login`, 'Log in to get started'),
    );
  }

  /** Platform admins: an organization's admin asked to delete it. */
  async sendDeletionRequested(
    to: string,
    organization: string,
    requestedBy: string,
    reason: string | null,
  ): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      `Deletion requested: ${oneLine(organization)}`,
      heading('Deletion requested') +
        para(
          `<strong>${escapeHtml(organization)}</strong>: ${escapeHtml(requestedBy)} asked to delete the organization.`,
        ) +
        (reason ? para(`Reason: ${multiline(reason)}`) : '') +
        button(`${baseUrl}/platform`, 'Review the request'),
    );
  }

  /**
   * Organization admins: deletion approved, data purged on `deleteAfter`.
   * `contact` — the platform admin who approved it — receives the replies.
   */
  async sendDeletionScheduled(
    to: string,
    organization: string,
    deleteAfter: Date,
    opts: { dateFormat?: string; contact?: string } = {},
  ): Promise<void> {
    const date = formatDateOnly(deleteAfter, opts.dateFormat);
    await this.sendMail(
      to,
      `${oneLine(organization)} is scheduled for deletion`,
      heading('Scheduled for deletion') +
        para(
          `<strong>${escapeHtml(organization)}</strong> has been closed. Nobody can sign in to it any more.`,
        ) +
        para(
          `All of its data (clients, jobs, documents, invoices, files and accounts) will be permanently deleted on <strong>${escapeHtml(date)}</strong>.`,
        ) +
        para(
          opts.contact
            ? 'If this is a mistake, reply to this email before then and we can restore it.'
            : 'If this is a mistake, contact the Translation Assistant team before then and we can restore it.',
        ),
      { replyTo: opts.contact },
    );
  }

  /** Organization admins: the organization was deleted right away (it held no data). */
  async sendTenantDeleted(to: string, organization: string): Promise<void> {
    await this.sendMail(
      to,
      `${oneLine(organization)} has been deleted`,
      heading('Organization deleted') +
        para(
          `<strong>${escapeHtml(organization)}</strong> and its accounts have been deleted.`,
        ),
    );
  }

  /** The requester: the platform admin declined the deletion request. */
  async sendDeletionDeclined(
    to: string,
    organization: string,
    message: string | null,
    contact?: string,
  ): Promise<void> {
    await this.sendMail(
      to,
      `Your deletion request for ${oneLine(organization)}`,
      heading('Deletion request declined') +
        para(
          `Your request to delete <strong>${escapeHtml(organization)}</strong> was not approved. The organization stays as it is.`,
        ) +
        (message ? para(multiline(message)) : '') +
        (contact ? para('Questions? Reply to this email.', true) : ''),
      { replyTo: contact },
    );
  }

  /** Organization admins: restored during the grace period. */
  async sendTenantRestored(to: string, organization: string): Promise<void> {
    const { baseUrl } = await this.resolveConfig();
    await this.sendMail(
      to,
      `${oneLine(organization)} has been restored`,
      heading('Organization restored') +
        para(
          `<strong>${escapeHtml(organization)}</strong> is no longer scheduled for deletion. Its data is intact.`,
        ) +
        button(`${baseUrl}/login`, 'Log in'),
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
      `New sign-up waiting for approval: ${oneLine(organization)}`,
      heading('New sign-up') +
        para(
          `<strong>${escapeHtml(organization)}</strong> (${escapeHtml(email)}) signed up and confirmed their email.`,
        ) +
        button(`${baseUrl}/platform`, 'Review it'),
    );
  }

  async sendTestEmail(to: string): Promise<void> {
    await this.sendMail(
      to,
      'SMTP test — Translation Assistant',
      heading('It works') +
        para('Your SMTP settings are working. This is a test message.'),
    );
  }
}
