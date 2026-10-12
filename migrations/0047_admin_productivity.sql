-- Admin productivity center: tasks, operational reminders, and durable work items.
create table if not exists admin_tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  status text not null default 'open'
    check (status in ('open','done','cancelled')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  due_at timestamptz,
  assignee text not null default '',
  entity_type text not null default '',
  entity_id text,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists admin_tasks_status_due_idx
  on admin_tasks (status, due_at asc nulls last);

create index if not exists admin_tasks_assignee_due_idx
  on admin_tasks (assignee, due_at asc nulls last);

create index if not exists admin_tasks_created_idx
  on admin_tasks (created_at desc);
