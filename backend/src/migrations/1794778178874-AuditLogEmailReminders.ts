import { MigrationInterface, QueryRunner } from 'typeorm';

/** The activity (audit) log, and the per-user "email me reminders" switch (on by default). */
export class AuditLogEmailReminders1794778178874 implements MigrationInterface {
  name = 'AuditLogEmailReminders1794778178874';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`audit_logs\` (\`id\` uuid NOT NULL, \`tenant_id\` uuid NULL, \`actor_user_id\` uuid NULL, \`actor_name\` varchar(200) NOT NULL, \`actor_role\` varchar(50) NULL, \`by_platform\` tinyint NOT NULL DEFAULT 0, \`action\` varchar(60) NOT NULL, \`target_type\` varchar(30) NULL, \`target_id\` varchar(36) NULL, \`target_label\` varchar(255) NULL, \`details\` json NULL, \`ip\` varchar(64) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_audit_logs_tenant_created\` (\`tenant_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`emailReminders\` tinyint NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`emailReminders\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_audit_logs_tenant_created\` ON \`audit_logs\``,
    );
    await queryRunner.query(`DROP TABLE \`audit_logs\``);
  }
}
