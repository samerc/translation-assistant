import { MigrationInterface, QueryRunner } from 'typeorm';

/** Idempotent — also run by hand on prod, which uses synchronize (docs/OPS.md section 0). */
export const INVOICE_PAYMENTS_BACKFILL = `INSERT INTO invoice_payments (id, invoice_id, amount, paidAt, note)
  SELECT UUID(), i.id, i.paidAmount, DATE(COALESCE(i.paidAt, i.updatedAt)), 'Recorded before partial payments'
  FROM invoices i
  WHERE i.paidAmount IS NOT NULL AND i.paidAmount > 0
    AND NOT EXISTS (SELECT 1 FROM invoice_payments p WHERE p.invoice_id = i.id)`;

export class InvoicePayments1793015124357 implements MigrationInterface {
  name = 'InvoicePayments1793015124357';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`invoice_payments\` (\`id\` uuid NOT NULL, \`invoice_id\` uuid NOT NULL, \`amount\` decimal(10,2) NOT NULL, \`paidAt\` date NOT NULL, \`method\` varchar(50) NULL, \`note\` varchar(255) NULL, \`created_by_user_id\` uuid NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoice_payments\` ADD CONSTRAINT \`FK_e94fa427d3da279450dba6f4aa6\` FOREIGN KEY (\`invoice_id\`) REFERENCES \`invoices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    // Backfill: an invoice paid before partial payments existed becomes one payment
    // row, so revenue reports (now summed from payments) keep counting it.
    await queryRunner.query(INVOICE_PAYMENTS_BACKFILL);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`invoice_payments\` DROP FOREIGN KEY \`FK_e94fa427d3da279450dba6f4aa6\``,
    );
    await queryRunner.query(`DROP TABLE \`invoice_payments\``);
  }
}
