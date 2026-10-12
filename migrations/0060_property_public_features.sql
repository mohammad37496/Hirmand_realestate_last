-- Public questions, answers, group viewing events and RSVPs for published properties.
create table if not exists property_questions (
  id text primary key,
  property_id text not null,
  question text not null,
  answer text not null default '',
  status text not null default 'pending' check (status in ('pending','answered','hidden')),
  created_at timestamptz not null default current_timestamp,
  answered_at timestamptz,
  constraint property_questions_property_fk foreign key (property_id) references properties(id) on delete cascade
);
create index if not exists property_questions_property_status_created_idx on property_questions (property_id,status,created_at desc);
create index if not exists property_questions_property_created_idx on property_questions (property_id,created_at desc);

create table if not exists property_open_houses (
  id text primary key,
  property_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer not null default 8 check (capacity between 1 and 100),
  note text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_at timestamptz not null default current_timestamp,
  constraint property_open_houses_property_fk foreign key (property_id) references properties(id) on delete cascade,
  constraint property_open_houses_time_check check (ends_at > starts_at)
);
create index if not exists property_open_houses_property_schedule_idx on property_open_houses (property_id,status,starts_at asc);

create table if not exists property_open_house_rsvps (
  id text primary key,
  open_house_id text not null,
  name text not null,
  phone text not null,
  party_size integer not null default 1 check (party_size between 1 and 10),
  note text not null default '',
  status text not null default 'requested' check (status in ('requested','confirmed','cancelled')),
  created_at timestamptz not null default current_timestamp,
  constraint property_open_house_rsvps_event_fk foreign key (open_house_id) references property_open_houses(id) on delete cascade
);
create index if not exists property_open_house_rsvps_event_status_idx on property_open_house_rsvps (open_house_id,status,created_at asc);
create index if not exists property_open_house_rsvps_event_phone_idx on property_open_house_rsvps (open_house_id,phone);
