-- Supporting indexes for the next-generation CRM views.
create index if not exists leads_consultant_created_idx
  on leads(consultant, created_at desc);
create index if not exists leads_property_id_idx
  on leads(property_id);
create index if not exists lead_activities_lead_created_idx
  on lead_activities(lead_id, created_at desc);
create index if not exists admin_deals_lead_updated_idx
  on admin_deals(lead_id, updated_at desc);
create index if not exists admin_commission_settlements_deal_idx
  on admin_commission_settlements(deal_id, updated_at desc);
