import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Contact } from './contact.entity.js';
import { PassportCopy } from './passport-copy.entity.js';
import { ClientEmail } from './client-email.entity.js';
import { ClientPhone } from './client-phone.entity.js';
import { ClientAddress } from './client-address.entity.js';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['company', 'person'] })
  type: 'company' | 'person';

  @Column({ length: 255 })
  name: string;

  @Column({ length: 100, nullable: true })
  taxId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => ClientEmail, (e) => e.client, { cascade: true, eager: true })
  emails: ClientEmail[];

  @OneToMany(() => ClientPhone, (p) => p.client, { cascade: true, eager: true })
  phones: ClientPhone[];

  @OneToMany(() => ClientAddress, (a) => a.client, { cascade: true, eager: true })
  addresses: ClientAddress[];

  @OneToMany(() => Contact, (contact) => contact.client, { cascade: true })
  contacts: Contact[];

  @OneToMany(() => PassportCopy, (pc) => pc.client, { cascade: true })
  passportCopies: PassportCopy[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
