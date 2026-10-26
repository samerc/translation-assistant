import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data fix: the seeded Translator role lacked `settings:read`, so translators
 * could not load languages, labels or freeform job types — and so could not
 * create jobs. Idempotent; a no-op when the role or permission is missing.
 * Also applied by hand on prod (which still runs synchronize) — see docs/OPS.md.
 */
export class TranslatorSettingsRead1793100000000 implements MigrationInterface {
  name = 'TranslatorSettingsRead1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO \`role_permissions\` (\`role_id\`, \`permission_id\`)
       SELECT r.\`id\`, p.\`id\` FROM \`roles\` r
       JOIN \`permissions\` p ON p.\`resource\` = 'settings' AND p.\`action\` = 'read'
       WHERE r.\`name\` = 'Translator'
         AND NOT EXISTS (
           SELECT 1 FROM \`role_permissions\` rp
           WHERE rp.\`role_id\` = r.\`id\` AND rp.\`permission_id\` = p.\`id\`
         )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE rp FROM \`role_permissions\` rp
       JOIN \`roles\` r ON r.\`id\` = rp.\`role_id\`
       JOIN \`permissions\` p ON p.\`id\` = rp.\`permission_id\`
       WHERE r.\`name\` = 'Translator' AND p.\`resource\` = 'settings' AND p.\`action\` = 'read'`,
    );
  }
}
