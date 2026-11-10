import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { loadAdminSalesControlCenterQueries } from "@/lib/admin-sales-control-center";

const ALLOWED_DAYS = new Set([7, 30, 90]);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({
      statusCode: 401,
      statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.",
    });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "deal.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مرکز کنترل فروش برای این حساب فعال نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as { days?: unknown };
  const requestedDays = Number(body?.days);
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 30;

  if (dbSource === "unconfigured") {
    return {
      days,
      pipeline: { new: 0, contacted: 0, follow_up: 0, visited: 0, contract: 0 },
      summary: {
        consultants: 0,
        activeConsultants: 0,
        activeLeads: 0,
        overdueLeads: 0,
        visitRequests: 0,
        contracts: 0,
        totalViews: 0,
      },
      consultants: [],
    };
  }

  const sql = await getSql();

  const [consultantRows, pipelineRows] = await loadAdminSalesControlCenterQueries(sql, days as 7 | 30 | 90);

  const consultants = consultantRows.map((row) => {
    const leads = Number(row.leads) || 0;
    const periodContracts = Number(row.period_contracts) || 0;
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      phone: String(row.phone ?? ""),
      active: row.is_active === true || row.is_active === "t" || row.is_active === 1,
      files: Number(row.files) || 0,
      leads,
      activeLeads: Number(row.active_leads) || 0,
      new7d: Number(row.new_7d) || 0,
      overdueLeads: Number(row.overdue_leads) || 0,
      nextFollowUps: Number(row.next_follow_ups) || 0,
      visitRequests: Number(row.visit_requests) || 0,
      contracts: Number(row.contracts) || 0,
      periodContracts,
      views: Number(row.views) || 0,
      conversionRate: leads > 0 ? Number(((periodContracts / leads) * 100).toFixed(1)) : 0,
    };
  });

  const pipelineRow = (pipelineRows[0] ?? {}) as Record<string, unknown>;
  const summary = consultants.reduce(
    (acc, item) => {
      acc.consultants += 1;
      if (item.active) acc.activeConsultants += 1;
      acc.activeLeads += item.activeLeads;
      acc.overdueLeads += item.overdueLeads;
      acc.visitRequests += item.visitRequests;
      acc.contracts += item.periodContracts;
      acc.totalViews += item.views;
      return acc;
    },
    {
      consultants: 0,
      activeConsultants: 0,
      activeLeads: 0,
      overdueLeads: 0,
      visitRequests: 0,
      contracts: 0,
      totalViews: 0,
    },
  );

  return {
    days,
    pipeline: {
      new: Number(pipelineRow.new) || 0,
      contacted: Number(pipelineRow.contacted) || 0,
      follow_up: Number(pipelineRow.follow_up) || 0,
      visited: Number(pipelineRow.visited) || 0,
      contract: Number(pipelineRow.contract) || 0,
    },
    summary,
    consultants,
  };
});
