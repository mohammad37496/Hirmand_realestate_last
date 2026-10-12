-- Customer feedback after a completed viewing.
create table if not exists lead_visit_feedback (
  id bigserial primary key,
  lead_id text not null,
  tracking_token text not null,
  rating smallint not null check (rating between 1 and 5),
  interest text not null default 'unsure'
    check (interest in ('interested','unsure','not_interested')),
  note text not null default '',
  created_at timestamptz not null default current_timestamp
);

create unique index if not exists lead_visit_feedback_lead_idx
  on lead_visit_feedback (lead_id);

create index if not exists lead_visit_feedback_created_idx
  on lead_visit_feedback (created_at desc);
