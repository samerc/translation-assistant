import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity.js';

@Entity('client_emails')
export class ClientEmail {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Client, (client) => client.emails, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: number;

  @Column({ length: 255 })
  email: string;

  @Column({ length: 100, nullable: true })
  label: string;

  @Column({ default: false })
  isPrimary: boolean;
}
