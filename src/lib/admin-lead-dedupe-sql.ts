/** Merge the lead rows, move CRM activities, close the duplicate, and write the audit event in one statement. */
export const MERGE_LEADS_WITH_ACTIVITY_SQL = `
  with locked as materialized (
    select id from leads
    where id = any($3::text[]) and merged_into_lead_id is null
    order by id for update
  ),
  duplicate as (
    select d.* from leads d
    join locked on locked.id = d.id
    where d.id = $2
      and d.merged_into_lead_id is null
      and exists (select 1 from locked where id = $1)
      and (select count(*) from locked) = 2
      and not exists (
        select 1 from leads c
        where c.id=$1 and c.visit_status in ('cancelled','completed')
          and d.visit_status in ('requested','confirmed')
      )
  ),
  merged as (
    update leads l
    set
      name = case when trim(coalesce(l.name,'')) = '' then d.name else l.name end,
      phone = case when trim(coalesce(l.phone,'')) = '' then d.phone else l.phone end,
      people_count = coalesce(l.people_count, d.people_count),
      job = case when trim(coalesce(l.job,'')) = '' then d.job else l.job end,
      deal = case when trim(coalesce(l.deal,'')) = '' then d.deal else l.deal end,
      property_type = case when trim(coalesce(l.property_type,'')) = '' then d.property_type else l.property_type end,
      neighborhood = case when trim(coalesce(l.neighborhood,'')) = '' then d.neighborhood else l.neighborhood end,
      consultant = case when trim(coalesce(l.consultant,'')) = '' then d.consultant else l.consultant end,
      note = case when trim(coalesce(l.note,'')) = '' then d.note else l.note end,
      source = case when trim(coalesce(l.source,'')) = '' then d.source else l.source end,
      acquisition_source = coalesce(l.acquisition_source, d.acquisition_source),
      acquisition_medium = coalesce(l.acquisition_medium, d.acquisition_medium),
      acquisition_campaign = coalesce(l.acquisition_campaign, d.acquisition_campaign),
      acquisition_referrer = coalesce(l.acquisition_referrer, d.acquisition_referrer),
      acquisition_landing_path = coalesce(l.acquisition_landing_path, d.acquisition_landing_path),
      follow_up_at = coalesce(l.follow_up_at, d.follow_up_at),
      last_contacted_at = coalesce(l.last_contacted_at, d.last_contacted_at),
      callback_preferred_at = coalesce(l.callback_preferred_at, d.callback_preferred_at),
      offer_amount = coalesce(l.offer_amount, d.offer_amount),
      offer_conditions = case when trim(coalesce(l.offer_conditions,'')) = '' then d.offer_conditions else l.offer_conditions end,
      property_id = case
        when coalesce(l.visit_status,'none')='none' and d.visit_status in ('requested','confirmed') then d.property_id
        else coalesce(l.property_id, d.property_id)
      end,
      visit_preferred_at = case
        when coalesce(l.visit_status,'none')='none' and d.visit_status in ('requested','confirmed') then d.visit_preferred_at
        else coalesce(l.visit_preferred_at, d.visit_preferred_at)
      end,
      visit_requested_at = case
        when coalesce(l.visit_status,'none')='none' and d.visit_status in ('requested','confirmed') then d.visit_requested_at
        else coalesce(l.visit_requested_at, d.visit_requested_at)
      end,
      visit_status = case when coalesce(l.visit_status,'none') = 'none' then coalesce(d.visit_status,l.visit_status) else l.visit_status end,
      lease_deadline = coalesce(l.lease_deadline, d.lease_deadline),
      budget_deposit = coalesce(l.budget_deposit, d.budget_deposit),
      budget_rent = coalesce(l.budget_rent, d.budget_rent),
      budget_purchase = coalesce(l.budget_purchase, d.budget_purchase),
      budget_sale = coalesce(l.budget_sale, d.budget_sale),
      budget_deposit_min = coalesce(l.budget_deposit_min, d.budget_deposit_min),
      budget_deposit_max = coalesce(l.budget_deposit_max, d.budget_deposit_max),
      budget_rent_min = coalesce(l.budget_rent_min, d.budget_rent_min),
      budget_rent_max = coalesce(l.budget_rent_max, d.budget_rent_max),
      budget_purchase_min = coalesce(l.budget_purchase_min, d.budget_purchase_min),
      budget_purchase_max = coalesce(l.budget_purchase_max, d.budget_purchase_max),
      budget_sale_min = coalesce(l.budget_sale_min, d.budget_sale_min),
      budget_sale_max = coalesce(l.budget_sale_max, d.budget_sale_max),
      budget_equivalent = coalesce(l.budget_equivalent, d.budget_equivalent),
      budget_bedrooms = coalesce(l.budget_bedrooms, d.budget_bedrooms),
      budget_rate = coalesce(l.budget_rate, d.budget_rate),
      floor_preference = case when trim(coalesce(l.floor_preference,'')) = '' then d.floor_preference else l.floor_preference end,
      requested_bedrooms = coalesce(l.requested_bedrooms, d.requested_bedrooms),
      requested_area_min = coalesce(l.requested_area_min, d.requested_area_min),
      requested_area_max = coalesce(l.requested_area_max, d.requested_area_max),
      requested_amenities = case
        when jsonb_array_length(coalesce(l.requested_amenities,'[]'::jsonb)) = 0
          then coalesce(d.requested_amenities,'[]'::jsonb)
        else l.requested_amenities
      end,
      matched_properties = case
        when jsonb_array_length(coalesce(l.matched_properties,'[]'::jsonb)) = 0
          then coalesce(d.matched_properties,'[]'::jsonb)
        else l.matched_properties
      end,
      match_count = greatest(coalesce(l.match_count,0),coalesce(d.match_count,0)),
      updated_at = current_timestamp
    from duplicate d
    where l.id = $1 and exists (select 1 from duplicate)
    returning l.id
  ),
  moved_activities as (
    update lead_activities
    set lead_id = $1
    where lead_id = $2 and exists (select 1 from merged)
    returning id
  ),
  closed_duplicate as (
    update leads
    set
      status = 'closed',
      merged_into_lead_id = $1,
      visit_status = case when visit_status in ('requested','confirmed') then 'cancelled' else visit_status end,
      note = concat_ws(E'\\n', nullif(trim(note),''), 'این لید در ' || to_char(current_timestamp,'YYYY-MM-DD HH24:MI') || ' با لید ' || $1 || ' ادغام شد.'),
      updated_at = current_timestamp
    where id = $2 and exists (select 1 from merged)
    returning id
  ),
  merge_history as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select $1, 'status', 'ادغام لید تکراری',
      'رکورد ' || $2 || ' در این لید ادغام شد. رکورد دوم بسته و فعالیت‌های CRM منتقل شدند.',
      jsonb_build_object('mergedLeadId', $2, 'movedActivities', (select count(*) from moved_activities))
    from closed_duplicate
    returning id
  )
  select (select id from merged) as canonical_id,
         (select count(*) from moved_activities)::int as moved_activities,
         (select id from closed_duplicate) as duplicate_id,
         (select id from merge_history) as history_id
`;
