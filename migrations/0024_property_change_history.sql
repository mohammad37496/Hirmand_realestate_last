-- Per-property admin audit history.
-- Intentionally no foreign key: delete history must survive property deletion.

create table if not exists property_change_history (
  id bigserial primary key,
  property_id text not null,
  action text not null check (action in ('created', 'updated', 'deleted')),
  before_state jsonb,
  after_state jsonb,
  changed_at timestamptz not null default current_timestamp
);

create index if not exists property_change_history_property_idx
  on property_change_history (property_id, changed_at desc);

create index if not exists property_change_history_changed_idx
  on property_change_history (changed_at desc);
