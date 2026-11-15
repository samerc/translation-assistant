import { MigrationInterface, QueryRunner } from 'typeorm';

/** The languages a template translates from (its document languages are the ones it translates into). */
export class TemplateSourceLanguages1794761957323 implements MigrationInterface {
  name = 'TemplateSourceLanguages1794761957323';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`template_source_languages\` (\`template_id\` uuid NOT NULL, \`language_id\` uuid NOT NULL, INDEX \`IDX_745c28343ef284ccd5e1c56dcf\` (\`template_id\`), INDEX \`IDX_dc9454ed9e6657bcf1c23f63f6\` (\`language_id\`), PRIMARY KEY (\`template_id\`, \`language_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`template_source_languages\` ADD CONSTRAINT \`FK_745c28343ef284ccd5e1c56dcfd\` FOREIGN KEY (\`template_id\`) REFERENCES \`templates\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`template_source_languages\` ADD CONSTRAINT \`FK_dc9454ed9e6657bcf1c23f63f62\` FOREIGN KEY (\`language_id\`) REFERENCES \`languages\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`template_source_languages\` DROP FOREIGN KEY \`FK_dc9454ed9e6657bcf1c23f63f62\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`template_source_languages\` DROP FOREIGN KEY \`FK_745c28343ef284ccd5e1c56dcfd\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_dc9454ed9e6657bcf1c23f63f6\` ON \`template_source_languages\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_745c28343ef284ccd5e1c56dcf\` ON \`template_source_languages\``,
    );
    await queryRunner.query(`DROP TABLE \`template_source_languages\``);
  }
}
