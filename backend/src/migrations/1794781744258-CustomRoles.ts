import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configurable roles: platform defaults + organizations' own roles and their
 * customized copies of defaults. Marks the built-in roles, gives Admin "all
 * jobs", and moves each organization's old "Translators see prices: off"
 * setting into its own copy of Translator (seesPrices = 0) before the setting
 * goes away.
 */
export class CustomRoles1794781744258 implements MigrationInterface {
  name = 'CustomRoles1794781744258';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX \`IDX_648e3f5447f725579d7d4ffdfb\` ON \`roles\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles\` ADD \`tenant_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles\` ADD \`isBuiltIn\` tinyint NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles\` ADD \`overrides_role_id\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles\` ADD \`jobScope\` enum ('all', 'assigned') NOT NULL DEFAULT 'assigned'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`roles\` ADD \`seesPrices\` tinyint NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_roles_tenant\` ON \`roles\` (\`tenant_id\`)`,
    );
    await queryRunner.query(
      `UPDATE \`roles\` SET \`isBuiltIn\` = 1 WHERE \`name\` IN ('Admin', 'Translator', 'Viewer', 'Platform Admin')`,
    );
    await queryRunner.query(
      `UPDATE \`roles\` SET \`jobScope\` = 'all' WHERE \`name\` = 'Admin'`,
    );

    // Organizations that hid prices from Translators: their own Translator copy.
    const translator = (await queryRunner.query(
      `SELECT \`id\`, \`description\` FROM \`roles\` WHERE \`name\` = 'Translator' AND \`tenant_id\` IS NULL LIMIT 1`,
    )) as { id: string; description: string | null }[];
    const hiding = (await queryRunner.query(
      `SELECT \`tenant_id\` AS tenantId FROM \`tenant_settings\` WHERE \`translatorsSeePrices\` = 0`,
    )) as { tenantId: string }[];
    if (translator.length) {
      const base = translator[0];
      for (const { tenantId } of hiding) {
        const [{ id }] = (await queryRunner.query(`SELECT UUID() AS id`)) as {
          id: string;
        }[];
        await queryRunner.query(
          `INSERT INTO \`roles\` (\`id\`, \`name\`, \`description\`, \`tenant_id\`, \`isBuiltIn\`, \`overrides_role_id\`, \`jobScope\`, \`seesPrices\`)
           VALUES (?, 'Translator', ?, ?, 1, ?, 'assigned', 0)`,
          [id, base.description, tenantId, base.id],
        );
        await queryRunner.query(
          `INSERT INTO \`role_permissions\` (\`role_id\`, \`permission_id\`) SELECT ?, \`permission_id\` FROM \`role_permissions\` WHERE \`role_id\` = ?`,
          [id, base.id],
        );
        await queryRunner.query(
          `UPDATE \`users\` SET \`role_id\` = ? WHERE \`tenant_id\` = ? AND \`role_id\` = ?`,
          [id, tenantId, base.id],
        );
        await queryRunner.query(
          `UPDATE \`invite_tokens\` SET \`roleId\` = ? WHERE \`tenant_id\` = ? AND \`roleId\` = ? AND \`used\` = 0`,
          [id, tenantId, base.id],
        );
      }
    }
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`translatorsSeePrices\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`translatorsSeePrices\` tinyint NOT NULL DEFAULT 1`,
    );
    // Organizations whose Translator copy hides prices keep that as the setting.
    await queryRunner.query(
      `UPDATE \`tenant_settings\` s JOIN \`roles\` r ON r.\`tenant_id\` = s.\`tenant_id\` AND r.\`name\` = 'Translator' AND r.\`seesPrices\` = 0 SET s.\`translatorsSeePrices\` = 0`,
    );
    // Everyone on an organization's role goes back to the matching built-in
    // role (custom roles → Translator).
    await queryRunner.query(
      `UPDATE \`users\` u JOIN \`roles\` r ON r.\`id\` = u.\`role_id\` AND r.\`tenant_id\` IS NOT NULL
       SET u.\`role_id\` = COALESCE(r.\`overrides_role_id\`, (SELECT t.\`id\` FROM (SELECT \`id\` FROM \`roles\` WHERE \`name\` = 'Translator' AND \`tenant_id\` IS NULL LIMIT 1) t))`,
    );
    await queryRunner.query(
      `UPDATE \`invite_tokens\` i JOIN \`roles\` r ON r.\`id\` = i.\`roleId\` AND r.\`tenant_id\` IS NOT NULL
       SET i.\`roleId\` = COALESCE(r.\`overrides_role_id\`, (SELECT t.\`id\` FROM (SELECT \`id\` FROM \`roles\` WHERE \`name\` = 'Translator' AND \`tenant_id\` IS NULL LIMIT 1) t))`,
    );
    await queryRunner.query(
      `DELETE rp FROM \`role_permissions\` rp JOIN \`roles\` r ON r.\`id\` = rp.\`role_id\` WHERE r.\`tenant_id\` IS NOT NULL`,
    );
    await queryRunner.query(
      `DELETE FROM \`roles\` WHERE \`tenant_id\` IS NOT NULL`,
    );
    await queryRunner.query(`DROP INDEX \`IDX_roles_tenant\` ON \`roles\``);
    await queryRunner.query(`ALTER TABLE \`roles\` DROP COLUMN \`seesPrices\``);
    await queryRunner.query(`ALTER TABLE \`roles\` DROP COLUMN \`jobScope\``);
    await queryRunner.query(
      `ALTER TABLE \`roles\` DROP COLUMN \`overrides_role_id\``,
    );
    await queryRunner.query(`ALTER TABLE \`roles\` DROP COLUMN \`isBuiltIn\``);
    await queryRunner.query(`ALTER TABLE \`roles\` DROP COLUMN \`tenant_id\``);
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`IDX_648e3f5447f725579d7d4ffdfb\` ON \`roles\` (\`name\`)`,
    );
  }
}
