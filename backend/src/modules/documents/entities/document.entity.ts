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
import { Job } from '../../jobs/entities/job.entity.js';
import { Template } from '../../templates/entities/template.entity.js';
import { DocumentFieldValue } from './document-field-value.entity.js';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Job, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id' })
  jobId: string;

  @ManyToOne(() => Template)
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @Column({ name: 'template_id' })
  templateId: string;

  @Column({ type: 'enum', enum: ['draft', 'completed'], default: 'draft' })
  status: 'draft' | 'completed';

  @Column({ name: 'cloned_from_id', nullable: true })
  clonedFromId: string;

  @OneToMany(() => DocumentFieldValue, (fv) => fv.document, { cascade: true })
  fieldValues: DocumentFieldValue[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
