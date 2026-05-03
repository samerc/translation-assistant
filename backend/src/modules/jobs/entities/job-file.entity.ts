import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Job } from './job.entity.js';

@Entity('job_files')
export class JobFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Job, (job) => job.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id' })
  jobId: string;

  @Column({ type: 'enum', enum: ['source', 'translated'] })
  category: 'source' | 'translated';

  @Column({ length: 255 })
  fileName: string;

  @Column({ length: 500 })
  filePath: string;

  @Column()
  fileSize: number;

  @Column({ length: 100 })
  mimeType: string;

  @Column({ name: 'linked_from_job_id', nullable: true })
  linkedFromJobId: string;

  @Column({ name: 'uploaded_by_user_id', nullable: true })
  uploadedByUserId: string;

  @CreateDateColumn()
  uploadedAt: Date;
}
