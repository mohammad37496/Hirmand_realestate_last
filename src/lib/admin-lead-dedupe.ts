import type { Sql } from "./db.ts";

const DIGIT_TRANSLATION = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";

/** Load active duplicate candidates; query failures must remain distinguishable from an empty result. */
export async function listAdminLeadDuplicateCandidates(sql: Sql) {
  return sql.query<Record<string, unknown>>(
    `with base as (
      select
        id, name, phone, status, consultant, property_id, created_at,
        regexp_replace(
          translate(coalesce(phone,''), $1, '01234567890123456789'),
          '[^0-9]', '', 'g'
        ) as phone_key,
        lower(regexp_replace(trim(coalesce(name,'')), '[[:space:]]+', '', 'g')) as name_key
      from leads
      where status not in ('closed','spam')
    ),
    pairs as (
      select a.id as a_id, a.name as a_name, a.phone as a_phone, a.status as a_status, a.consultant as a_consultant, a.property_id as a_property_id, a.created_at as a_created_at,
             b.id as b_id, b.name as b_name, b.phone as b_phone, b.status as b_status, b.consultant as b_consultant, b.property_id as b_property_id, b.created_at as b_created_at,
             'تلفن مشترک'::text as reason
      from base a
      join base b on a.id < b.id and a.phone_key <> '' and a.phone_key = b.phone_key and length(a.phone_key) >= 8
      union all
      select a.id, a.name, a.phone, a.status, a.consultant, a.property_id, a.created_at,
             b.id, b.name, b.phone, b.status, b.consultant, b.property_id, b.created_at,
             'نام و فایل مشترک'::text
      from base a
      join base b on a.id < b.id
        and a.property_id is not null
        and trim(a.property_id) <> ''
        and a.property_id = b.property_id
        and a.name_key <> ''
        and a.name_key = b.name_key
    )
    select * from pairs
    order by greatest(a_created_at,b_created_at) desc
    limit 60`,
    [DIGIT_TRANSLATION],
  );
}

export type AdminLeadMergeResult =
  | { kind: "merged"; movedActivities: number }
  | { kind: "not_found" }
  | { kind: "duplicate_inactive" }
  | { kind: "canonical_inactive" }
  | { kind: "consultant_changed" };

/** Merge two active leads atomically; a closed/spam source can never be merged twice. */
export async function mergeAdminLeadDuplicate(
  sql: Sql,
  canonicalId: string,
  duplicateId: string,
): Promise<AdminLeadMergeResult> {
  if (canonicalId === duplicateId) return { kind: "not_found" };
  if (!sql.transaction) throw new Error("Lead merge requires database transaction support.");

  return sql.transaction(async (transactionSql) => {
    // Match the FK deletion lock order: consultant rows first, then lead rows.
    // A snapshot read is followed by a locked re-check before any merge write.
    const observed = await transactionSql.query<{ id: string; consultant_id: string | null }>(
      "select id,consultant_id from leads where id = any($1::text[]) order by id",
      [[canonicalId, duplicateId]],
    );
    if (observed.length !== 2) return { kind: "not_found" };
    const observedConsultantIds = [...new Set(observed.map((row) => row.consultant_id).filter((id): id is string => Boolean(id)))].sort();
    const lockedConsultants = observedConsultantIds.length
      ? await transactionSql.query<{ id: string }>(
          "select id from consultants where id = any($1::text[]) order by id for share",
          [observedConsultantIds],
        )
      : [];
    const consultantLocks = new Set(lockedConsultants.map((row) => row.id));
    const locked = await transactionSql.query<{ id: string; status: string; consultant_id: string | null }>(
      "select id,status,consultant,consultant_id,consultant_link_state from leads where id = any($1::text[]) order by id for update",
      [[canonicalId, duplicateId]],
    );
    const canonical = locked.find((row) => row.id === canonicalId);
    const duplicate = locked.find((row) => row.id === duplicateId);
    if (!canonical || !duplicate) return { kind: "not_found" };
    if (duplicate.status === "closed" || duplicate.status === "spam") {
      return { kind: "duplicate_inactive" };
    }
    if (canonical.status === "closed" || canonical.status === "spam") {
      return { kind: "canonical_inactive" };
    }
    if (locked.some((row) => row.consultant_id && !consultantLocks.has(row.consultant_id))) {
      return { kind: "consultant_changed" };
    }

    const rows = await transactionSql.query<{ canonical_id: string; moved_activities: number | string; duplicate_id: string }>(
      `with duplicate as (
        select * from leads where id = $2 and status not in ('closed','spam')
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
          consultant_id = case
            when l.consultant_id is not null then l.consultant_id
            when trim(coalesce(l.consultant,'')) = '' then d.consultant_id
            else null
          end,
          consultant_link_state = case
            when l.consultant_id is not null then 'linked'
            when trim(coalesce(l.consultant,'')) = '' then coalesce(d.consultant_link_state, 'legacy_unresolved')
            else l.consultant_link_state
          end,
          note = case when trim(coalesce(l.note,'')) = '' then d.note else l.note end,
          source = case when trim(coalesce(l.source,'')) = '' then d.source else l.source end,
          acquisition_source = coalesce(l.acquisition_source, d.acquisition_source),
          acquisition_medium = coalesce(l.acquisition_medium, d.acquisition_medium),
          acquisition_campaign = coalesce(l.acquisition_campaign, d.acquisition_campaign),
          acquisition_referrer = coalesce(l.acquisition_referrer, d.acquisition_referrer),
          follow_up_at = coalesce(l.follow_up_at, d.follow_up_at),
          last_contacted_at = coalesce(l.last_contacted_at, d.last_contacted_at),
          property_id = coalesce(l.property_id, d.property_id),
          visit_preferred_at = coalesce(l.visit_preferred_at, d.visit_preferred_at),
          visit_requested_at = coalesce(l.visit_requested_at, d.visit_requested_at),
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
          requested_bedrooms = coalesce(l.requested_bedrooms, d.requested_bedrooms),
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
          updated_at = clock_timestamp()
        from duplicate d
        where l.id = $1 and l.status not in ('closed','spam')
        returning l.id
      ),
      moved_activities as (
        update lead_activities
        set lead_id = $1
        where lead_id = $2 and exists(select 1 from merged)
        returning id
      ),
      closed_duplicate as (
        update leads
        set status = 'closed',
            note = concat_ws(E'\\n', nullif(trim(note),''), 'این لید در ' || to_char(current_timestamp,'YYYY-MM-DD HH24:MI') || ' با لید ' || $1 || ' ادغام شد.'),
            updated_at = clock_timestamp()
        where id = $2 and status not in ('closed','spam') and exists(select 1 from merged)
        returning id
      )
      select (select id from merged) as canonical_id,
             (select count(*) from moved_activities)::int as moved_activities,
             (select id from closed_duplicate) as duplicate_id`,
      [canonicalId, duplicateId],
    );
    if (!rows[0]?.canonical_id || !rows[0]?.duplicate_id) {
      return { kind: "duplicate_inactive" };
    }

    await transactionSql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'status',$2,$3,$4::jsonb)",
      [
        canonicalId,
        "ادغام لید تکراری",
        "رکورد " + duplicateId + " ادغام و بسته شد؛ فعالیت‌های CRM آن به این لید منتقل شدند.",
        JSON.stringify({ mergedLeadId: duplicateId }),
      ],
    );

    return { kind: "merged", movedActivities: Number(rows[0].moved_activities) || 0 };
  });
}
