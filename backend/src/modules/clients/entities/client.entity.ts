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

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['company', 'person'] })
  type: 'company' | 'person';

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ length: 100, nullable: true })
  taxId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => Contact, (contact) => contact.client, { cascade: true })
  contacts: Contact[];

  @OneToMany(() => PassportCopy, (pc) => pc.client, { cascade: true })
  passportCopies: PassportCopy[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
