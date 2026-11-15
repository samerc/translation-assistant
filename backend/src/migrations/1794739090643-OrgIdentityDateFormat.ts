import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One business identity per organization: the logo moves from each user
 * ("My Business") to the organization's settings, which also gain a tax
 * number, payment details, a default invoice footer and a date format.
 */
export class OrgIdentityDateFormat1794739090643 implements MigrationInterface {
  name = 'OrgIdentityDateFormat1794739090643';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Widen in place (keeps any stored value): logos are inline data URLs.
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` MODIFY \`companyLogo\` mediumtext NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`companyTaxId\` varchar(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`bankDetails\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`invoiceFooter\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`dateFormat\` varchar(10) NOT NULL DEFAULT 'DD/MM/YYYY'`,
    );

    // Carry each organization's per-user branding over where the organization
    // has none yet (an Admin's first, then anyone's).
    await queryRunner.query(
      `UPDATE \`tenant_settings\` ts SET ts.\`companyLogo\` = (
         SELECT u.\`logo\` FROM \`users\` u
         LEFT JOIN \`roles\` r ON r.\`id\` = u.\`role_id\`
         WHERE u.\`tenant_id\` = ts.\`tenant_id\` AND u.\`logo\` IS NOT NULL
         ORDER BY (r.\`name\` = 'Admin') DESC, u.\`createdAt\` ASC LIMIT 1)
       WHERE ts.\`companyLogo\` IS NULL`,
    );
    await queryRunner.query(
      `UPDATE \`tenant_settings\` ts SET ts.\`companyAddress\` = (
         SELECT u.\`businessAddress\` FROM \`users\` u
         LEFT JOIN \`roles\` r ON r.\`id\` = u.\`role_id\`
         WHERE u.\`tenant_id\` = ts.\`tenant_id\` AND TRIM(COALESCE(u.\`businessAddress\`, '')) <> ''
         ORDER BY (r.\`name\` = 'Admin') DESC, u.\`createdAt\` ASC LIMIT 1)
       WHERE TRIM(COALESCE(ts.\`companyAddress\`, '')) = ''`,
    );

    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`businessName\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP COLUMN \`businessAddress\``,
    );
    await queryRunner.query(`ALTER TABLE \`users\` DROP COLUMN \`logo\``);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`logo\` mediumtext NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`businessAddress\` text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD \`businessName\` varchar(150) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`dateFormat\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`invoiceFooter\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`bankDetails\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`companyTaxId\``,
    );
    // A data-URL logo can't fit the old varchar(255).
    await queryRunner.query(
      `UPDATE \`tenant_settings\` SET \`companyLogo\` = NULL WHERE CHAR_LENGTH(\`companyLogo\`) > 255`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` MODIFY \`companyLogo\` varchar(255) NULL`,
    );
  }
}
