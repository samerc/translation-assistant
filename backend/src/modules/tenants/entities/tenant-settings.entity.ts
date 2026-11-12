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

  @Column({ type: 'varchar', length: 255, nullable: true })
  companyLogo: string | null;

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
