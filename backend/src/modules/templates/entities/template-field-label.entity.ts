import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TemplateField } from './template-field.entity.js';
import { Language } from '../../settings/entities/language.entity.js';

@Entity('template_field_labels')
export class TemplateFieldLabel {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TemplateField, (field) => field.labels, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_field_id' })
  field: TemplateField;

  @Column({ name: 'template_field_id' })
  templateFieldId: number;

  @ManyToOne(() => Language, { eager: true })
  @JoinColumn({ name: 'language_id' })
  language: Language;

  @Column({ name: 'language_id' })
  languageId: number;

  @Column({ length: 255 })
  label: string;
}
