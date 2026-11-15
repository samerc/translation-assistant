import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Who did what, when: one row per important action (role changes, deletions,
 * invoice changes, settings, platform decisions…). Written by `AuditInterceptor`
 * for routes marked `@Audited()`.
 *
 * Deliberately no foreign keys: an entry keeps its actor's name and the target's
 * label as they were, so it still reads correctly after the user or record is
 * deleted. `tenantId` NULL = a platform-level action (platform settings, global
 * languages); platform actions on an organization carry that organization's id
 * (`byPlatform`), so its admins can see them.
 */
@Index('IDX_audit_logs_tenant_created', ['tenantId', 'createdAt'])
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ name: 'actor_name', length: 200 })
  actorName: string;

  @Column({ name: 'actor_role', type: 'varchar', length: 50, nullable: true })
  actorRole: string | null;

  /** The platform admin acted (on this organization, or platform-wide). */
  @Column({ name: 'by_platform', default: false })
  byPlatform: boolean;

  /** e.g. `invoice.deleted`, `user.role_changed`. */
  @Column({ length: 60 })
  action: string;

  @Column({ name: 'target_type', type: 'varchar', length: 30, nullable: true })
  targetType: string | null;

  @Column({ name: 'target_id', type: 'varchar', length: 36, nullable: true })
  targetId: string | null;

  /** The target's name/number at the time (e.g. "INV-0012"). */
  @Column({
    name: 'target_label',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  targetLabel: string | null;

  /** Small JSON object: the values that changed, never secrets. */
  @Column({ type: 'json', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
