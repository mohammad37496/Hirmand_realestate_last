-- Phone Bridge: centralized release metadata for in-app update checks.

create table if not exists phone_bridge_release_settings (
  id integer primary key default 1 check (id=1),
  version_name text not null default '0.2.0',
  version_code integer not null default 20,
  download_url text not null default '',
  release_notes text not null default '',
  force_update boolean not null default false,
  updated_at timestamptz not null default current_timestamp
);

insert into phone_bridge_release_settings
  (id,version_name,version_code,download_url,release_notes,force_update)
values
  (1,'0.2.0',20,'','','false')
on conflict (id) do nothing;
