import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('app_settings')
export class AppSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, default: '' })
  companyName: string;

  @Column({ type: 'text', nullable: true })
  companyAddress: string;

  @Column({ length: 255, nullable: true })
  companyLogo: string;

  @Column({ length: 10, default: 'USD' })
  baseCurrency: string;

  @Column({ length: 50, nullable: true })
  invoicePrefix: string;

  @Column({ default: 5 })
  maxUploadSizeMb: number;

  @Column({ type: 'json', nullable: true })
  allowedFileTypes: string[];

  @UpdateDateColumn()
  updatedAt: Date;
}
