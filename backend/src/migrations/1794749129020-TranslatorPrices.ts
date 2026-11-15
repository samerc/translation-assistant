import { MigrationInterface, QueryRunner } from 'typeorm';

export class TranslatorPrices1794749129020 implements MigrationInterface {
  name = 'TranslatorPrices1794749129020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` ADD \`translatorsSeePrices\` tinyint NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenant_settings\` DROP COLUMN \`translatorsSeePrices\``,
    );
  }
}
