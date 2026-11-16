import { MigrationInterface, QueryRunner } from 'typeorm';

/** Job statuses inside the fixed stages (platform defaults + each organization's own). */
export class JobStatuses1794812415062 implements MigrationInterface {
  name = 'JobStatuses1794812415062';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`job_statuses\` (\`id\` uuid NOT NULL, \`tenant_id\` uuid NULL, \`stage\` enum ('quote', 'accepted', 'in_progress', 'delivered', 'invoiced', 'paid', 'lost', 'cancelled') NOT NULL, \`name\` varchar(60) NOT NULL, \`tone\` varchar(20) NOT NULL DEFAULT 'neutral', \`sortOrder\` int NOT NULL DEFAULT '0', \`notify\` enum ('none', 'assignees', 'admins', 'both') NOT NULL DEFAULT 'assignees', \`isActive\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_job_statuses_tenant\` (\`tenant_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` ADD \`custom_status_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`jobStatusPrefs\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` ADD CONSTRAINT \`FK_8c8ddd2e3af6586c494851e4761\` FOREIGN KEY (\`custom_status_id\`) REFERENCES \`job_statuses\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    // The first platform default: Proofreading, inside In progress.
    await queryRunner.query(
      `INSERT INTO \`job_statuses\` (\`id\`, \`tenant_id\`, \`stage\`, \`name\`, \`tone\`, \`sortOrder\`, \`notify\`) VALUES (UUID(), NULL, 'in_progress', 'Proofreading', 'accent', 1, 'assignees')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`jobs\` DROP FOREIGN KEY \`FK_8c8ddd2e3af6586c494851e4761\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`jobStatusPrefs\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`jobs\` DROP COLUMN \`custom_status_id\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_job_statuses_tenant\` ON \`job_statuses\``,
    );
    await queryRunner.query(`DROP TABLE \`job_statuses\``);
  }
}
