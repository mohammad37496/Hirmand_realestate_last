import { defineEventHandler, createError, getCookie, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { compareDecimalStrings } from "@/lib/decimal-money";

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
  const role = normalizeAdminRole(claims?.role);
  if (!hasAdminPermission(role, "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش مشاوران برای این حساب فعال نیست." });
  }
  const canViewDeals = hasAdminPermission(role, "deal.manage");
  const canViewCommissions = hasAdminPermission(role, "commission.manage");
  if (dbSource === "unconfigured") return { days: 90, access: { deals: canViewDeals, commissions: canViewCommissions }, consultants: [] };

  const query = getQuery(event);
  const rawDays = Number(query.days);
  const days = [30, 90, 365].includes(rawDays) ? rawDays : 90;
  const sql = await getSql();

  const [leads, deals, settlements] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select c.id as consultant_id,c.name as consultant,count(*)::int as lead_count,count(*) filter(where l.status='contract')::int as contracted_leads,count(*) filter(where l.status not in ('closed','spam'))::int as open_leads from leads l join consultants c on c.id=l.consultant_id where l.created_at >= current_timestamp - ($1::int * interval '1 day') group by c.id,c.name",
      [days],
    ),
    canViewDeals
      ? canViewCommissions
        ? sql.query<Record<string, unknown>>(
            "select consultant,count(*)::int as deal_count,count(*) filter(where status='completed')::int as completed_deals,coalesce(sum(amount),0)::numeric as volume,coalesce(sum(commission),0)::numeric as commissions from admin_deals where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
            [days],
          )
        : sql.query<Record<string, unknown>>(
            "select consultant,count(*)::int as deal_count,count(*) filter(where status='completed')::int as completed_deals,coalesce(sum(amount),0)::numeric as volume from admin_deals where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
            [days],
          )
      : sql.query<Record<string, unknown>>(
          "select consultant,count(*)::int as deal_count,count(*) filter(where status='completed')::int as completed_deals from admin_deals where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
          [days],
        ),
    canViewCommissions
      ? sql.query<Record<string, unknown>>(
          "select consultant,coalesce(sum(consultant_share) filter(where status='paid'),0)::numeric as paid,coalesce(sum(consultant_share) filter(where status in ('pending','approved')),0)::numeric as due from admin_commission_settlements where created_at >= current_timestamp - ($1::int * interval '1 day') group by consultant",
          [days],
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  type Row = { id: string; name: string; leads: number; contractedLeads: number; openLeads: number; deals: number; completedDeals: number; volume: string | null; commissions: string | null; paid: string | null; due: string | null };
  const map = new Map<string, Row>();
  const ensure = (key: string, value: unknown, historical = false) => {
    const rawName = String(value ?? "").trim() || "بدون مشاور";
    const name = historical ? `${rawName} · سوابق نام‌محور` : rawName;
    if (!map.has(key)) map.set(key, { id: key, name, leads: 0, contractedLeads: 0, openLeads: 0, deals: 0, completedDeals: 0, volume: canViewDeals ? "0" : null, commissions: canViewCommissions ? "0" : null, paid: canViewCommissions ? "0" : null, due: canViewCommissions ? "0" : null });
    return map.get(key)!;
  };
  for (const row of leads) {
    const item = ensure(String(row.consultant_id), row.consultant);
    item.leads = number(row.lead_count);
    item.contractedLeads = number(row.contracted_leads);
    item.openLeads = number(row.open_leads);
  }
  for (const row of deals) {
    const name = String(row.consultant ?? "").trim();
    const item = ensure(`historical-deal:${name}`, name, true);
    item.deals = number(row.deal_count);
    item.completedDeals = number(row.completed_deals);
    item.volume = canViewDeals ? String(row.volume ?? "0") : null;
    item.commissions = canViewCommissions ? String(row.commissions ?? "0") : null;
  }
  for (const row of settlements) {
    const name = String(row.consultant ?? "").trim();
    const item = ensure(`historical-deal:${name}`, name, true);
    item.paid = canViewCommissions ? String(row.paid ?? "0") : null;
    item.due = canViewCommissions ? String(row.due ?? "0") : null;
  }

  const rows = [...map.values()].map((item) => ({
    ...item,
    conversionRate: item.id.startsWith("historical-deal:") ? null : item.leads > 0 ? Math.round((item.deals / item.leads) * 1000) / 10 : 0,
  })).sort((a, b) => b.deals - a.deals || compareDecimalStrings(b.volume ?? "0", a.volume ?? "0") || a.name.localeCompare(b.name, "fa"));

  return { days, access: { deals: canViewDeals, commissions: canViewCommissions }, consultants: rows };
});
