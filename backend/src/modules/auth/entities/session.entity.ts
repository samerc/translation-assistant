import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity('sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 512 })
  refreshTokenHash: string;

  @Column({ length: 45 })
  ipAddress: string;

  @Column({ length: 64 })
  userAgentHash: string;

  @Column({ length: 512, nullable: true })
  userAgentRaw: string;

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'datetime' })
  lastUsedAt: Date;

  @Column({ type: 'datetime' })
  expiresAt: Date;
}
