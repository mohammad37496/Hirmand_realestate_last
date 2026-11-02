/** Archive expired published properties and write their audit events atomically. */
export const ARCHIVE_EXPIRED_PROPERTIES_SQL = `
  with archived as (
    update properties
    set status='archived',
        featured=false,
        featured_until=null,
        updated_at=current_timestamp
    where deleted_at is null
      and status='published'
      and unpublish_at is not null
      and unpublish_at<=current_timestamp
    returning id
  ), logged as (
    insert into admin_property_expiry_actions (id,property_id,action,details,created_by)
    select gen_random_uuid()::text, archived.id, 'archive', 'بایگانی پس از پایان زمان انتشار', $1
    from archived
    returning property_id
  )
  select property_id from logged
`;

/** Insert a renewal task and its audit event as one all-or-nothing statement. */
export const CREATE_PROPERTY_RENEWAL_TASK_SQL = `
  with eligible_property as (
    select id
    from properties
    where id=$4
      and deleted_at is null
      and status='published'
      and (
        (unpublish_at is not null
          and unpublish_at>current_timestamp
          and unpublish_at<=current_timestamp+interval '7 days')
        or (unpublish_at is null
          and coalesce(published_at,created_at)<current_timestamp-interval '90 days')
      )
    for update
  ), inserted as (
    insert into admin_tasks (id,title,description,status,priority,due_at,assignee,entity_type,entity_id)
    select $1,$2,$3,'open','high',current_timestamp+interval '24 hours','تیم هیرمند','property',eligible_property.id
    from eligible_property
    on conflict (entity_type,entity_id)
      where status='open' and entity_type='property' and title like 'تمدید فایل:%'
    do nothing
    returning entity_id
  ), logged as (
    insert into admin_property_expiry_actions (id,property_id,action,details,created_by)
    select $5, inserted.entity_id, 'task', 'ساخت پیگیری تمدید', $6
    from inserted
    returning property_id
  )
  select property_id from logged
`;

/** Extend a property's expiry and write its audit event atomically. */
export const EXTEND_PROPERTY_EXPIRY_SQL = `
  with updated as (
    update properties
    set unpublish_at=current_timestamp+($2::int*interval '1 day'), updated_at=current_timestamp
    where id=$1 and deleted_at is null
    returning id
  ), logged as (
    insert into admin_property_expiry_actions (id,property_id,action,details,created_by)
    select $3, updated.id, 'extend', 'تمدید ' || $2::text || ' روزه', $4
    from updated
    returning property_id
  )
  select property_id from logged
`;
