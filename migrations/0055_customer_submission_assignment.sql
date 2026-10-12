-- Per-submission consultant assignment and queue workload metadata.
alter table customer_property_submissions
  add column if not exists assigned_consultant_name text,
  add column if not exists assigned_consultant_phone text,
  add column if not exists assigned_at timestamptz;

create index if not exists customer_property_submissions_assignment_idx
  on customer_property_submissions (status, assigned_consultant_phone, priority, queue_started_at);
