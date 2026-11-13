import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { Language } from '../../settings/entities/language.entity.js';
import { Tenant } from '../../tenants/entities/tenant.entity.js';
import { TemplateField } from './template-field.entity.js';

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'enum',
    enum: ['designer', 'word', 'simple'],
    default: 'designer',
  })
  type: 'designer' | 'word' | 'simple';

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

  // Inactive = draft: hidden when creating jobs. The setup wizard creates
  // templates inactive and activates them at the end.
  @Column({ default: true })
  isActive: boolean;

  // The languages the document is produced in (its field labels are asked
  // for these). Empty = not set yet: offered for every target language.
  @ManyToMany(() => Language)
  @JoinTable({
    name: 'template_languages',
    joinColumn: { name: 'template_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'language_id', referencedColumnName: 'id' },
  })
  languages: Language[];

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
