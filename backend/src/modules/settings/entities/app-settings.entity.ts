import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('app_settings')
export class AppSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, default: '' })
  companyName: string;

  @Column({ type: 'text', nullable: true })
  companyAddress: string;

  @Column({ length: 255, nullable: true })
  companyLogo: string;

  @Column({ length: 10, default: 'USD' })
  baseCurrency: string;

  @Column({ length: 50, nullable: true })
  invoicePrefix: string;

  @Column({ default: 5 })
  maxUploadSizeMb: number;

  @Column({ type: 'json', nullable: true })
  allowedFileTypes: string[];

  // ── Email / SMTP (used for password-reset + invite delivery) ──
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

  // Google Cloud Translation API key (document GT helper). Never returned by
  // the API — responses carry only `googleTranslateKeySet`. The env var
  // GOOGLE_TRANSLATE_API_KEY is used when this is empty.
  @Column({ length: 255, nullable: true })
  googleTranslateApiKey: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
