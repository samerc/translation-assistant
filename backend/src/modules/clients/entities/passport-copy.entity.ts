import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Client } from './client.entity.js';

@Entity('passport_copies')
export class PassportCopy {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Client, (client) => client.passportCopies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: number;

  @Column({ length: 255 })
  label: string;

  @Column({ length: 500 })
  filePath: string;

  @Column({ length: 255 })
  originalName: string;

  @Column({ length: 100 })
  mimeType: string;

  @Column()
  fileSize: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
