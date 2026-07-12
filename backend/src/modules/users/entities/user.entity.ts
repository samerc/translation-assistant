import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role } from '../../roles/entities/role.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ length: 255 })
  @Exclude()
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

  // ── Per-user invoice branding (appears on invoices this user issues) ──
  @Column({ length: 150, nullable: true })
  businessName: string;

  @Column({ type: 'text', nullable: true })
  businessAddress: string;

  // Logo stored inline as a `data:image/...;base64,` URL (PNG/JPEG only) so it
  // embeds straight into PDF/Word exports and the UI with no file-serving layer.
  @Column({ type: 'mediumtext', nullable: true })
  logo: string;

  @ManyToOne(() => Role, (role) => role.users, { eager: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  @Column({ name: 'role_id' })
  roleId: string;

  @Column({ length: 512, nullable: true })
  @Exclude()
  refreshToken: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
