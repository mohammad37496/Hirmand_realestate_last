-- Persistent website leads for the real-estate inquiry form.
create table if not exists leads (
  id text primary key,
  name text not null,
  phone text not null,
  deal text not null,
  property_type text not null default '',
  neighborhood text not null default '',
  consultant text not null default '',
  note text not null default '',
  status text not null default 'new' check (status in ('new','contacted','closed','spam')),
  source text not null default 'website',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists leads_status_created_idx on leads (status, created_at desc);
create index if not exists leads_phone_created_idx on leads (phone, created_at desc);

create or replace function leads_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = current_timestamp; return new; end;
$$;

drop trigger if exists leads_updated_at_trg on leads;
create trigger leads_updated_at_trg before update on leads for each row execute function leads_set_updated_at();