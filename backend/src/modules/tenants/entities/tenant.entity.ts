import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TenantStatus = 'pending' | 'active' | 'suspended';

/**
 * An organisation using the app (e.g. one translation office and its team).
 * Every business record (clients, jobs, documents, invoices, templates…)
 * belongs to exactly one tenant; users of one tenant never see another's.
 *
 * - pending:   self-signup waiting for platform-admin approval (no login yet)
 * - active:    normal use
 * - suspended: blocked by the platform admin; its users can't log in
 */
@Index('IDX_tenants_status', ['status'])
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'suspended'],
    default: 'active',
  })
  status: TenantStatus;

  // How the tenant was created: by the platform admin, or a public sign-up.
  @Column({ type: 'enum', enum: ['platform', 'signup'], default: 'platform' })
  source: 'platform' | 'signup';

  // Reserved for plans/pricing (not enforced yet).
  @Column({ type: 'varchar', length: 50, nullable: true })
  plan: string | null;

  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
