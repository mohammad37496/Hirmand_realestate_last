import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { loadAdminCampaignPerformanceQueries } from "@/lib/admin-campaign-performance";

const ALLOWED_DAYS = new Set([7, 30, 90]);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش کمپین‌ها برای این حساب فعال نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as { days?: unknown };
  const candidate = Number(body?.days);
  const days = (ALLOWED_DAYS.has(candidate) ? candidate : 30) as 7 | 30 | 90;

  if (dbSource === "unconfigured") {
    return { days, rows: [], daily: [], quality: { leads: 0, source: 0, medium: 0, campaign: 0 }, totals: { campaigns: 0, leads: 0, contacted: 0, visits: 0, contracts: 0 } };
  }

  const sql = await getSql();
  const { rows, daily, quality } = await loadAdminCampaignPerformanceQueries(sql, days);

  const mapped = rows.map((row) => {
    const leads = Number(row.leads) || 0;
    const contacted = Number(row.contacted) || 0;
    const visits = Number(row.visits) || 0;
    const contracts = Number(row.contracts) || 0;
    return {
      source: String(row.source ?? "direct"),
      medium: String(row.medium ?? "—"),
      campaign: String(row.campaign ?? "بدون کمپین"),
      leads, contacted, visits, contracts,
      contactRate: leads ? Number(((contacted / leads) * 100).toFixed(1)) : 0,
      contractRate: leads ? Number(((contracts / leads) * 100).toFixed(1)) : 0,
    };
  });

  const dailyMapped = daily.map((row) => ({ day: String(row.day ?? ""), leads: Number(row.leads) || 0, contracts: Number(row.contracts) || 0 }));
  const qualityBase = quality[0] ?? {};
  const qualityLeads = Number(qualityBase.leads) || 0;
  const qualityMapped = {
    leads: qualityLeads,
    source: qualityLeads ? Number(((Number(qualityBase.source) || 0) / qualityLeads * 100).toFixed(1)) : 0,
    medium: qualityLeads ? Number(((Number(qualityBase.medium) || 0) / qualityLeads * 100).toFixed(1)) : 0,
    campaign: qualityLeads ? Number(((Number(qualityBase.campaign) || 0) / qualityLeads * 100).toFixed(1)) : 0,
  };

  const totals = mapped.reduce(
    (acc, row) => ({ campaigns: acc.campaigns + 1, leads: acc.leads + row.leads, contacted: acc.contacted + row.contacted, visits: acc.visits + row.visits, contracts: acc.contracts + row.contracts }),
    { campaigns: 0, leads: 0, contacted: 0, visits: 0, contracts: 0 },
  );

  return { days, rows: mapped, daily: dailyMapped, quality: qualityMapped, totals };
});
