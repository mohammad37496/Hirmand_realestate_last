-- Review workflow metadata and audit history for customer property submissions.
alter table customer_property_submissions
  add column if not exists priority text not null default 'normal'
    check (priority in ('low','normal','high')),
  add column if not exists updated_at timestamptz not null default current_timestamp,
  add column if not exists queue_started_at timestamptz not null default current_timestamp;

create index if not exists customer_property_submissions_priority_idx
  on customer_property_submissions (status, priority, created_at desc);

create table if not exists customer_property_submission_events (
  id text primary key,
  submission_id text not null,
  action text not null,
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists customer_property_submission_events_submission_idx
  on customer_property_submission_events (submission_id, created_at desc);
