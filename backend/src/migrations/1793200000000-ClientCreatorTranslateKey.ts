import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - `clients.created_by_user_id`: non-admins see the clients they created
 *   (existing clients stay null — visible to admins and via jobs, as before).
 * - `app_settings.googleTranslateApiKey`: admin-set key for the GT helper.
 * Prod runs synchronize, which adds both columns on its own.
 */
export class ClientCreatorTranslateKey1793200000000 implements MigrationInterface {
  name = 'ClientCreatorTranslateKey1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`clients\` ADD \`created_by_user_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`googleTranslateApiKey\` varchar(255) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`googleTranslateApiKey\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`clients\` DROP COLUMN \`created_by_user_id\``,
    );
  }
}
