import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('invite_tokens')
export class InviteToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64, unique: true })
  token: string;

  @Column({ length: 255 })
  email: string;

  @Column({ nullable: true })
  roleId: string;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ nullable: true })
  usedByUserId: string;

  @CreateDateColumn()
  createdAt: Date;
}
