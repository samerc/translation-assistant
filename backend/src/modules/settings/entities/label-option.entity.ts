import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('label_options')
export class LabelOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  category: string; // 'email', 'phone', 'address'

  @Column({ length: 100 })
  value: string;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
