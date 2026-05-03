import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity.js';
import { Contact } from '../../clients/entities/contact.entity.js';
import { Language } from '../../settings/entities/language.entity.js';
import { JobUser } from './job-user.entity.js';
import { JobFile } from './job-file.entity.js';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['template', 'freeform'], default: 'template' })
  type: 'template' | 'freeform';

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Client, { eager: true })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: number;

  @ManyToOne(() => Contact, { nullable: true, eager: true })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @Column({ name: 'contact_id', nullable: true })
  contactId: number;

  @ManyToOne(() => Language, { eager: true })
  @JoinColumn({ name: 'source_language_id' })
  sourceLanguage: Language;

  @Column({ name: 'source_language_id' })
  sourceLanguageId: number;

  @ManyToOne(() => Language, { eager: true })
  @JoinColumn({ name: 'target_language_id' })
  targetLanguage: Language;

  @Column({ name: 'target_language_id' })
  targetLanguageId: number;

  @Column({
    type: 'enum',
    enum: ['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'cancelled'],
    default: 'in_progress',
  })
  status: string;

  @Column({ type: 'date', nullable: true })
  deadline: string;

  @Column({ default: 1 })
  pageCount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pricePerPage: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountedPricePerPage: number;

  @Column({ default: false })
  useDiscountedPrice: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  calculatedTotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalPrice: number;

  @Column({ default: false })
  isFreeOfCharge: boolean;

  @Column({ type: 'text', nullable: true })
  freeOfChargeReason: string;

  @Column({ length: 10, nullable: true })
  paymentCurrency: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  paymentAmount: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => JobUser, (ju) => ju.job, { cascade: true })
  assignedUsers: JobUser[];

  @OneToMany(() => JobFile, (jf) => jf.job, { cascade: true })
  files: JobFile[];

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
