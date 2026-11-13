import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TenantStatus = 'pending' | 'active' | 'suspended' | 'closing';

/**
 * An organisation using the app (e.g. one translation office and its team).
 * Every business record (clients, jobs, documents, invoices, templates…)
 * belongs to exactly one tenant; users of one tenant never see another's.
 *
 * - pending:   self-signup waiting for platform-admin approval (no login yet)
 * - active:    normal use
 * - suspended: blocked by the platform admin; its users can't log in
 * - closing:   deletion approved; nobody can log in, and its data is purged
 *              at `deleteAfter` unless the platform admin restores it
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
    enum: ['pending', 'active', 'suspended', 'closing'],
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

  // ── Deletion: the organization's admin asks, the platform admin decides ──
  @Column({ type: 'datetime', nullable: true })
  deletionRequestedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  deletionRequestedByUserId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  deletionReason: string | null;

  // Set when status becomes 'closing': the purge date.
  @Column({ type: 'datetime', nullable: true })
  deleteAfter: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
