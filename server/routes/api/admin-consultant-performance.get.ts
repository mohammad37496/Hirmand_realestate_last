import { defineEventHandler, createError, getCookie, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش مشاوران برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { days: 90, consultants: [] };

  const query = getQuery(event);
  const rawDays = Number(query.days);
  const days = [30, 90, 365].includes(rawDays) ? rawDays : 90;
  const sql = await getSql();

  const [leads, deals, settlements] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select consultant,count(*)::int as lead_count,count(*) filter(where status='contract')::int as contracted_leads,count(*) filter(where status not in ('closed','spam'))::int as open_leads from leads where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
      [days],
    ),
    sql.query<Record<string, unknown>>(
      "select consultant,count(*)::int as deal_count,count(*) filter(where status='completed')::int as completed_deals,coalesce(sum(amount),0)::numeric as volume,coalesce(sum(commission),0)::numeric as commissions from admin_deals where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
      [days],
    ),
    sql.query<Record<string, unknown>>(
      "select consultant,coalesce(sum(consultant_share) filter(where status='paid'),0)::numeric as paid,coalesce(sum(consultant_share) filter(where status in ('pending','approved')),0)::numeric as due from admin_commission_settlements where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
      [days],
    ),
  ]);

  type Row = { name: string; leads: number; contractedLeads: number; openLeads: number; deals: number; completedDeals: number; volume: number; commissions: number; paid: number; due: number };
  const map = new Map<string, Row>();
  const ensure = (value: unknown) => {
    const name = String(value ?? "").trim() || "بدون مشاور";
    if (!map.has(name)) map.set(name, { name, leads: 0, contractedLeads: 0, openLeads: 0, deals: 0, completedDeals: 0, volume: 0, commissions: 0, paid: 0, due: 0 });
    return map.get(name)!;
  };
  for (const row of leads) {
    const item = ensure(row.consultant);
    item.leads = number(row.lead_count);
    item.contractedLeads = number(row.contracted_leads);
    item.openLeads = number(row.open_leads);
  }
  for (const row of deals) {
    const item = ensure(row.consultant);
    item.deals = number(row.deal_count);
    item.completedDeals = number(row.completed_deals);
    item.volume = number(row.volume);
    item.commissions = number(row.commissions);
  }
  for (const row of settlements) {
    const item = ensure(row.consultant);
    item.paid = number(row.paid);
    item.due = number(row.due);
  }

  const rows = [...map.values()].map((item) => ({
    ...item,
    conversionRate: item.leads > 0 ? Math.round((item.deals / item.leads) * 1000) / 10 : 0,
  })).sort((a, b) => b.deals - a.deals || b.volume - a.volume || a.name.localeCompare(b.name, "fa"));

  return { days, consultants: rows };
});
