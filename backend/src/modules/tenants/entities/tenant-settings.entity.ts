import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity.js';

/**
 * One row per tenant: its branding, invoicing defaults, upload limits and
 * Google Translate key. Job and invoice numbering lock this row to serialize
 * concurrent creates within the tenant (other tenants are not blocked).
 */
@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 255, default: '' })
  companyName: string;

  @Column({ type: 'text', nullable: true })
  companyAddress: string | null;

  // Logo stored inline as a `data:image/...;base64,` URL (PNG/JPEG, ≤1 MB) so
  // it embeds straight into PDF/Word invoices with no file-serving layer.
  @Column({ type: 'mediumtext', nullable: true })
  companyLogo: string | null;

  /** VAT / tax registration number, printed under the address on invoices. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  companyTaxId: string | null;

  /** How to pay (bank, IBAN, transfer services) — printed at the end of invoices. */
  @Column({ type: 'text', nullable: true })
  bankDetails: string | null;

  /** Payment terms / footer pre-filled into each new invoice's notes. */
  @Column({ type: 'text', nullable: true })
  invoiceFooter: string | null;

  /** Date display everywhere (app, PDF, Word): DD/MM/YYYY, MM/DD/YYYY or YYYY-MM-DD. */
  @Column({ length: 10, default: 'DD/MM/YYYY' })
  dateFormat: string;

  /** Whether Translators see prices (job totals, line-item and template prices). Admins and Viewers always do. */
  @Column({ default: true })
  translatorsSeePrices: boolean;

  @Column({ length: 10, default: 'USD' })
  baseCurrency: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  invoicePrefix: string | null;

  @Column({ default: 5 })
  maxUploadSizeMb: number;

  @Column({ type: 'json', nullable: true })
  allowedFileTypes: string[] | null;

  // Google Cloud Translation key: each tenant uses (and pays for) its own.
  // Never returned by the API — responses carry only `googleTranslateKeySet`.
  @Column({ type: 'varchar', length: 255, nullable: true })
  googleTranslateApiKey: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
