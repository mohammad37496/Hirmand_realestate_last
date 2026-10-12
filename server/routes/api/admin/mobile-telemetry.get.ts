import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function requireSecurityAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "security.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مشاهده داده‌های دستگاه برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "private, no-store");
  await requireSecurityAdmin(event);

  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });
  }

  const query = getQuery(event);
  const deviceId = typeof query.deviceId === "string" ? query.deviceId.trim() : "";
  const eventType = typeof query.eventType === "string" ? query.eventType.trim() : "";
  const limitRaw = Number(query.limit);
  const limit = Number.isInteger(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;

  if (!deviceId) {
    throw createError({ statusCode: 400, statusMessage: "deviceId الزامی است." });
  }

  const sql = await getSql();
  const telemetryRows = await sql.query<Record<string, unknown>>(
    "select id,device_id,staff_id,client_event_id,event_type,payload,observed_at,received_at " +
      "from staff_mobile_telemetry where device_id=$1 " +
      (eventType ? "and event_type=$2 " : "") +
      "order by observed_at desc limit " + String(limit),
    eventType ? [deviceId, eventType] : [deviceId],
  );

  const locationRows = await sql.query<Record<string, unknown>>(
    "select id,device_id,staff_id,client_event_id,latitude,longitude,accuracy_m,altitude_m,speed_mps,provider,observed_at,received_at " +
      "from staff_mobile_locations where device_id=$1 order by observed_at desc limit " + String(limit),
    [deviceId],
  );

  return {
    success: true,
    telemetry: telemetryRows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      staffId: String(row.staff_id),
      clientEventId: String(row.client_event_id),
      eventType: String(row.event_type),
      payload: row.payload ?? {},
      observedAt: row.observed_at ? new Date(String(row.observed_at)).toISOString() : null,
      receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : null,
    })),
    locations: locationRows.map((row) => ({
      id: String(row.id),
      deviceId: String(row.device_id),
      staffId: String(row.staff_id),
      clientEventId: String(row.client_event_id),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracyM: row.accuracy_m == null ? null : Number(row.accuracy_m),
      altitudeM: row.altitude_m == null ? null : Number(row.altitude_m),
      speedMps: row.speed_mps == null ? null : Number(row.speed_mps),
      provider: String(row.provider ?? ""),
      observedAt: row.observed_at ? new Date(String(row.observed_at)).toISOString() : null,
      receivedAt: row.received_at ? new Date(String(row.received_at)).toISOString() : null,
    })),
  };
});
