-- Marketing attribution on CRM leads.
-- Keeps business source ("website"/"budget_match") separate from acquisition source.
alter table leads
  add column if not exists acquisition_source text,
  add column if not exists acquisition_medium text,
  add column if not exists acquisition_campaign text,
  add column if not exists acquisition_referrer text,
  add column if not exists acquisition_landing_path text;

create index if not exists leads_acquisition_idx
  on leads (acquisition_source, acquisition_campaign, created_at desc);
