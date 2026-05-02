import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Template } from './template.entity.js';
import { TemplateFieldLabel } from './template-field-label.entity.js';

@Entity('template_fields')
export class TemplateField {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Template, (template) => template.fields, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: Template;

  @Column({ name: 'template_id' })
  templateId: number;

  @Column({ length: 100 })
  fieldKey: string;

  @Column({
    type: 'enum',
    enum: ['text', 'textarea', 'number', 'date', 'image'],
    default: 'text',
  })
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'image';

  @Column({ default: 0 })
  sortOrder: number;

  @Column({ default: false })
  required: boolean;

  @Column({ default: false })
  isRepeatable: boolean;

  @OneToMany(() => TemplateFieldLabel, (label) => label.field, {
    cascade: true,
    eager: true,
  })
  labels: TemplateFieldLabel[];
}
