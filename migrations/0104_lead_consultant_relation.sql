-- Stable CRM attribution. `leads.consultant` remains a historical display
-- snapshot; it is never used as an identity join after this migration.
alter table leads
  add column if not exists consultant_id text,
  add column if not exists consultant_link_state text not null default 'pending_backfill';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_consultant_id_fkey'
      and conrelid = 'leads'::regclass
  ) then
    alter table leads
      add constraint leads_consultant_id_fkey
      foreign key (consultant_id) references consultants(id) on delete set null;
  end if;

end $$;

create index if not exists leads_consultant_id_created_idx
  on leads (consultant_id, created_at desc)
  where consultant_id is not null;

-- Backfill only a unique normalized name. `leads.phone` belongs to the
-- customer, so it is deliberately not consulted here.
with normalized_consultants as (
  select id,
         lower(regexp_replace(translate(trim(name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key
  from consultants
), normalized_leads as (
  select id,
         lower(regexp_replace(translate(trim(consultant), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key
  from leads
  where consultant_link_state = 'pending_backfill'
), candidates as (
  select l.id as lead_id,
         c.id as consultant_id,
         count(*) over (partition by l.id) as candidate_count
  from normalized_leads l
  join normalized_consultants c using (name_key)
  where l.name_key <> ''
), unique_matches as (
  select lead_id, consultant_id
  from candidates
  where candidate_count = 1
)
update leads l
set consultant_id = matches.consultant_id,
    consultant_link_state = 'linked'
from unique_matches matches
where matches.lead_id = l.id;

update leads
set consultant_link_state = case
  when consultant_id is not null then 'linked'
  when trim(coalesce(consultant,'')) = '' then 'unassigned'
  else 'legacy_unresolved'
end
where consultant_link_state = 'pending_backfill';

-- Future legacy writes get an unresolved state; they must never be picked up
-- by a manual re-run of this migration's one-time historical backfill.
alter table leads alter column consultant_link_state set default 'legacy_unresolved';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_consultant_link_state_check'
      and conrelid = 'leads'::regclass
  ) then
    alter table leads
      add constraint leads_consultant_link_state_check
      check (
        consultant_link_state in ('linked','unassigned','legacy_unresolved')
        and ((consultant_link_state = 'linked') = (consultant_id is not null))
      );
  end if;
end $$;

-- Older application versions may continue writing only the snapshot column.
-- Keep those rows unresolved rather than attaching them to a same-name person.
-- FK ON DELETE SET NULL also passes through this trigger and preserves history.
create or replace function leads_sync_consultant_link_state()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and old.consultant_id is not null
    and new.consultant_id is not distinct from old.consultant_id
    and new.consultant is distinct from old.consultant then
    -- An older application changed only the text snapshot on an already-linked
    -- row. Do not keep attributing that row to the previous consultant.
    new.consultant_id := null;
    new.consultant_link_state := 'legacy_unresolved';
  elsif new.consultant_id is not null then
    new.consultant_link_state := 'linked';
  elsif tg_op = 'UPDATE' and old.consultant_id is not null then
    new.consultant_link_state := 'legacy_unresolved';
  elsif trim(coalesce(new.consultant,'')) = '' then
    new.consultant_link_state := 'unassigned';
  elsif tg_op = 'UPDATE'
    and old.consultant_id is null
    and old.consultant_link_state = 'unassigned'
    and new.consultant is distinct from old.consultant then
    new.consultant_link_state := 'legacy_unresolved';
  elsif new.consultant_link_state is null then
    new.consultant_link_state := 'legacy_unresolved';
  end if;
  return new;
end;
$$;

drop trigger if exists leads_consultant_link_state_trg on leads;
create trigger leads_consultant_link_state_trg
before insert or update of consultant, consultant_id, consultant_link_state on leads
for each row execute function leads_sync_consultant_link_state();

-- Targets keep their consultant text as a snapshot, but lead actuals and target
-- identity are keyed by the stable consultant ID.
alter table admin_consultant_targets
  add column if not exists consultant_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'admin_consultant_targets_consultant_id_fkey'
      and conrelid = 'admin_consultant_targets'::regclass
  ) then
    alter table admin_consultant_targets
      add constraint admin_consultant_targets_consultant_id_fkey
      foreign key (consultant_id) references consultants(id) on delete set null;
  end if;
end $$;

with normalized_consultants as (
  select id,
         lower(regexp_replace(translate(trim(name), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key
  from consultants
), normalized_targets as (
  select id,
         lower(regexp_replace(translate(trim(consultant), 'كي', 'کی'), '[[:space:]]+', ' ', 'g')) as name_key
  from admin_consultant_targets
  where consultant_id is null
), candidates as (
  select t.id as target_id, c.id as consultant_id,
         count(*) over (partition by t.id) as candidate_count
  from normalized_targets t
  join normalized_consultants c using (name_key)
  where t.name_key <> ''
), unique_name_matches as (
  select target_id, consultant_id from candidates where candidate_count = 1
), non_conflicting_matches as (
  -- The legacy uniqueness key used the raw name. Two differently formatted
  -- snapshots can therefore normalize to the same consultant and month.
  -- Keep every row in that collision unresolved rather than making the new
  -- consultant_id/month unique index fail or silently choosing one target.
  select matches.target_id,
         matches.consultant_id,
         count(*) over (partition by matches.consultant_id, t.target_month) as identity_month_count
  from unique_name_matches matches
  join admin_consultant_targets t on t.id = matches.target_id
)
update admin_consultant_targets t
set consultant_id = matches.consultant_id
from non_conflicting_matches matches
where matches.target_id = t.id
  and matches.identity_month_count = 1;

alter table admin_consultant_targets
  drop constraint if exists admin_consultant_targets_consultant_target_month_key;

create unique index if not exists admin_consultant_targets_consultant_id_month_uidx
  on admin_consultant_targets (consultant_id, target_month)
  where consultant_id is not null;

create index if not exists admin_consultant_targets_month_consultant_id_idx
  on admin_consultant_targets (target_month, consultant_id);
