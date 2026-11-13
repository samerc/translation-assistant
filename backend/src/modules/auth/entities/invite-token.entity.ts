import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity.js';

@Entity('invite_tokens')
export class InviteToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The tenant the invitee joins.
  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 64, unique: true })
  token: string;

  @Column({ length: 255 })
  email: string;

  // Optional, given by the inviting admin; pre-fills registration (editable there).
  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ nullable: true })
  roleId: string;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ nullable: true })
  usedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
