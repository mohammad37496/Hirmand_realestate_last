import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

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
  if (dbSource === "unconfigured") return { consultants: [], recommendations: [] };

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "recommend";
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
  ).catch((error) => {
    console.error("[admin-lead-assignment] consultant query unavailable", error);
    return [];
  });

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
      "update leads set consultant=$2, updated_at=current_timestamp where id=$1 returning id",
      [leadId, consultant],
    );
    if (!rows[0]) throw createError({ statusCode: 404, statusMessage: "لید پیدا نشد." });

    await sql.query(
      "insert into lead_activities (lead_id, activity_type, title, note, metadata) values ($1,'status',$2,$3,$4::jsonb)",
      [
        leadId,
        "تخصیص مشاور",
        "مشاور «" + consultant + "» برای این لید ثبت شد.",
        "تخصیص از مرکز تعادل بار CRM.",
        JSON.stringify({ consultant }),
      ],
    ).catch(() => {});

    return { success: true, consultant };
  }

  const unassigned = await sql.query<Record<string, unknown>>(
    "select id,name,phone,deal,property_type,neighborhood,created_at from leads where trim(coalesce(consultant,''))='' and status not in ('closed','spam') order by created_at desc limit 24",
  ).catch(() => []);

  const sorted = [...loads].sort((a, b) => a.score - b.score || a.activeLeads - b.activeLeads || a.name.localeCompare(b.name, "fa"));
  return {
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
