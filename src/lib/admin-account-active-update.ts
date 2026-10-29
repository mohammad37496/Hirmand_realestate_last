/**
 * Update an admin account while serializing owner deactivations. Locking all
 * currently active owners makes concurrent requests re-check the invariant
 * after a competing deactivation commits.
 */
export const SET_ADMIN_ACCOUNT_ACTIVE_SQL = `
  with active_owners as materialized (
    select id
    from admin_accounts
    where role='owner' and is_active=true
    for update
  ), updated as (
    update admin_accounts target
    set is_active=$2, updated_at=current_timestamp
    where target.id=$1
      and (
        $2::boolean=true
        or target.role <> 'owner'
        or target.is_active=false
        or exists (select 1 from active_owners where id <> target.id)
      )
    returning target.id
  )
  select id, 'updated'::text as result from updated
  union all
  select target.id,
         case
           when target.role='owner' and target.is_active=true and $2::boolean=false then 'last_owner'
           else 'missing'
         end::text as result
  from admin_accounts target
  where target.id=$1 and not exists (select 1 from updated)
  limit 1
`;
