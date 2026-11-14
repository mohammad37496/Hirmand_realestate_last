-- Scope each admin notification to the permission that owns its data and
-- persist read/dismiss state independently for each admin account.
alter table admin_notifications
  add column if not exists required_permission text not null default 'team.manage',
  add column if not exists entity_slug text,
  add column if not exists is_stateful boolean not null default false,
  add column if not exists resolved_at timestamptz;

update admin_notifications
   set required_permission = case
     when kind in ('lead','visit') then 'lead.manage'
     when kind = 'message' then 'reports.view'
     when kind in ('publication') then 'property.publish'
     when kind in ('deal_document') then 'deal.manage'
     when kind in ('divar') then 'divar.import'
     when kind in ('property','submission','property_change','property_report') then 'property.manage'
     else 'team.manage'
   end;

update admin_notifications
   set is_stateful = true
 where source_key like any(array[
   'lead-overdue:%','lead-visit:%','customer-message:%','property-submission-overdue:%',
   'property-incomplete:%','property-no-image:%','property-verification:%','property-report:%',
   'property-publication:%','deal-document:%','data-health:%','backup-health:%'
 ]);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'admin_notifications_required_permission_check'
       and conrelid = 'admin_notifications'::regclass
  ) then
    alter table admin_notifications
      add constraint admin_notifications_required_permission_check
      check (required_permission in (
       'lead.manage','property.manage','property.publish','deal.manage','divar.import','team.manage','reports.view'
      ));
  end if;
end $$;

create index if not exists admin_notifications_scope_inbox_idx
  on admin_notifications (required_permission, created_at desc, id desc)
  where resolved_at is null;

create table if not exists admin_notification_reads (
  notification_id bigint not null references admin_notifications(id) on delete cascade,
  account_id text not null,
  read_at timestamptz not null default current_timestamp,
  dismissed_at timestamptz,
  primary key (notification_id, account_id)
);

create index if not exists admin_notification_reads_account_idx
  on admin_notification_reads (account_id, dismissed_at, read_at, notification_id);

create index if not exists customer_property_submission_events_created_idx
  on customer_property_submission_events (created_at desc);

create index if not exists customer_property_submissions_created_idx
  on customer_property_submissions (created_at desc);

create index if not exists customer_property_submissions_pending_queue_idx
  on customer_property_submissions (queue_started_at asc)
  where status = 'pending';

create index if not exists customer_messages_unread_admin_lead_idx
  on customer_messages (lead_id, created_at desc)
  where sender_type = 'customer' and read_by_admin_at is null;

create index if not exists admin_deal_documents_status_updated_idx
  on admin_deal_documents (status, updated_at desc);

create index if not exists properties_draft_updated_idx
  on properties (updated_at desc)
  where deleted_at is null and status = 'draft';

create index if not exists properties_verification_due_idx
  on properties ((coalesce(last_verified_at,published_at,updated_at,created_at)))
  where deleted_at is null and status = 'published';
