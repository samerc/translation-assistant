import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Platform-wide settings (a single row), managed by the platform admin:
 * outgoing email and public sign-ups. Everything a tenant configures for
 * itself (branding, currency, upload limits, Translate key) lives in
 * TenantSettings.
 */
@Entity('app_settings')
export class AppSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // ── Email / SMTP (password resets, invites, sign-up verification, invoices) ──
  @Column({ length: 255, nullable: true })
  smtpHost: string;

  @Column({ type: 'int', nullable: true })
  smtpPort: number;

  @Column({ default: false })
  smtpSecure: boolean;

  @Column({ length: 255, nullable: true })
  smtpUser: string;

  @Column({ length: 255, nullable: true })
  smtpPass: string;

  @Column({ length: 255, nullable: true })
  smtpFrom: string;

  // Base URL used to build links in emails (e.g. https://translate.fancyshark.com)
  @Column({ length: 255, nullable: true })
  appBaseUrl: string;

  // Public sign-up page on/off. New sign-ups still wait for approval.
  @Column({ default: true })
  signupsEnabled: boolean;

  // Days between approving an organization's deletion and purging its data
  // (the window in which the platform admin can still restore it).
  @Column({ type: 'int', default: 30 })
  deletionGraceDays: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
