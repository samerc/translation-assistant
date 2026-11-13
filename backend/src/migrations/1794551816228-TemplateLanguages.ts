import { MigrationInterface, QueryRunner } from 'typeorm';

/** A template's document languages (the languages its field labels are asked for). */
export class TemplateLanguages1794551816228 implements MigrationInterface {
  name = 'TemplateLanguages1794551816228';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`template_languages\` (\`template_id\` uuid NOT NULL, \`language_id\` uuid NOT NULL, INDEX \`IDX_7ee8540e6ef9f61cb15fd77a49\` (\`template_id\`), INDEX \`IDX_c5762a9d0109eeb33a1c167d41\` (\`language_id\`), PRIMARY KEY (\`template_id\`, \`language_id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`template_languages\` ADD CONSTRAINT \`FK_7ee8540e6ef9f61cb15fd77a492\` FOREIGN KEY (\`template_id\`) REFERENCES \`templates\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE \`template_languages\` ADD CONSTRAINT \`FK_c5762a9d0109eeb33a1c167d41e\` FOREIGN KEY (\`language_id\`) REFERENCES \`languages\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`template_languages\` DROP FOREIGN KEY \`FK_c5762a9d0109eeb33a1c167d41e\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`template_languages\` DROP FOREIGN KEY \`FK_7ee8540e6ef9f61cb15fd77a492\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_c5762a9d0109eeb33a1c167d41\` ON \`template_languages\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_7ee8540e6ef9f61cb15fd77a49\` ON \`template_languages\``,
    );
    await queryRunner.query(`DROP TABLE \`template_languages\``);
  }
}
