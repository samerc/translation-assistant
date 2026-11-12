import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenancy: organizations (tenants) own their users and business data.
 *
 * - New tables: tenants, tenant_settings (one per tenant), email_verification_tokens.
 * - tenant_id on users (NULL = platform admin), invite_tokens, clients, jobs,
 *   templates, documents, invoices, freeform_job_types; nullable on languages
 *   and label_options (NULL = global list).
 * - Job and invoice numbers become unique per tenant; language codes per owner.
 * - Branding / currency / upload limits / Translate key move from app_settings
 *   (now platform-wide: SMTP + sign-ups) to tenant_settings.
 *
 * Existing data, if any, is moved into one "Default organization" (with the old
 * app settings as its settings), so nothing is lost. On an empty database
 * (fresh install) no tenant is created — the platform admin creates them.
 */
export class MultiTenancy1794467094867 implements MigrationInterface {
  name = 'MultiTenancy1794467094867';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. New tables ──
    await queryRunner.query(
      `CREATE TABLE \`tenants\` (\`id\` uuid NOT NULL, \`name\` varchar(150) NOT NULL, \`status\` enum ('pending', 'active', 'suspended') NOT NULL DEFAULT 'active', \`source\` enum ('platform', 'signup') NOT NULL DEFAULT 'platform', \`plan\` varchar(50) NULL, \`approvedAt\` datetime NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_tenants_status\` (\`status\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`email_verification_tokens\` (\`id\` uuid NOT NULL, \`token\` varchar(64) NOT NULL, \`user_id\` uuid NOT NULL, \`expiresAt\` datetime NOT NULL, \`used\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_3d1613f95c6a564a3b588d161a\` (\`token\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`tenant_settings\` (\`id\` uuid NOT NULL, \`tenant_id\` uuid NOT NULL, \`companyName\` varchar(255) NOT NULL DEFAULT '', \`companyAddress\` text NULL, \`companyLogo\` varchar(255) NULL, \`baseCurrency\` varchar(10) NOT NULL DEFAULT 'USD', \`invoicePrefix\` varchar(50) NULL, \`maxUploadSizeMb\` int NOT NULL DEFAULT '5', \`allowedFileTypes\` json NULL, \`googleTranslateApiKey\` varchar(255) NULL, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`REL_a6abc1c3ed0df635955fc852f1\` (\`tenant_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    // ── 2. Tenant columns, nullable until existing rows are assigned ──
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(`ALTER TABLE \`jobs\` ADD \`tenant_id\` uuid NULL`);
    await queryRunner.query(
      `ALTER TABLE \`templates\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoices\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`freeform_job_types\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`languages\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`label_options\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`emailVerified\` tinyint NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`signupsEnabled\` tinyint NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('job_status_change', 'deadline_approaching', 'invoice_overdue', 'job_assigned', 'tenant_signup') NOT NULL`,
    );

    // ── 3. Existing data → one "Default organization" ──
    const [{ n }] = (await queryRunner.query(
      `SELECT (SELECT COUNT(*) FROM \`users\`) + (SELECT COUNT(*) FROM \`invite_tokens\`) + (SELECT COUNT(*) FROM \`clients\`) + (SELECT COUNT(*) FROM \`jobs\`) + (SELECT COUNT(*) FROM \`templates\`) + (SELECT COUNT(*) FROM \`documents\`) + (SELECT COUNT(*) FROM \`invoices\`) + (SELECT COUNT(*) FROM \`freeform_job_types\`) AS n`,
    )) as { n: string | number }[];
    if (Number(n) > 0) {
      const [{ id }] = (await queryRunner.query('SELECT UUID() AS id')) as {
        id: string;
      }[];
      await queryRunner.query(
        `INSERT INTO \`tenants\` (\`id\`, \`name\`, \`status\`, \`source\`, \`approvedAt\`) VALUES (?, 'Default organization', 'active', 'platform', NOW())`,
        [id],
      );
      // The old app-wide branding/currency/limits become this organization's.
      await queryRunner.query(
        `INSERT INTO \`tenant_settings\` (\`id\`, \`tenant_id\`, \`companyName\`, \`companyAddress\`, \`companyLogo\`, \`baseCurrency\`, \`invoicePrefix\`, \`maxUploadSizeMb\`, \`allowedFileTypes\`, \`googleTranslateApiKey\`) SELECT UUID(), ?, COALESCE(NULLIF(\`companyName\`, ''), 'Default organization'), \`companyAddress\`, \`companyLogo\`, \`baseCurrency\`, \`invoicePrefix\`, \`maxUploadSizeMb\`, \`allowedFileTypes\`, \`googleTranslateApiKey\` FROM \`app_settings\` LIMIT 1`,
        [id],
      );
      await queryRunner.query(
        `INSERT INTO \`tenant_settings\` (\`id\`, \`tenant_id\`, \`companyName\`) SELECT UUID(), ?, 'Default organization' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM \`tenant_settings\` WHERE \`tenant_id\` = ?)`,
        [id, id],
      );
      for (const table of [
        'users',
        'invite_tokens',
        'clients',
        'jobs',
        'templates',
        'documents',
        'invoices',
        'freeform_job_types',
      ]) {
        await queryRunner.query(
          `UPDATE \`${table}\` SET \`tenant_id\` = ? WHERE \`tenant_id\` IS NULL`,
          [id],
        );
      }
    }

    // ── 4. Required where the model says so ──
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`templates\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoices\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`freeform_job_types\` MODIFY \`tenant_id\` uuid NOT NULL`,
    );

    // ── 5. Settings that moved to tenant_settings ──
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`companyName\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`companyAddress\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`companyLogo\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`baseCurrency\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`invoicePrefix\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`maxUploadSizeMb\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`allowedFileTypes\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`googleTranslateApiKey\``,
    );

    // ── 6. Uniqueness per tenant (was global) ──
    await queryRunner.query(
      `DROP INDEX \`IDX_7397752718d1c9eb873722ec9b\` ON \`languages\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_78d4c0fef5e31a5e8488e4f9c5\` ON \`jobs\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_bf8e0f9dd4558ef209ec111782\` ON \`invoices\``,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_languages_tenant_code\` ON \`languages\` (\`tenant_id\`, \`code\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_jobs_tenant_number\` ON \`jobs\` (\`tenant_id\`, \`jobNumber\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_invoices_tenant_number\` ON \`invoices\` (\`tenant_id\`, \`invoiceNumber\`)`,
    );

    // ── 7. Foreign keys ──
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_109638590074998bb72a2f2cf08\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`email_verification_tokens\` ADD CONSTRAINT \`FK_fdcb77f72f529bf65c95d72a147\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` ADD CONSTRAINT \`FK_cf3239343a43e873fd87101a28e\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD CONSTRAINT \`FK_e7d8b637725986e7b5fa774a3fd\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`languages\` ADD CONSTRAINT \`FK_3c84b1ae10ed23ae3293e9cbcee\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` ADD CONSTRAINT \`FK_6da9e1074e2c60f9c4a422a0a62\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`templates\` ADD CONSTRAINT \`FK_ddd7ea53812fb25d98cc3357926\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` ADD CONSTRAINT \`FK_5109a94ccfd3f39bf4a7a1e1fa6\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoices\` ADD CONSTRAINT \`FK_440f531f452dcc4389d201b9d4b\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`freeform_job_types\` ADD CONSTRAINT \`FK_7e806f94a6e7dd3a5f9af823f68\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`label_options\` ADD CONSTRAINT \`FK_6fcb60853513f34ee27ea145a55\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD CONSTRAINT \`FK_a6abc1c3ed0df635955fc852f1c\` FOREIGN KEY (\`tenant_id\`) REFERENCES \`tenants\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  // Reverses the schema. Rows of every tenant stay, without their tenant_id;
  // the default organization's settings are not copied back to app_settings.
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP FOREIGN KEY \`FK_a6abc1c3ed0df635955fc852f1c\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`label_options\` DROP FOREIGN KEY \`FK_6fcb60853513f34ee27ea145a55\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`freeform_job_types\` DROP FOREIGN KEY \`FK_7e806f94a6e7dd3a5f9af823f68\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoices\` DROP FOREIGN KEY \`FK_440f531f452dcc4389d201b9d4b\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` DROP FOREIGN KEY \`FK_5109a94ccfd3f39bf4a7a1e1fa6\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`templates\` DROP FOREIGN KEY \`FK_ddd7ea53812fb25d98cc3357926\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` DROP FOREIGN KEY \`FK_6da9e1074e2c60f9c4a422a0a62\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`languages\` DROP FOREIGN KEY \`FK_3c84b1ae10ed23ae3293e9cbcee\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP FOREIGN KEY \`FK_e7d8b637725986e7b5fa774a3fd\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` DROP FOREIGN KEY \`FK_cf3239343a43e873fd87101a28e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`email_verification_tokens\` DROP FOREIGN KEY \`FK_fdcb77f72f529bf65c95d72a147\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_109638590074998bb72a2f2cf08\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_invoices_tenant_number\` ON \`invoices\``,
    );
    await queryRunner.query(`DROP INDEX \`UQ_jobs_tenant_number\` ON \`jobs\``);
    await queryRunner.query(
      `DROP INDEX \`UQ_languages_tenant_code\` ON \`languages\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('job_status_change', 'deadline_approaching', 'invoice_overdue', 'job_assigned') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`label_options\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`freeform_job_types\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`signupsEnabled\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invoices\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`documents\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`templates\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(`ALTER TABLE \`jobs\` DROP COLUMN \`tenant_id\``);
    await queryRunner.query(
      `ALTER TABLE \`languages\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` DROP COLUMN \`tenant_id\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`emailVerified\``,
    );
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`tenant_id\``);
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`googleTranslateApiKey\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`allowedFileTypes\` longtext COLLATE "utf8mb4_bin" NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`maxUploadSizeMb\` int NOT NULL DEFAULT 5`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`invoicePrefix\` varchar(50) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`baseCurrency\` varchar(10) NOT NULL DEFAULT 'USD'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`companyLogo\` varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`companyAddress\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`companyName\` varchar(255) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `DROP INDEX \`REL_a6abc1c3ed0df635955fc852f1\` ON \`tenant_settings\``,
    );
    await queryRunner.query(`DROP TABLE \`tenant_settings\``);
    await queryRunner.query(
      `DROP INDEX \`IDX_3d1613f95c6a564a3b588d161a\` ON \`email_verification_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`email_verification_tokens\``);
    await queryRunner.query(`DROP INDEX \`IDX_tenants_status\` ON \`tenants\``);
    await queryRunner.query(`DROP TABLE \`tenants\``);
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_bf8e0f9dd4558ef209ec111782\` ON \`invoices\` (\`invoiceNumber\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_78d4c0fef5e31a5e8488e4f9c5\` ON \`jobs\` (\`jobNumber\`)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_7397752718d1c9eb873722ec9b\` ON \`languages\` (\`code\`)`,
    );
  }
}
