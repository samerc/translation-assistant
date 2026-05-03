import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TemplateField } from './template-field.entity.js';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ['designer', 'word'], default: 'designer' })
  type: 'designer' | 'word';

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pricePerPage: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountedPricePerPage: number;

  @Column({ type: 'json', nullable: true })
  layoutJson: object;

  @Column({ length: 500, nullable: true })
  wordFilePath: string;

  @Column({ length: 255, nullable: true })
  wordFileName: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => TemplateField, (field) => field.template, {
    cascade: true,
    eager: true,
  })
  fields: TemplateField[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
