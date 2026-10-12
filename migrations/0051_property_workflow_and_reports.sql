-- Internal property workflow fields and a persistent public issue-report inbox.
alter table properties
  add column if not exists internal_priority text not null default 'normal'
    check (internal_priority in ('low','normal','high','urgent')),
  add column if not exists internal_note text not null default '';

create table if not exists property_reports (
  id bigserial primary key,
  property_id text not null,
  property_slug text not null,
  property_title text not null,
  report_type text not null,
  note text not null default '',
  visitor_id text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz not null default current_timestamp,
  resolved_at timestamptz
);

create index if not exists property_reports_status_created_idx
  on property_reports (status, created_at desc);

create index if not exists property_reports_property_idx
  on property_reports (property_id, created_at desc);
