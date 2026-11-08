import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { loadAdminLeadAssignmentRows } from "@/lib/admin-lead-assignment";
import { assignAdminLeadToConsultant } from "@/lib/admin-lead-assignment-action";

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
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای مدیریت تخصیص مشاوران در دسترس نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "recommend";
  const sql = await getSql();
  let rows: Awaited<ReturnType<typeof loadAdminLeadAssignmentRows>>;
  try {
    rows = await loadAdminLeadAssignmentRows(sql, action);
  } catch (error) {
    console.error("[admin-lead-assignment] assignment data query unavailable", error);
    throw createError({ statusCode: 503, statusMessage: "بارگذاری اطلاعات تعادل بار مشاوران ناموفق بود. دوباره تلاش کنید." });
  }

  const loads: ConsultantLoad[] = rows.consultants.map((row) => {
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

    const assignment = await assignAdminLeadToConsultant(sql, leadId, consultant);
    if (assignment.kind === "not_found") throw createError({ statusCode: 404, statusMessage: "لید پیدا نشد." });

    return { success: true, consultant };
  }

  const sorted = [...loads].sort((a, b) => a.score - b.score || a.activeLeads - b.activeLeads || a.name.localeCompare(b.name, "fa"));
  return {
    consultants: loads,
    recommendations: rows.unassigned.map((lead) => ({
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
