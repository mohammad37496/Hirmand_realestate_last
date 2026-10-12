import { defineEventHandler, getCookie, readBody, setResponseHeader, createError } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مشاهده بازخورد مشتریان برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { total: 0, average: 0, interested: 0, recent: [] };

  await readBody(event).catch(() => ({}));
  const sql = await getSql();
  const summaryRows = await sql.query<{ total: number; average: number; interested: number }>(
    "select count(*)::int as total, coalesce(round(avg(rating)::numeric,1),0)::float as average, count(*) filter (where interest='interested')::int as interested from lead_visit_feedback",
  );
  const rows = await sql.query<Record<string, unknown>>(
    "select f.id::text as id, f.rating, f.interest, f.note, f.created_at, f.tracking_token, l.name, l.consultant, l.deal, p.title as property_title, p.slug as property_slug " +
      "from lead_visit_feedback f left join leads l on l.id=f.lead_id left join properties p on p.id::text=l.property_id::text " +
      "order by f.created_at desc limit 30",
  );
  const summary = summaryRows[0] ?? { total: 0, average: 0, interested: 0 };

  return {
    total: Number(summary.total) || 0,
    average: Number(summary.average) || 0,
    interested: Number(summary.interested) || 0,
    recent: rows.map((row) => ({
      id: String(row.id),
      rating: Number(row.rating) || 0,
      interest: String(row.interest),
      note: String(row.note ?? ""),
      createdAt: new Date(String(row.created_at)).toISOString(),
      trackingToken: String(row.tracking_token),
      name: String(row.name ?? ""),
      consultant: String(row.consultant ?? ""),
      deal: String(row.deal ?? ""),
      propertyTitle: row.property_title ? String(row.property_title) : "",
      propertySlug: row.property_slug ? String(row.property_slug) : "",
    })),
  };
});
