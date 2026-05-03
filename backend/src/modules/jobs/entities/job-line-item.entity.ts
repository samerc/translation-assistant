import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Job } from './job.entity.js';

@Entity('job_line_items')
export class JobLineItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Job, (job) => job.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id' })
  jobId: number;

  @Column({ length: 255 })
  description: string;

  @Column({ nullable: true })
  templateId: number;

  @Column({ nullable: true })
  freeformJobTypeId: number;

  @Column({ default: 1 })
  pageCount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pricePerPage: number;

  @Column({ default: false })
  useDiscountedPrice: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountedPricePerPage: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lineTotal: number;

  @Column({ default: 0 })
  sortOrder: number;
}
