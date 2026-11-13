import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organization deletion (request → approval → grace period → purge) and
 * optional invitee names on invite tokens.
 */
export class OrgDeletionInviteNames1794550083164 implements MigrationInterface {
  name = 'OrgDeletionInviteNames1794550083164';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`tenants\` ADD \`deletionRequestedAt\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` ADD \`deletionRequestedByUserId\` uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` ADD \`deletionReason\` varchar(500) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` ADD \`deleteAfter\` datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` ADD \`firstName\` varchar(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` ADD \`lastName\` varchar(100) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` ADD \`deletionGraceDays\` int NOT NULL DEFAULT '30'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` CHANGE \`status\` \`status\` enum ('pending', 'active', 'suspended', 'closing') NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('job_status_change', 'deadline_approaching', 'invoice_overdue', 'job_assigned', 'tenant_signup', 'tenant_deletion_request') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rows using the new enum values must go before the enums shrink.
    await queryRunner.query(
      `DELETE FROM \`notifications\` WHERE \`type\` = 'tenant_deletion_request'`,
    );
    await queryRunner.query(
      `UPDATE \`tenants\` SET \`status\` = 'suspended' WHERE \`status\` = 'closing'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`notifications\` CHANGE \`type\` \`type\` enum ('job_status_change', 'deadline_approaching', 'invoice_overdue', 'job_assigned', 'tenant_signup') NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` CHANGE \`status\` \`status\` enum ('pending', 'active', 'suspended') NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`app_settings\` DROP COLUMN \`deletionGraceDays\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` DROP COLUMN \`lastName\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`invite_tokens\` DROP COLUMN \`firstName\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` DROP COLUMN \`deleteAfter\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` DROP COLUMN \`deletionReason\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` DROP COLUMN \`deletionRequestedByUserId\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`tenants\` DROP COLUMN \`deletionRequestedAt\``,
    );
  }
}
