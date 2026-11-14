import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { assertAdminDatabaseConfigured } from "@/lib/admin-database-availability.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { listAdminLeadDuplicateCandidates, mergeAdminLeadDuplicate } from "@/lib/admin-lead-dedupe";

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
  assertAdminDatabaseConfigured(dbSource, "پایگاه داده مدیریت تنظیم نشده است؛ بررسی تکراری‌های CRM در دسترس نیست.");

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "list";
  const sql = await getSql();

  if (action === "list") {
    const rows = await listAdminLeadDuplicateCandidates(sql);

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
      "select id,name,phone,people_count,job,deal,property_type,neighborhood,coalesce((select c.name from consultants c where c.id=leads.consultant_id),consultant) as consultant,consultant as consultant_snapshot,consultant_id,consultant_link_state,note,status,source,acquisition_source,acquisition_medium,acquisition_campaign,follow_up_at,last_contacted_at,property_id,visit_preferred_at,visit_requested_at,visit_status,lease_deadline,budget_deposit,budget_rent,budget_purchase,budget_sale,budget_deposit_min,budget_deposit_max,budget_rent_min,budget_rent_max,budget_purchase_min,budget_purchase_max,budget_sale_min,budget_sale_max,budget_equivalent,budget_bedrooms,budget_rate,requested_bedrooms,requested_amenities,matched_properties,match_count from leads where id = any($1::text[]) and status not in ('closed','spam') order by case when id=$2 then 0 else 1 end",
      [[canonicalId, duplicateId], canonicalId],
    );
    if (rows.length !== 2) throw createError({ statusCode: 404, statusMessage: "یکی از لیدهای انتخاب‌شده پیدا نشد." });
    return {
      canonical: rows[0],
      duplicate: rows[1],
      rule: "اطلاعات غیرخالی رکورد اصلی حفظ می‌شود؛ فیلدهای خالی آن از رکورد دوم پر می‌شوند. فعالیت‌ها، وظایف، پیام‌ها، پرونده‌های ثبت ملک، سوابق بازدید، تراکنش‌های مالی و معاملات منتقل می‌شوند؛ کد رهگیری قدیمی نیز به پرونده اصلی می‌رسد. رکورد دوم حذف فیزیکی نمی‌شود.",
    };
  }

  if (action !== "merge") {
    throw createError({ statusCode: 400, statusMessage: "عملیات تکراری‌های CRM نامعتبر است." });
  }

  const result = await mergeAdminLeadDuplicate(sql, canonicalId, duplicateId);
  if (result.kind === "not_found") {
    throw createError({ statusCode: 404, statusMessage: "یکی از لیدهای انتخاب‌شده پیدا نشد." });
  }
  if (result.kind === "duplicate_inactive") {
    throw createError({ statusCode: 409, statusMessage: "این لید قبلاً بسته یا ادغام شده است؛ فهرست را تازه‌سازی کنید." });
  }
  if (result.kind === "canonical_inactive") {
    throw createError({ statusCode: 409, statusMessage: "لید اصلی بسته یا غیرفعال است؛ یک لید فعال انتخاب کنید." });
  }
  if (result.kind === "consultant_changed") {
    throw createError({ statusCode: 409, statusMessage: "تخصیص مشاور یکی از لیدها هم‌زمان تغییر کرده است؛ فهرست را تازه‌سازی کنید." });
  }

  return {
    success: true,
    canonicalId,
    duplicateId,
    movedActivities: result.movedActivities,
    movedTasks: result.movedTasks,
    movedSubmissions: result.movedSubmissions,
    movedFeedback: result.movedFeedback,
    movedMessages: result.movedMessages,
    movedFinanceTransactions: result.movedFinanceTransactions,
    movedDeals: result.movedDeals,
    repointedAliases: result.repointedAliases,
  };
});
