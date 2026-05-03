import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity.js';

@Entity('client_phones')
export class ClientPhone {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Client, (client) => client.phones, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column({ length: 50 })
  phone: string;

  @Column({ length: 100, nullable: true })
  label: string;

  @Column({ default: false })
  isPrimary: boolean;
}
