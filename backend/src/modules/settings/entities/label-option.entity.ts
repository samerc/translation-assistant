import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity.js';

@Entity('label_options')
export class LabelOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Null = global default; a tenant id = that tenant's own label.
  @ManyToOne(() => Tenant, { nullable: true })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant | null;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ length: 50 })
  category: string; // 'email', 'phone', 'address'

  @Column({ length: 100 })
  value: string;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
