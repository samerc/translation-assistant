import {
  Index,
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Permission } from './permission.entity.js';
import { User } from '../../users/entities/user.entity.js';

/** Who sees which jobs (and clients): all of the organization's, or only those assigned to them. */
export type JobScope = 'all' | 'assigned';

/**
 * Roles. `tenantId` NULL = a platform role: the built-in ones (Admin,
 * Translator, Viewer, Platform Admin) and the defaults the platform admin adds
 * (e.g. Accounting) — every organization uses these as they are. An
 * organization can change a default for itself: that makes its own copy
 * (`overridesRoleId` → the default; its users move to the copy) and it no
 * longer follows the default. It can also add roles of its own. Admin and
 * Platform Admin are locked (the seed sets them on every boot).
 */
@Index('IDX_roles_tenant', ['tenantId'])
@Entity('roles')
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique among a tenant's roles + the platform's (checked by RolesService). */
  @Column({ length: 100 })
  name: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  /** Admin / Translator / Viewer / Platform Admin: the name can't change, the role can't be deleted. */
  @Column({ default: false })
  isBuiltIn: boolean;

  /** An organization's own copy of this platform default. */
  @Column({ name: 'overrides_role_id', type: 'uuid', nullable: true })
  overridesRoleId: string | null;

  @Column({ type: 'enum', enum: ['all', 'assigned'], default: 'assigned' })
  jobScope: JobScope;

  /** False: the API leaves every price out for this role, and its writes can't set them. */
  @Column({ default: true })
  seesPrices: boolean;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ManyToMany(() => Permission, (permission) => permission.roles, {
    eager: true,
  })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @OneToMany(() => User, (user) => user.role)
  users: User[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
