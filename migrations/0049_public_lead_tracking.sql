-- Public, non-sensitive lead tracking token for customer self-service status lookup.
alter table leads
  add column if not exists public_tracking_token text;

update leads
set public_tracking_token =
  'HIR-' || to_char(current_date, 'YY') || '-' ||
  upper(substr(md5(id || clock_timestamp()::text), 1, 12))
where public_tracking_token is null;

create unique index if not exists leads_public_tracking_token_uidx
  on leads (public_tracking_token)
  where public_tracking_token is not null;
