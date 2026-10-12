-- Private admin attendance log: one record per team member and work day.
create table if not exists staff_attendance (
  id text primary key,
  consultant_id text not null,
  consultant_name text not null,
  work_date date not null,
  sessions jsonb not null default '[]'::jsonb,
  note text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (consultant_id, work_date)
);

create index if not exists staff_attendance_work_date_idx
  on staff_attendance (work_date desc, consultant_name asc);

create index if not exists staff_attendance_consultant_idx
  on staff_attendance (consultant_id, work_date desc);
