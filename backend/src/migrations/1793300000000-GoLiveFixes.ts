import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Go-live fixes (2026-11). Idempotent: safe on a fresh DB that ran the earlier
 * migrations AND on prod, whose schema was built by synchronize and already
 * has the columns in block 1.
 *
 * 1. Columns synchronize added but no migration did (a fresh migration-only
 *    install crashed on boot): users business branding, app_settings SMTP.
 * 2. sessions.previousRefreshTokenHash: refresh-token reuse detection.
 * 3. job_users: drop duplicate (job_id, user_id) rows, keeping the
 *    least-privileged one, then a unique index so concurrent assigns can't
 *    create them again.
 * 4. Indexes on the columns lists, calendar and the cron filter on.
 * 5. Translator role: templates become read-only (they're shared by every
 *    user's documents), so templates:create / templates:update are removed.
 */
export class GoLiveFixes1793300000000 implements MigrationInterface {
  name = 'GoLiveFixes1793300000000';

  public async up(q: QueryRunner): Promise<void> {
    const columns: [string, string][] = [
      ['users', '`businessName` varchar(150) NULL'],
      ['users', '`businessAddress` text NULL'],
      ['users', '`logo` mediumtext NULL'],
      ['app_settings', '`smtpHost` varchar(255) NULL'],
      ['app_settings', '`smtpPort` int NULL'],
      ['app_settings', '`smtpSecure` tinyint NOT NULL DEFAULT 0'],
      ['app_settings', '`smtpUser` varchar(255) NULL'],
      ['app_settings', '`smtpPass` varchar(255) NULL'],
      ['app_settings', '`smtpFrom` varchar(255) NULL'],
      ['app_settings', '`appBaseUrl` varchar(255) NULL'],
      ['sessions', '`previousRefreshTokenHash` varchar(64) NULL'],
    ];
    for (const [table, def] of columns) {
      await q.query(`ALTER TABLE \`${table}\` ADD COLUMN IF NOT EXISTS ${def}`);
    }

    await q.query(
      `DELETE a FROM \`job_users\` a
       JOIN \`job_users\` b
         ON a.\`job_id\` = b.\`job_id\` AND a.\`user_id\` = b.\`user_id\` AND a.\`id\` <> b.\`id\`
       WHERE (a.\`permissionLevel\` = 'edit' AND b.\`permissionLevel\` = 'view')
          OR (a.\`permissionLevel\` = b.\`permissionLevel\` AND a.\`id\` > b.\`id\`)`,
    );

    const indexes: [string, string][] = [
      [
        'job_users',
        'UNIQUE INDEX IF NOT EXISTS `UQ_job_users_job_user` (`job_id`, `user_id`)',
      ],
      ['jobs', 'INDEX IF NOT EXISTS `IDX_jobs_status` (`status`)'],
      ['jobs', 'INDEX IF NOT EXISTS `IDX_jobs_deadline` (`deadline`)'],
      ['invoices', 'INDEX IF NOT EXISTS `IDX_invoices_status` (`status`)'],
      ['invoices', 'INDEX IF NOT EXISTS `IDX_invoices_dueDate` (`dueDate`)'],
      [
        'notifications',
        'INDEX IF NOT EXISTS `IDX_notifications_user_isRead` (`user_id`, `isRead`)',
      ],
      [
        'invoice_payments',
        'INDEX IF NOT EXISTS `IDX_invoice_payments_paidAt` (`paidAt`)',
      ],
    ];
    for (const [table, def] of indexes) {
      await q.query(`ALTER TABLE \`${table}\` ADD ${def}`);
    }

    await q.query(
      `DELETE rp FROM \`role_permissions\` rp
       JOIN \`roles\` r ON r.\`id\` = rp.\`role_id\`
       JOIN \`permissions\` p ON p.\`id\` = rp.\`permission_id\`
       WHERE r.\`name\` = 'Translator' AND p.\`resource\` = 'templates'
         AND p.\`action\` IN ('create', 'update')`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `INSERT INTO \`role_permissions\` (\`role_id\`, \`permission_id\`)
       SELECT r.\`id\`, p.\`id\` FROM \`roles\` r
       JOIN \`permissions\` p
         ON p.\`resource\` = 'templates' AND p.\`action\` IN ('create', 'update')
       WHERE r.\`name\` = 'Translator'
         AND NOT EXISTS (SELECT 1 FROM \`role_permissions\` rp
           WHERE rp.\`role_id\` = r.\`id\` AND rp.\`permission_id\` = p.\`id\`)`,
    );
    const indexes: [string, string][] = [
      ['invoice_payments', 'IDX_invoice_payments_paidAt'],
      ['notifications', 'IDX_notifications_user_isRead'],
      ['invoices', 'IDX_invoices_dueDate'],
      ['invoices', 'IDX_invoices_status'],
      ['jobs', 'IDX_jobs_deadline'],
      ['jobs', 'IDX_jobs_status'],
      ['job_users', 'UQ_job_users_job_user'],
    ];
    for (const [table, name] of indexes) {
      await q.query(
        `ALTER TABLE \`${table}\` DROP INDEX IF EXISTS \`${name}\``,
      );
    }
    await q.query(
      'ALTER TABLE `sessions` DROP COLUMN IF EXISTS `previousRefreshTokenHash`',
    );
    // The branding/SMTP columns predate this migration on prod (synchronize
    // created them), so they are not dropped here.
  }
}
