-- Customer-submitted property listings awaiting human moderation.
create table if not exists customer_property_submissions (
  id text primary key,
  lead_id text,
  public_tracking_token text not null unique,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  owner_name text not null,
  owner_phone text not null,
  property_data jsonb not null default '{}'::jsonb,
  review_note text not null default '',
  property_id text,
  created_at timestamptz not null default current_timestamp,
  reviewed_at timestamptz
);

create index if not exists customer_property_submissions_status_created_idx
  on customer_property_submissions (status, created_at desc);
create index if not exists customer_property_submissions_lead_idx
  on customer_property_submissions (lead_id);
