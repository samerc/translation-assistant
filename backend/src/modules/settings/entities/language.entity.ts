import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity.js';

// Codes are unique per owner. MariaDB treats NULLs as distinct, so uniqueness
// among global languages (tenant_id NULL) is enforced by the service.
@Index('UQ_languages_tenant_code', ['tenantId', 'code'], { unique: true })
@Entity('languages')
export class Language {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Null = global (managed by the platform admin, visible to every tenant).
  // A tenant id = a language that tenant added for itself.
  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ length: 10 })
  code: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'enum', enum: ['ltr', 'rtl'], default: 'ltr' })
  direction: 'ltr' | 'rtl';

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
