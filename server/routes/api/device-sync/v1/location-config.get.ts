import { createError, defineEventHandler, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "پایگاه داده آماده نیست." });

  const deviceId = String(getQuery(event).deviceId ?? "").trim();
  if (!deviceId) throw createError({ statusCode: 400, statusMessage: "شناسه دستگاه ارسال نشده است." });

  await enforcePhoneBridgeRateLimit(event, "location-config", deviceId, {
    windowMs: 10 * 60 * 1000,
    maxHits: 60,
    blockMs: 10 * 60 * 1000,
  });

  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") await requirePhoneBridgeSignedRequest(event, deviceId, Buffer.alloc(0));

  const sql = await getSql();
  const rows = await sql.query<{
    device_enabled: boolean;
    tracking_enabled: boolean;
    interval_minutes: number;
    allowed_modules: unknown;
  }>(
    `select enabled as device_enabled,location_tracking_enabled as tracking_enabled,location_interval_minutes as interval_minutes,allowed_modules
     from phone_bridge_devices where id=$1 limit 1`,
    [deviceId],
  );
  const row = rows[0];
  if (!row) throw createError({ statusCode: 404, statusMessage: "دستگاه پیدا نشد." });

  const modules = row.allowed_modules && typeof row.allowed_modules === "object"
    ? row.allowed_modules as Record<string, unknown>
    : {};

  return {
    enabled: Boolean(row.device_enabled) && row.tracking_enabled === true && modules.location !== false,
    intervalMinutes: [5, 15, 30, 60].includes(Number(row.interval_minutes)) ? Number(row.interval_minutes) : 15,
  };
});
