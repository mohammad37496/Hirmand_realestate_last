import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

const DIGIT_TRANSLATION = "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩";

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی ادغام و بررسی درخواست‌های تکراری برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);
  if (dbSource === "unconfigured") {
    return { groups: [], total: 0 };
  }

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "list";
  const sql = await getSql();

  if (action === "list") {
    const rows = await sql.query<Record<string, unknown>>(
      `with base as (
        select
          id, name, phone, status, consultant, property_id, created_at,
          regexp_replace(
            translate(coalesce(phone,''), $1, '01234567890123456789'),
            '[^0-9]', '', 'g'
          ) as phone_key,
          lower(regexp_replace(trim(coalesce(name,'')), '[[:space:]]+', '', 'g')) as name_key
        from leads
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
    ).catch((error) => {
      console.error("[admin-lead-dedupe] query unavailable", error);
      return [];
    });

    return {
      total: rows.length,
      groups: rows.map((row) => ({
        id: String(row.a_id) + "::" + String(row.b_id) + "::" + String(row.reason),
        reason: String(row.reason),
        leads: [
          {
            id: String(row.a_id),
            name: String(row.a_name ?? ""),
            phone: String(row.a_phone ?? ""),
            status: String(row.a_status ?? ""),
            consultant: String(row.a_consultant ?? ""),
            propertyId: row.a_property_id == null ? null : String(row.a_property_id),
            createdAt: new Date(String(row.a_created_at)).toISOString(),
          },
          {
            id: String(row.b_id),
            name: String(row.b_name ?? ""),
            phone: String(row.b_phone ?? ""),
            status: String(row.b_status ?? ""),
            consultant: String(row.b_consultant ?? ""),
            propertyId: row.b_property_id == null ? null : String(row.b_property_id),
            createdAt: new Date(String(row.b_created_at)).toISOString(),
          },
        ],
      })),
    };
  }

  const canonicalId = typeof body.canonicalId === "string" ? body.canonicalId.trim() : "";
  const duplicateId = typeof body.duplicateId === "string" ? body.duplicateId.trim() : "";
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) {
    throw createError({ statusCode: 400, statusMessage: "شناسه‌های ادغام معتبر نیستند." });
  }

  if (action === "preview") {
    const rows = await sql.query<Record<string, unknown>>(
      "select id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,status,source,acquisition_source,acquisition_medium,acquisition_campaign,follow_up_at,last_contacted_at,property_id,visit_preferred_at,visit_requested_at,visit_status,lease_deadline,budget_deposit,budget_rent,budget_purchase,budget_sale,budget_deposit_min,budget_deposit_max,budget_rent_min,budget_rent_max,budget_purchase_min,budget_purchase_max,budget_sale_min,budget_sale_max,budget_equivalent,budget_bedrooms,budget_rate,requested_bedrooms,requested_amenities,matched_properties,match_count from leads where id = any($1::text[]) order by case when id=$2 then 0 else 1 end",
      [[canonicalId, duplicateId], canonicalId],
    );
    if (rows.length !== 2) throw createError({ statusCode: 404, statusMessage: "یکی از لیدهای انتخاب‌شده پیدا نشد." });
    return {
      canonical: rows[0],
      duplicate: rows[1],
      rule: "اطلاعات غیرخالی رکورد اصلی حفظ می‌شود؛ فیلدهای خالی آن از رکورد دوم پر می‌شوند. فعالیت‌های CRM به رکورد اصلی منتقل و رکورد دوم بسته می‌شود.",
    };
  }

  if (action !== "merge") {
    throw createError({ statusCode: 400, statusMessage: "عملیات تکراری‌های CRM نامعتبر است." });
  }

  const rows = await sql.query<Record<string, unknown>>(
    `with duplicate as (
      select * from leads where id = $2
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
        updated_at = current_timestamp
      from duplicate d
      where l.id = $1
      returning l.id
    ),
    moved_activities as (
      update lead_activities
      set lead_id = $1
      where lead_id = $2
      returning id
    ),
    closed_duplicate as (
      update leads
      set
        status = 'closed',
        note = concat_ws(E'\\n', nullif(trim(note),''), 'این لید در ' || to_char(current_timestamp,'YYYY-MM-DD HH24:MI') || ' با لید ' || $1 || ' ادغام شد.'),
        updated_at = current_timestamp
      where id = $2
      returning id
    )
    select (select id from merged) as canonical_id,
           (select count(*) from moved_activities)::int as moved_activities,
           (select id from closed_duplicate) as duplicate_id`,
    [canonicalId, duplicateId],
  );

  if (!rows[0]?.canonical_id) {
    throw createError({ statusCode: 500, statusMessage: "ادغام لید انجام نشد." });
  }

  await sql.query(
    "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'status',$2,$3,$4::jsonb)",
    [
      canonicalId,
      "ادغام لید تکراری",
      "رکورد " + duplicateId + " در این لید ادغام شد.",
      "رکورد دوم بسته شد و فعالیت‌های آن منتقل شدند.",
      JSON.stringify({ mergedLeadId: duplicateId }),
    ],
  ).catch(() => {});

  return {
    success: true,
    canonicalId,
    duplicateId,
    movedActivities: Number(rows[0].moved_activities) || 0,
  };
});
