-- Manual "تأیید دستی" override for Divar ads.
--
-- The agency/consultant filter is deliberately strict, so it produces false
-- positives. The panel lets an operator approve such an ad by hand, and that
-- decision has to be durable and machine-readable: `importDivarFile` skips its
-- agency re-check for these rows, and `listDivarFiles` reports them as accepted
-- so the ad does not keep reappearing in the rejected queue.
--
-- `reject_reason` alone cannot express this — it is also written by the
-- automatic filter, so a human approval would be indistinguishable from an ad
-- the filter happened to accept on its own.
alter table divar_files
  add column if not exists manual_override boolean not null default false;
