-- Customer/consultant conversation thread attached to an existing tracking code.
create table if not exists customer_messages (
  id text primary key,
  lead_id text not null references leads(id) on delete cascade,
  tracking_token text not null,
  sender_type text not null check (sender_type in ('customer','admin')),
  sender_name text not null default '',
  message text not null,
  created_at timestamptz not null default current_timestamp,
  read_by_customer_at timestamptz,
  read_by_admin_at timestamptz
);

create index if not exists customer_messages_thread_idx
  on customer_messages (tracking_token, created_at asc);

create index if not exists customer_messages_unread_admin_idx
  on customer_messages (sender_type, read_by_admin_at, created_at desc)
  where sender_type = 'customer' and read_by_admin_at is null;

create index if not exists customer_messages_unread_customer_idx
  on customer_messages (sender_type, read_by_customer_at, created_at desc)
  where sender_type = 'admin' and read_by_customer_at is null;
