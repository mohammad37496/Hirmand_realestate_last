-- Divar import runs.
--
-- The panel used to report "آخرین بررسی" from `max(divar_files.updated_at)`,
-- which is bumped by imports and overrides too, so it never actually meant
-- "last sync". It also had no way to surface a failed or partial sync.
-- Each run of "دریافت فایل‌های دیوار" writes one row here.

create table if not exists divar_sync_runs (
  id text primary key,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),

  requested_limit integer not null default 0,
  inspected integer not null default 0,
  accepted integer not null default 0,
  newly_visible integer not null default 0,
  rejected integer not null default 0,
  requests integer not null default 0,
  duration_ms integer,

  error text,

  started_at timestamptz not null default current_timestamp,
  finished_at timestamptz
);

create index if not exists divar_sync_runs_started_idx
  on divar_sync_runs (started_at desc);

-- A crashed run leaves a dangling 'running' row; the panel treats anything
-- older than this as stale instead of showing a spinner forever.
create index if not exists divar_sync_runs_status_idx
  on divar_sync_runs (status, started_at desc);
