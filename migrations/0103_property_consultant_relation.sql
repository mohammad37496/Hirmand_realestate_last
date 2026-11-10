alter table properties
  add column if not exists consultant_id text;

alter table customer_property_submissions
  add column if not exists assigned_consultant_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_consultant_id_fkey'
      and conrelid = 'properties'::regclass
  ) then
    alter table properties
      add constraint properties_consultant_id_fkey
      foreign key (consultant_id) references consultants(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_property_submissions_assigned_consultant_id_fkey'
      and conrelid = 'customer_property_submissions'::regclass
  ) then
    alter table customer_property_submissions
      add constraint customer_property_submissions_assigned_consultant_id_fkey
      foreign key (assigned_consultant_id) references consultants(id) on delete set null;
  end if;
end $$;

create index if not exists properties_consultant_id_idx
  on properties (consultant_id) where consultant_id is not null;

create index if not exists customer_property_submissions_assigned_consultant_id_idx
  on customer_property_submissions (assigned_consultant_id)
  where assigned_consultant_id is not null;

-- Backfill only unambiguous normalized name + Iranian phone matches. Preserve
-- per-listing contact snapshots; unmatched and ambiguous legacy rows stay NULL.
create or replace function normalize_iranian_consultant_phone(value text)
returns text
language sql
immutable
as $$
  with digits as (
    select regexp_replace(
      translate(coalesce(value, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'),
      '[^0-9]', '', 'g'
    ) as value
  ), national as (
    select case
      when value like '0098%' then substring(value from 5)
      when value like '98%' then substring(value from 3)
      else value
    end as value
    from digits
  )
  select case when length(value) = 10 then '0' || value else value end
  from national;
$$;

with normalized_consultants as (
  select id,
         lower(regexp_replace(translate(trim(name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key,
         normalize_iranian_consultant_phone(phone) as phone_key
  from consultants
), normalized_properties as (
  select id,
         lower(regexp_replace(translate(trim(contact_name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key,
         normalize_iranian_consultant_phone(contact_phone) as phone_key
  from properties
  where consultant_id is null
), candidates as (
  select p.id as property_id,
         c.id as consultant_id,
         count(*) over (partition by p.id) as candidate_count
  from normalized_properties p
  join normalized_consultants c using (name_key, phone_key)
  where p.name_key <> '' and p.phone_key <> ''
)
update properties p
set consultant_id = matches.consultant_id
from candidates matches
where matches.property_id = p.id
  and matches.candidate_count = 1;

with normalized_consultants as (
  select id,
         lower(regexp_replace(translate(trim(name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key,
         normalize_iranian_consultant_phone(phone) as phone_key
  from consultants
), normalized_submissions as (
  select id,
         lower(regexp_replace(translate(trim(assigned_consultant_name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key,
         normalize_iranian_consultant_phone(assigned_consultant_phone) as phone_key
  from customer_property_submissions
  where assigned_consultant_id is null
), candidates as (
  select s.id as submission_id,
         c.id as consultant_id,
         count(*) over (partition by s.id) as candidate_count
  from normalized_submissions s
  join normalized_consultants c using (name_key, phone_key)
  where s.name_key <> '' and s.phone_key <> ''
)
update customer_property_submissions s
set assigned_consultant_id = matches.consultant_id
from candidates matches
where matches.submission_id = s.id
  and matches.candidate_count = 1;

drop function normalize_iranian_consultant_phone(text);
