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
import { JobLineItem } from './job-line-item.entity.js';

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 20, unique: true })
  jobNumber: string;

  @Column({ type: 'enum', enum: ['template', 'freeform'], default: 'template' })
  type: 'template' | 'freeform';

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Contact, { nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact: Contact;

  @Column({ name: 'contact_id', nullable: true })
  contactId: string;

  @ManyToOne(() => Language)
  @JoinColumn({ name: 'source_language_id' })
  sourceLanguage: Language;

  @Column({ name: 'source_language_id' })
  sourceLanguageId: string;

  @ManyToOne(() => Language, { nullable: true })
  @JoinColumn({ name: 'target_language_id' })
  targetLanguage: Language;

  @Column({ name: 'target_language_id', nullable: true })
  targetLanguageId: string;

  @Column({
    type: 'enum',
    enum: ['quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'lost', 'cancelled'],
    default: 'in_progress',
  })
  status: string;

  @Column({ type: 'date', nullable: true })
  deadline: string;

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

  @OneToMany(() => JobLineItem, (li) => li.job, { cascade: true })
  lineItems: JobLineItem[];

  @OneToMany(() => JobUser, (ju) => ju.job, { cascade: true })
  assignedUsers: JobUser[];

  @OneToMany(() => JobFile, (jf) => jf.job, { cascade: true })
  files: JobFile[];

  @Column({ name: 'created_by_user_id', nullable: true })
  createdByUserId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
