-- Allow a rejected contract reference to be submitted again after correction.
-- Active/pending references remain unique per partner.
drop index if exists partner_contracts_reference_unique_idx;

create unique index if not exists partner_contracts_reference_unique_idx
  on partner_contracts (partner_id, contract_reference)
  where contract_reference <> '' and status <> 'rejected';
