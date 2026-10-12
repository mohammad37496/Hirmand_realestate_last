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
  await enforcePhoneBridgeRateLimit(event, "app-block-config", deviceId, { windowMs: 10 * 60 * 1000, maxHits: 60, blockMs: 10 * 60 * 1000 });
  const auth = await authenticateDevice(event, deviceId);
  if (auth.mode === "device") await requirePhoneBridgeSignedRequest(event, deviceId, Buffer.alloc(0));
  const sql = await getSql();
  const deviceRows = await sql.query<{ enabled: boolean; allowed_modules: unknown }>("select enabled,allowed_modules from phone_bridge_devices where id=$1 limit 1", [deviceId]);
  const device = deviceRows[0];
  if (!device) throw createError({ statusCode: 404, statusMessage: "دستگاه پیدا نشد." });
  const modules = device.allowed_modules && typeof device.allowed_modules === "object" ? device.allowed_modules as Record<string, unknown> : {};
  if (!device.enabled || modules.apps === false) return { enabled: false, rules: [] };
  const rows = await sql.query<Record<string, unknown>>("select id,package_name,label,enabled,days,start_time,end_time,start_date,end_date,message from phone_bridge_app_block_rules where device_id=$1 order by updated_at desc limit 200", [deviceId]);
  const daysOf = (value: unknown): number[] => {
    if (Array.isArray(value)) return value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6) : []; }
    catch { return []; }
  };
  return {
    enabled: true,
    rules: rows.map((row) => ({
      id: String(row.id),
      packageName: String(row.package_name ?? ""),
      label: String(row.label ?? ""),
      enabled: Boolean(row.enabled),
      days: daysOf(row.days),
      startTime: String(row.start_time ?? "00:00").slice(0, 5),
      endTime: String(row.end_time ?? "00:00").slice(0, 5),
      startDate: row.start_date ? String(row.start_date).slice(0, 10) : "",
      endDate: row.end_date ? String(row.end_date).slice(0, 10) : "",
      message: String(row.message ?? ""),
    })),
  };
});