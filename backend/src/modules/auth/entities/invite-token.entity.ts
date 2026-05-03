import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('invite_tokens')
export class InviteToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 64, unique: true })
  token: string;

  @Column({ length: 255 })
  email: string;

  @Column({ nullable: true })
  roleId: number;

  @Column()
  expiresAt: Date;

  @Column({ default: false })
  used: boolean;

  @Column({ nullable: true })
  usedByUserId: number;

  @CreateDateColumn()
  createdAt: Date;
}
