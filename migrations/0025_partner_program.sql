-- Partner referral / loyalty program:
-- each partner account receives a 12-stamp physical card.
-- every 3 approved contracts creates one available free-registration reward.
create table if not exists partner_accounts (
  id text primary key,
  partner_code text not null unique,
  agency_name text not null,
  contact_name text not null,
  phone text not null,
  pin_hash text not null,
  pin_salt text not null,
  status text not null default 'active' check (status in ('active','suspended')),
  card_number integer not null default 1,
  card_stamps smallint not null default 0 check (card_stamps >= 0 and card_stamps <= 12),
  contract_count integer not null default 0 check (contract_count >= 0),
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  last_login_at timestamptz
);

create index if not exists partner_accounts_status_idx
  on partner_accounts (status, created_at desc);

create table if not exists partner_contracts (
  id text primary key,
  partner_id text not null references partner_accounts(id) on delete cascade,
  tracking_code text not null unique,
  contract_reference text not null default '',
  client_name text not null default '',
  transaction_type text not null check (transaction_type in ('buy','sell','rent','mortgage')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text not null default '',
  approved_at timestamptz,
  rejected_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create unique index if not exists partner_contracts_reference_unique_idx
  on partner_contracts (partner_id, contract_reference)
  where contract_reference <> '';

create index if not exists partner_contracts_partner_created_idx
  on partner_contracts (partner_id, created_at desc);

create index if not exists partner_contracts_status_created_idx
  on partner_contracts (status, created_at desc);

create table if not exists partner_rewards (
  id text primary key,
  partner_id text not null references partner_accounts(id) on delete cascade,
  reward_number integer not null,
  status text not null default 'available' check (status in ('available','claimed')),
  source_contract_id text references partner_contracts(id) on delete set null,
  claim_note text not null default '',
  created_at timestamptz not null default current_timestamp,
  claimed_at timestamptz
);

create unique index if not exists partner_rewards_number_unique_idx
  on partner_rewards (partner_id, reward_number);

create index if not exists partner_rewards_partner_status_idx
  on partner_rewards (partner_id, status, created_at asc);
