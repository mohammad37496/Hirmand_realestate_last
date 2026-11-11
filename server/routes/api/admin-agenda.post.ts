import { createError, defineEventHandler, getCookie, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertAdminDatabaseConfigured } from "@/lib/admin-database-availability.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت پیگیری مشتریان برای این حساب فعال نیست." });
  }
  assertAdminDatabaseConfigured(dbSource, "پایگاه داده برای دریافت دستورکار مدیریت آماده نیست.");
  const sql = await getSql();
  const [followUps, visits, callbacks] = await Promise.all([
    sql.query<Record<string, unknown>>("select l.id,l.name,l.phone,l.deal,l.neighborhood,coalesce(c.name,l.consultant) as consultant,l.status,l.follow_up_at from leads l left join consultants c on c.id=l.consultant_id where l.status in ('new','contacted','follow_up','visited','contract') and l.follow_up_at is not null order by case when l.follow_up_at < current_timestamp then 0 else 1 end, l.follow_up_at asc limit 8"),
    sql.query<Record<string, unknown>>("select l.id,l.name,l.phone,l.deal,l.neighborhood,coalesce(c.name,l.consultant) as consultant,l.visit_status,l.visit_preferred_at from leads l left join consultants c on c.id=l.consultant_id where l.visit_status in ('requested','confirmed') and l.visit_preferred_at is not null and l.visit_preferred_at <= current_timestamp + interval '7 days' order by l.visit_preferred_at asc limit 8"),
    sql.query<Record<string, unknown>>("select l.id,l.name,l.phone,l.deal,l.neighborhood,coalesce(c.name,l.consultant) as consultant,l.callback_preferred_at from leads l left join consultants c on c.id=l.consultant_id where l.callback_preferred_at is not null and l.status in ('new','contacted','follow_up') and l.callback_preferred_at <= current_timestamp + interval '7 days' order by l.callback_preferred_at asc limit 8"),
  ]);
  return {
    overdueFollowUps: followUps.map((row) => ({ id:String(row.id), name:String(row.name ?? ""), phone:String(row.phone ?? ""), deal:String(row.deal ?? ""), neighborhood:String(row.neighborhood ?? ""), consultant:String(row.consultant ?? ""), status:String(row.status ?? "new"), followUpAt:new Date(String(row.follow_up_at)).toISOString(), overdue:new Date(String(row.follow_up_at)).getTime() < Date.now() })),
    upcomingVisits: visits.map((row) => ({ id:String(row.id), name:String(row.name ?? ""), phone:String(row.phone ?? ""), deal:String(row.deal ?? ""), neighborhood:String(row.neighborhood ?? ""), consultant:String(row.consultant ?? ""), visitStatus:String(row.visit_status ?? "requested"), visitPreferredAt:new Date(String(row.visit_preferred_at)).toISOString() })),
    upcomingCallbacks: callbacks.map((row) => ({ id:String(row.id), name:String(row.name ?? ""), phone:String(row.phone ?? ""), deal:String(row.deal ?? ""), neighborhood:String(row.neighborhood ?? ""), consultant:String(row.consultant ?? ""), callbackPreferredAt:new Date(String(row.callback_preferred_at)).toISOString() })),
  };
});
