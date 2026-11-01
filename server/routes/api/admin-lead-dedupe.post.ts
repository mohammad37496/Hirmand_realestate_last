import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import {
  checkPropertyVisitSlot,
  lockPropertyVisitSchedule,
  planLeadVisitMerge,
} from "@/lib/property-visit-scheduling.server";
import { lockLeadDedupeSnapshot, mergeLeadDedupeRelations, type LeadDedupeSnapshotRow } from "@/lib/admin-lead-dedupe.server";

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
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "list";
  if (!["list", "preview", "merge"].includes(action)) {
    throw createError({ statusCode: 400, statusMessage: "عملیات تکراری‌های CRM نامعتبر است." });
  }
  if (dbSource === "unconfigured") {
    if (action === "list") return { available: false, groups: [], total: 0 };
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده تنظیم نشده است؛ پیش‌نمایش و ادغام لیدها در دسترس نیست." });
  }

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
        where merged_into_lead_id is null
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

    return {
      available: true,
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
      "select id,name,phone,people_count,job,deal,property_type,neighborhood,consultant,note,status,source,acquisition_source,acquisition_medium,acquisition_campaign,acquisition_referrer,acquisition_landing_path,callback_preferred_at,offer_amount,offer_conditions,follow_up_at,last_contacted_at,property_id,visit_preferred_at,visit_requested_at,visit_status,lease_deadline,budget_deposit,budget_rent,budget_purchase,budget_sale,budget_deposit_min,budget_deposit_max,budget_rent_min,budget_rent_max,budget_purchase_min,budget_purchase_max,budget_sale_min,budget_sale_max,budget_equivalent,budget_bedrooms,budget_rate,floor_preference,requested_bedrooms,requested_area_min,requested_area_max,requested_amenities,matched_properties,match_count from leads where id = any($1::text[]) order by case when id=$2 then 0 else 1 end",
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

  const mergeResult = await withSqlTransaction(async (tx) => {
    const initialRows = await tx.query<LeadDedupeSnapshotRow>(
      "select id,status,merged_into_lead_id,property_id,visit_preferred_at,visit_status from leads where id=any($1::text[]) order by id",
      [[canonicalId, duplicateId]],
    );
    if (initialRows.length !== 2) return { kind: "missing" as const };
    const initialById = new Map(initialRows.map((row) => [row.id, row]));
    const initialCanonical = initialById.get(canonicalId);
    const initialDuplicate = initialById.get(duplicateId);
    if (!initialCanonical || !initialDuplicate) return { kind: "missing" as const };

    const activeProperties = [initialCanonical, initialDuplicate]
      .filter((lead) => lead.visit_status === "requested" || lead.visit_status === "confirmed")
      .map((lead) => lead.property_id == null ? "" : String(lead.property_id).trim())
      .filter(Boolean);
    for (const propertyId of [...new Set(activeProperties)].sort()) {
      const property = await lockPropertyVisitSchedule(tx, propertyId);
      if (!property) return { kind: "property_missing" as const };
    }

    const locked = await lockLeadDedupeSnapshot(tx, canonicalId, duplicateId, initialRows);
    if (locked.kind !== "locked") return { kind: locked.kind };
    const { canonical, duplicate } = locked;

    const visitPlan = planLeadVisitMerge(canonical, duplicate);
    if (visitPlan.kind === "conflicting_visits") return { kind: "conflicting_visits" as const };
    if (visitPlan.kind === "keep_canonical" || visitPlan.kind === "move_duplicate") {
      const slot = await checkPropertyVisitSlot(tx, {
        propertyId: visitPlan.propertyId,
        visitAt: new Date(Date.parse(visitPlan.visitAt)).toISOString(),
        excludeLeadIds: [canonicalId, duplicateId],
      });
      if (slot.kind === "property_missing") return { kind: "property_missing" as const };
      if (slot.kind === "conflict") return { kind: "visit_conflict" as const };
    }

    if (duplicate.merged_into_lead_id || canonical.merged_into_lead_id) return { kind: "stale" as const };
    const mutation = await mergeLeadDedupeRelations(tx, canonicalId, duplicateId);
    if (!mutation) return { kind: "stale" as const };
    return { kind: "merged" as const, mutation };
  });

  if (mergeResult.kind === "missing" || mergeResult.kind === "stale") {
    throw createError({ statusCode: 409, statusMessage: "یکی از لیدها حذف یا هم‌زمان تغییر کرده است. فهرست را تازه‌سازی کنید." });
  }
  if (mergeResult.kind === "property_missing") throw createError({ statusCode: 404, statusMessage: "فایل مرتبط با بازدید پیدا نشد؛ ادغام انجام نشد." });
  if (mergeResult.kind === "conflicting_visits") throw createError({ statusCode: 409, statusMessage: "این دو لید بازدیدهای فعال متفاوتی دارند؛ ابتدا زمان‌های بازدید را تعیین تکلیف کنید." });
  if (mergeResult.kind === "visit_conflict") throw createError({ statusCode: 409, statusMessage: "زمان بازدید ادغام‌شده با بازدید فعال دیگری تداخل دارد." });
  return {
    success: true,
    canonicalId,
    duplicateId,
    ...mergeResult.mutation,
  };
});
