/**
 * SQL condition: a non-admin can see client `alias` — they created it, or they
 * are assigned to a job for it. Bind the user id as `:accessUserId`.
 * Shared by the client list/detail checks, global search and job creation.
 */
export function clientVisibleSql(alias: string): string {
  return `(${alias}.created_by_user_id = :accessUserId OR EXISTS (
    SELECT 1 FROM jobs aj
    INNER JOIN job_users aju ON aju.job_id = aj.id AND aju.user_id = :accessUserId
    WHERE aj.client_id = ${alias}.id
  ))`;
}
