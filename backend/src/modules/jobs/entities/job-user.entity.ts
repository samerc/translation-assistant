import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Job } from './job.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('job_users')
// One assignment per user per job — concurrent assigns can't create duplicates.
@Index('UQ_job_users_job_user', ['jobId', 'userId'], { unique: true })
export class JobUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Job, (job) => job.assignedUsers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job: Job;

  @Column({ name: 'job_id' })
  jobId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ type: 'enum', enum: ['view', 'edit'], default: 'edit' })
  permissionLevel: 'view' | 'edit';
}
