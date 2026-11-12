import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity.js';
import { Tenant } from '../../tenants/entities/tenant.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  // select: false — never loaded unless asked for explicitly (eager JobUser.user
  // and every other relation load would otherwise send the hash to clients).
  @Column({ length: 255, select: false })
  password: string;

  @Column({ length: 100 })
  firstName: string;

  @Column({ length: 100 })
  lastName: string;

  @Column({ length: 255, nullable: true })
  avatar: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ length: 20, default: 'indigo' })
  colorPalette: string;

  @Column({ default: false })
  darkMode: boolean;

  // Set for the seeded admin while it still has the documented default
  // password; cleared by any password change or reset. The app nags until then.
  @Column({ default: false })
  mustChangePassword: boolean;

  // ── Per-user invoice branding (appears on invoices this user issues) ──
  @Column({ length: 150, nullable: true })
  businessName: string;

  @Column({ type: 'text', nullable: true })
  businessAddress: string;

  // Logo stored inline as a `data:image/...;base64,` URL (PNG/JPEG only) so it
  // embeds straight into PDF/Word exports and the UI with no file-serving layer.
  @Column({ type: 'mediumtext', nullable: true })
  logo: string | null;

  // The organisation the user belongs to. Null only for platform admins, who
  // manage tenants but never see tenant data.
  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  // False only for self-signups that haven't clicked their email link yet.
  @Column({ default: true })
  emailVerified: boolean;

  @ManyToOne(() => Role, (role) => role.users, { eager: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ name: 'role_id' })
  roleId: string;

  @Column({ length: 512, nullable: true, select: false })
  refreshToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
