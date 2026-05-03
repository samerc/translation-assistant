import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Job } from './job.entity.js';

@Entity('job_files')
export class JobFile {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Job, (job) => job.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id' })
  jobId: number;

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
  linkedFromJobId: number;

  @Column({ name: 'uploaded_by_user_id', nullable: true })
  uploadedByUserId: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
