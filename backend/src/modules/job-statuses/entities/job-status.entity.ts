import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  JOB_STAGES,
  STATUS_NOTIFY,
} from '../../../common/tenancy/job-stages.js';

/**
 * A job status inside a stage: a platform default (`tenantId` NULL, offered to
 * every organization, which may hide it) or an organization's own.
 */
@Entity('job_statuses')
@Index('IDX_job_statuses_tenant', ['tenantId'])
export class JobStatus {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'enum', enum: JOB_STAGES })
  stage: string;

  @Column({ length: 60 })
  name: string;

  @Column({ length: 20, default: 'neutral' })
  tone: string;

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ type: 'enum', enum: STATUS_NOTIFY, default: 'assignees' })
  notify: string;

  /** false = not offered any more (jobs that have it keep it). */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
