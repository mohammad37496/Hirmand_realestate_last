/** Change an admin password and revoke all of that account's live sessions atomically. */
export const RESET_ADMIN_ACCOUNT_PASSWORD_SQL = `
  with updated_account as (
    update admin_accounts
    set password_hash=$2, updated_at=current_timestamp
    where id=$1
    returning id
  ), revoked_sessions as (
    update admin_sessions
    set revoked_at=current_timestamp
    where account_id=$1
      and revoked_at is null
      and exists (select 1 from updated_account)
    returning id
  )
  select id from updated_account
`;
