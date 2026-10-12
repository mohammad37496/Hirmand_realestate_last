-- Private property-owner contact/details for the admin workspace only.
-- Kept separate from public-facing consultant contact fields.
alter table properties
  add column if not exists owner_name text not null default '',
  add column if not exists owner_phone text not null default '',
  add column if not exists owner_info text not null default '';
