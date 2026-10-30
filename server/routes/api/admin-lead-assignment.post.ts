import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { ASSIGN_LEAD_WITH_ACTIVITY_SQL } from "@/lib/admin-lead-mutation-sql";

type ConsultantLoad = {
  name: string;
  phone: string;
  activeLeads: number;
  overdue: number;
  viewingRequests: number;
  score: number;
};

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی تخصیص مشتری به مشاوران برای این حساب فعال نیست." });
  }
}

function workScore(load: Pick<ConsultantLoad, "activeLeads" | "overdue" | "viewingRequests">) {
  return load.activeLeads + load.overdue * 2 + load.viewingRequests;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);
  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "recommend";
  if (action !== "assign" && action !== "recommend") {
    throw createError({ statusCode: 400, statusMessage: "Unsupported lead assignment action." });
  }
  if (dbSource === "unconfigured") {
    if (action === "assign") throw createError({ statusCode: 503, statusMessage: "\u067e\u0627\u06cc\u06af\u0627\u0647\u0020\u062f\u0627\u062f\u0647\u0020\u062f\u0631\u0020\u062f\u0633\u062a\u0631\u0633\u0020\u0646\u06cc\u0633\u062a\u061b\u0020\u062a\u062e\u0635\u06cc\u0635\u0020\u0633\u0631\u0646\u062e\u0020\u0630\u062e\u06cc\u0631\u0647\u0020\u0646\u0634\u062f\u002e" });
    return { available: false, consultants: [], recommendations: [] };
  }
  const sql = await getSql();

  const consultants = await sql.query<Record<string, unknown>>(
    `select
       c.name,
       c.phone,
       count(l.id) filter (where l.status not in ('closed','spam'))::int as active_leads,
       count(l.id) filter (
         where l.status in ('new','contacted','follow_up','visited')
           and l.follow_up_at is not null
           and l.follow_up_at < current_timestamp
       )::int as overdue,
       count(l.id) filter (
         where l.status not in ('closed','spam')
           and (l.visit_requested_at is not null or l.visit_status = 'requested')
       )::int as viewing_requests
     from consultants c
     left join leads l on trim(coalesce(l.consultant,'')) = trim(c.name)
     where c.is_active = true
     group by c.name, c.phone, c.sort_order
     order by c.sort_order asc, c.name asc`,
  );

  const loads: ConsultantLoad[] = consultants.map((row) => {
    const base = {
      name: String(row.name ?? ""),
      phone: String(row.phone ?? ""),
      activeLeads: Number(row.active_leads) || 0,
      overdue: Number(row.overdue) || 0,
      viewingRequests: Number(row.viewing_requests) || 0,
    };
    return { ...base, score: workScore(base) };
  });

  if (action === "assign") {
    const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
    const consultant = typeof body.consultant === "string" ? body.consultant.trim() : "";
    if (!leadId || !consultant) throw createError({ statusCode: 400, statusMessage: "لید و مشاور مشخص نیستند." });
    const allowed = loads.find((item) => item.name === consultant);
    if (!allowed) throw createError({ statusCode: 400, statusMessage: "مشاور فعال موردنظر پیدا نشد." });

    const rows = await sql.query<{ id: string }>(
      ASSIGN_LEAD_WITH_ACTIVITY_SQL,
      [
        leadId,
        consultant,
        "تخصیص مشاور",
        "تخصیص از مرکز تعادل بار CRM.",
        JSON.stringify({ consultant }),
      ],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "لید پیدا نشد." });

    return { success: true, consultant };
  }

  const unassigned = await sql.query<Record<string, unknown>>(
    "select id,name,phone,deal,property_type,neighborhood,created_at from leads where trim(coalesce(consultant,''))='' and status not in ('closed','spam') order by created_at desc limit 24",
  );

  const sorted = [...loads].sort((a, b) => a.score - b.score || a.activeLeads - b.activeLeads || a.name.localeCompare(b.name, "fa"));
  return {
    available: true,
    consultants: loads,
    recommendations: unassigned.map((lead) => ({
      lead: {
        id: String(lead.id),
        name: String(lead.name ?? ""),
        phone: String(lead.phone ?? ""),
        deal: String(lead.deal ?? ""),
        propertyType: String(lead.property_type ?? ""),
        neighborhood: String(lead.neighborhood ?? ""),
        createdAt: new Date(String(lead.created_at)).toISOString(),
      },
      suggested: sorted[0] ? {
        name: sorted[0].name,
        phone: sorted[0].phone,
        score: sorted[0].score,
      } : null,
      alternatives: sorted.slice(1, 3).map((item) => ({
        name: item.name,
        phone: item.phone,
        score: item.score,
      })),
    })),
  };
});
