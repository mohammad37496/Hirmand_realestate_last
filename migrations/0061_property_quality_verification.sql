-- Property quality controls: manual Hirmand review stamp and public quality metadata.
alter table properties
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_verified_by text;

create index if not exists properties_last_verified_idx
  on properties (last_verified_at desc);
