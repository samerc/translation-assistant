import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Document } from './document.entity.js';
import { TemplateField } from '../../templates/entities/template-field.entity.js';

@Entity('document_field_values')
export class DocumentFieldValue {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Document, (doc) => doc.fieldValues, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: Document;

  @Column({ name: 'document_id' })
  documentId: number;

  @ManyToOne(() => TemplateField)
  @JoinColumn({ name: 'template_field_id' })
  templateField: TemplateField;

  @Column({ name: 'template_field_id' })
  templateFieldId: number;

  @Column({ default: 1 })
  pageNumber: number;

  @Column({ nullable: true })
  entryIndex: number;

  @Column({ type: 'text', default: '' })
  value: string;
}
