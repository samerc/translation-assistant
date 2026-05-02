import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Client } from './client.entity.js';

@Entity('client_addresses')
export class ClientAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Client, (client) => client.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'client_id' })
  clientId: number;

  @Column({ type: 'text' })
  address: string;

  @Column({ length: 100, nullable: true })
  label: string;

  @Column({ default: false })
  isPrimary: boolean;
}
