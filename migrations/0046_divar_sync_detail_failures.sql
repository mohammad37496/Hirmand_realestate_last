-- Keep partial Divar syncs distinguishable from fully successful runs.
alter table divar_sync_runs
  add column if not exists detail_failures integer not null default 0;
