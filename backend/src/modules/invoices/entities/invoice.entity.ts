import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity.js';
import { Client } from '../../clients/entities/client.entity.js';
import { InvoiceItem } from './invoice-item.entity.js';
import { InvoicePayment } from './invoice-payment.entity.js';

@Index('UQ_invoices_tenant_number', ['tenantId', 'invoiceNumber'], {
  unique: true,
})
@Index('IDX_invoices_status', ['status'])
@Index('IDX_invoices_dueDate', ['dueDate'])
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ length: 20 })
  invoiceNumber: string;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({
    type: 'enum',
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'draft',
  })
  status: string;

  @Column({ type: 'date' })
  issueDate: string;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  taxRate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  /** When the invoice became fully paid (null while a balance remains). */
  @Column({ type: 'datetime', nullable: true })
  paidAt: Date | null;

  /** Sum of payments received (null when none) — see InvoicePayment. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  paidAmount: number | null;

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, { cascade: true })
  items: InvoiceItem[];

  @OneToMany(() => InvoicePayment, (p) => p.invoice)
  payments: InvoicePayment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
