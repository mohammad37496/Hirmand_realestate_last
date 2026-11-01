-- Keep an explicit, durable marker for a duplicate lead after it has been merged.
-- The duplicate row remains present because customer tracking tokens and their
-- conversation/feedback records are still addressed through that row.
alter table leads add column if not exists merged_into_lead_id text;

create index if not exists leads_merged_into_lead_id_idx
  on leads (merged_into_lead_id)
  where merged_into_lead_id is not null;
