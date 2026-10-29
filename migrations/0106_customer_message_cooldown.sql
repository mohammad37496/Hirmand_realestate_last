create table if not exists customer_message_cooldowns (
  lead_id text primary key references leads(id) on delete cascade,
  next_allowed_at timestamptz not null,
  updated_at timestamptz not null default current_timestamp
);

-- Preserve the existing 12-second cooldown across deployment for recent customer messages.
insert into customer_message_cooldowns (lead_id, next_allowed_at, updated_at)
select lead_id, max(created_at) + interval '12 seconds', current_timestamp
from customer_messages
group by lead_id
having max(created_at) + interval '12 seconds' > current_timestamp
on conflict (lead_id) do update
set next_allowed_at = greatest(customer_message_cooldowns.next_allowed_at, excluded.next_allowed_at),
    updated_at = current_timestamp;
