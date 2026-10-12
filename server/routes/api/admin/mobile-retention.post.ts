import { createError, defineEventHandler, getCookie, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { writeAdminAuditLog } from "@/lib/admin-audit-log.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی پاک‌سازی داده‌های دستگاه برای این حساب فعال نیست." });
  }

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const sql = await getSql();
  const usage = await sql.query<{ count: number }>(
    "delete from staff_mobile_telemetry where event_type='usage_snapshot' and observed_at < current_timestamp - interval '14 days' returning 1",
  );
  const telemetry = await sql.query<{ count: number }>(
    "delete from staff_mobile_telemetry where event_type<>'usage_snapshot' and observed_at < current_timestamp - interval '30 days' returning 1",
  );
  const locations = await sql.query<{ count: number }>(
    "delete from staff_mobile_locations where observed_at < current_timestamp - interval '30 days' returning 1",
  );
  const ingest = await sql.query<{ count: number }>(
    "delete from staff_mobile_ingest_log where received_at < current_timestamp - interval '30 days' returning 1",
  );

  const actor = claims?.accountId ? String(claims.accountId) : normalizeAdminRole(claims?.role);
  await writeAdminAuditLog({
    action: "staff_mobile_data.retention_prune",
    entityType: "staff_mobile_data",
    entityTitle: "Staff mobile telemetry retention",
    actor,
    metadata: {
      usageDeleted: usage.length,
      telemetryDeleted: telemetry.length,
      locationsDeleted: locations.length,
      ingestDeleted: ingest.length,
    },
  });

  return {
    success: true,
    deleted: {
      usageSnapshots: usage.length,
      telemetry: telemetry.length,
      locations: locations.length,
      ingestLogs: ingest.length,
    },
    policy: {
      usageSnapshotsDays: 14,
      telemetryDays: 30,
      locationDays: 30,
      ingestLogDays: 30,
    },
  };
});
