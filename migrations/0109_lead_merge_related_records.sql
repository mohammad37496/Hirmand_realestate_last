-- Keep legacy public tracking links and every CRM record when duplicate leads merge.
alter table leads
  add column if not exists merged_into_lead_id text;

with candidates as (
  select
    duplicate.id,
    (regexp_match(
      duplicate.note,
      'این لید در [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} با لید ([^[:space:]]+) ادغام شد[.]$'
    ))[1] as canonical_id
  from leads as duplicate
  where duplicate.status = 'closed'
    and duplicate.merged_into_lead_id is null
    and duplicate.note ~ 'این لید در [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} با لید [^[:space:]]+ ادغام شد[.]$'
), valid_candidates as (
  select candidates.id, candidates.canonical_id
  from candidates
  join leads as canonical on canonical.id = candidates.canonical_id
  where candidates.id <> candidates.canonical_id
)
update leads as duplicate
set merged_into_lead_id = valid_candidates.canonical_id
from valid_candidates
where duplicate.id = valid_candidates.id
  and duplicate.merged_into_lead_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_merged_into_lead_fk'
      and conrelid = 'leads'::regclass
  ) then
    alter table leads
      add constraint leads_merged_into_lead_fk
      foreign key (merged_into_lead_id) references leads(id)
      on delete restrict not valid;
  end if;
end $$;

alter table leads validate constraint leads_merged_into_lead_fk;

create index if not exists leads_merged_into_lead_idx
  on leads (merged_into_lead_id)
  where merged_into_lead_id is not null;

-- A merged lead can retain one feedback row for each original tracking token.
-- Refuse to discard or silently collapse existing feedback if bad data is found.
do $$
begin
  if exists (
    select tracking_token
    from lead_visit_feedback
    group by tracking_token
    having count(*) > 1
  ) then
    raise exception 'Duplicate lead_visit_feedback tracking_token values must be reviewed before migration 0109';
  end if;
end $$;

drop index if exists lead_visit_feedback_lead_idx;

create unique index if not exists lead_visit_feedback_tracking_token_idx
  on lead_visit_feedback (tracking_token);
